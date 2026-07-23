// PayFlow SMT execution engine.
// Runs a workflow node-by-node, following edges and processing each node type.
import type {
  ExecutionResult,
  FlowEdge,
  FlowNode,
  LogEntry,
  NodeType,
  PaymentOutcome,
  WhatsAppSimMessage,
} from "@/lib/workflow-types";
import { compareValues, resolveTemplate } from "@/lib/workflow-types";
import { createServiceRoleClient } from "@/lib/supabase";

interface EngineOptions {
  // Tenant scope for catalog/order actions. Never take this from node data.
  clientId?: string | null;
  // Override the payment outcome for deterministic testing.
  forcePaymentOutcome?: PaymentOutcome;
  // Override the question response (mock user input).
  questionResponses?: Record<string, string>;
  // Max nodes to process (cycle protection).
  maxSteps?: number;
  // Message typed by the client in the WhatsApp simulator.
  // When set, the first `whatsapp` node that has an `outputVariable`
  // will use this as the inbound client reply (instead of the default).
  clientMessage?: string;
}

function nowIso() {
  return new Date().toISOString();
}

function findNextNode(
  currentId: string,
  edges: FlowEdge[],
  nodes: FlowNode[],
  handle?: string | null
): FlowNode | null {
  const matching = edges.filter(
    (e) => e.source === currentId && (handle ? (e.sourceHandle || "out") === handle : true)
  );
  // Prefer edges matching the explicit handle; fall back to any edge from this source.
  const edge = matching[0];
  if (!edge) return null;
  return nodes.find((n) => n.id === edge.target) ?? null;
}

function log(
  ctx: { log: LogEntry[] },
  entry: Omit<LogEntry, "timestamp">
) {
  ctx.log.push({ ...entry, timestamp: nowIso() });
}

// Mock payment outcome with realistic weights.
function mockPaymentOutcome(force?: PaymentOutcome): PaymentOutcome {
  if (force) return force;
  const r = Math.random();
  if (r < 0.65) return "payment_success";
  if (r < 0.8) return "payment_failed";
  if (r < 0.93) return "payment_pending";
  return "error";
}

export async function executeWorkflow(
  nodes: FlowNode[],
  edges: FlowEdge[],
  options: EngineOptions = {}
): Promise<ExecutionResult> {
  const ctx = {
    variables: {} as Record<string, unknown>,
    log: [] as LogEntry[],
    whatsappMessages: [] as WhatsAppSimMessage[],
    paymentOutcome: undefined as PaymentOutcome | undefined,
  };

  const maxSteps = options.maxSteps ?? 200;

  // Find the Start node.
  const startNode = nodes.find((n) => n.type === "start");
  if (!startNode) {
    log(ctx, {
      nodeId: "—",
      nodeType: "start",
      nodeLabel: "Start",
      status: "error",
      message: "No se encontró un nodo Inicio en el flujo.",
    });
    return {
      status: "failed",
      entries: ctx.log,
      variables: ctx.variables,
      whatsappMessages: ctx.whatsappMessages,
      error: "No Start node",
    };
  }

  let current: FlowNode | null = startNode;
  let steps = 0;
  const visited = new Set<string>();

  while (current && steps < maxSteps) {
    steps++;
    const node = current;
    const startedAt = Date.now();
    const data = node.data || {};
    const label = String(data.label || node.type);

    log(ctx, {
      nodeId: node.id,
      nodeType: node.type as NodeType,
      nodeLabel: label,
      status: "started",
      message: `Ejecutando ${label}`,
    });

    let nextHandle: string | null = "out";
    let shouldStop = false;
    let errorMsg: string | null = null;

    try {
      switch (node.type) {
        case "start": {
          const trigger = (data.trigger as string) || "manual";
          log(ctx, {
            nodeId: node.id,
            nodeType: node.type as NodeType,
            nodeLabel: label,
            status: "info",
            message: `Fluj disparado vía ${trigger}.`,
          });
          nextHandle = "out";
          break;
        }

        case "message": {
          const message = resolveTemplate(
            String(data.message || "¡Hola!"),
            ctx.variables
          );
          ctx.variables["last_message"] = message;
          log(ctx, {
            nodeId: node.id,
            nodeType: node.type as NodeType,
            nodeLabel: label,
            status: "success",
            message: `Mensaje preparado: "${message.slice(0, 80)}${message.length > 80 ? "…" : ""}"`,
            durationMs: Date.now() - startedAt,
          });
          nextHandle = "out";
          break;
        }

        case "question": {
          const question = resolveTemplate(
            String(data.question || "Por favor responde."),
            ctx.variables
          );
          const variable = String(data.variable || "user_response");
          const override = options.questionResponses?.[variable];
          const response =
            override ??
            (data.defaultResponse
              ? resolveTemplate(String(data.defaultResponse), ctx.variables)
              : "sí");
          ctx.variables[variable] = response;
          // Also push the inbound reply into the WhatsApp simulator if we have a phone context.
          if (ctx.whatsappMessages.length > 0) {
            const lastPhone = ctx.whatsappMessages[ctx.whatsappMessages.length - 1].phone;
            ctx.whatsappMessages.push({
              id: `${node.id}-in-${Date.now()}`,
              direction: "inbound",
              phone: lastPhone,
              text: response,
              timestamp: nowIso(),
              nodeId: node.id,
            });
          }
          log(ctx, {
            nodeId: node.id,
            nodeType: node.type as NodeType,
            nodeLabel: label,
            status: "success",
            message: `Preguntado: "${question}" → capturado "${response}" en {{${variable}}}`,
            durationMs: Date.now() - startedAt,
          });
          nextHandle = "out";
          break;
        }

        case "condition": {
          const variable = String(data.variable || "");
          const operator = (data.operator as "equals" | "not_equals" | "contains" | "greater_than" | "less_than") || "equals";
          const value = String(data.value ?? "");
          const left = ctx.variables[variable];

          // ─── Payment status branching (4-way) ──────────────────────
          // When the condition variable is payment_status or payment_outcome,
          // the node acts as a 4-way branch: the nextHandle is the actual
          // payment outcome value (payment_success, payment_failed,
          // payment_pending, or error), matching the 4 output handles.
          if (
            (variable === "payment_status" || variable === "payment_outcome") &&
            typeof left === "string" &&
            left &&
            (left === "payment_success" || left === "payment_failed" || left === "payment_pending" || left === "error")
          ) {
            log(ctx, {
              nodeId: node.id,
              nodeType: node.type as NodeType,
              nodeLabel: label,
              status: "success",
              message: `Estado del pago: ${left} → bifurcación a ${left}`,
              durationMs: Date.now() - startedAt,
            });
            nextHandle = left;
            break;
          }

          // ─── Standard 2-way condition (true/false) ─────────────────
          const result = compareValues(left, operator, value);
          log(ctx, {
            nodeId: node.id,
            nodeType: node.type as NodeType,
            nodeLabel: label,
            status: "success",
            message: `Condición {{${variable}}} (${JSON.stringify(left)}) ${operator} "${value}" → ${result}`,
            durationMs: Date.now() - startedAt,
          });
          nextHandle = result ? "true" : "false";
          break;
        }

        case "whatsapp": {
          const phone = resolveTemplate(
            String(data.phoneNumber || "+15551234567"),
            ctx.variables
          );
          const message = resolveTemplate(
            String(data.message || "¡Hola desde PayFlow SMT!"),
            ctx.variables
          );
          ctx.whatsappMessages.push({
            id: `${node.id}-out-${Date.now()}`,
            direction: "outbound",
            phone,
            text: message,
            timestamp: nowIso(),
            nodeId: node.id,
          });
          ctx.variables["last_whatsapp_phone"] = phone;
          ctx.variables["last_whatsapp_message"] = message;
          // Si el nodo WhatsApp tiene una variable de salida configurada,
          // captura la respuesta simulada/recibida del cliente en esa variable.
          // Esto permite encadenar WhatsApp → Agente IA pasándole la respuesta.
          const outputVariable = String(data.outputVariable || "");
          if (outputVariable) {
            // Priority: clientMessage (simulator) > questionResponses > defaultResponse > "sí"
            const override = options.questionResponses?.[outputVariable];
            const reply =
              options.clientMessage ??
              override ??
              (data.defaultResponse
                ? resolveTemplate(String(data.defaultResponse), ctx.variables)
                : "sí");
            // Mark that the clientMessage has been consumed so subsequent
            // whatsapp nodes in the same run fall back to default behavior.
            if (options.clientMessage) options.clientMessage = undefined;
            ctx.variables[outputVariable] = reply;
            // Registrar la respuesta entrante en el simulador de WhatsApp
            ctx.whatsappMessages.push({
              id: `${node.id}-in-${Date.now()}`,
              direction: "inbound",
              phone,
              text: reply,
              timestamp: nowIso(),
              nodeId: node.id,
            });
            ctx.variables["last_user_response"] = reply;
            log(ctx, {
              nodeId: node.id,
              nodeType: node.type as NodeType,
              nodeLabel: label,
              status: "info",
              message: `Respuesta del cliente recibida: "${reply}" → guardada en {{${outputVariable}}}`,
              durationMs: Date.now() - startedAt,
            });
            log(ctx, {
              nodeId: node.id,
              nodeType: node.type as NodeType,
              nodeLabel: label,
              status: "success",
              message: `Nodo ejecutado. Enviado: "${message.slice(0, 60)}${message.length > 60 ? "…" : ""}" · {{${outputVariable}}}="${reply.slice(0, 40)}"`,
              durationMs: Date.now() - startedAt,
            });
          } else {
            log(ctx, {
              nodeId: node.id,
              nodeType: node.type as NodeType,
              nodeLabel: label,
              status: "success",
              message: `Nodo ejecutado. Mensaje enviado a ${phone}: "${message.slice(0, 60)}${message.length > 60 ? "…" : ""}"`,
              durationMs: Date.now() - startedAt,
            });
          }
          nextHandle = "out";
          break;
        }

        case "catalog_search": {
          const outputVariable = String(data.outputVariable || "catalog_product");
          const query = resolveTemplate(String(data.query || ""), ctx.variables).trim();
          if (!options.clientId) {
            ctx.variables[outputVariable] = null;
            errorMsg = "El flujo no tiene un negocio asociado para consultar el catálogo.";
            log(ctx, { nodeId: node.id, nodeType: node.type, nodeLabel: label, status: "error", message: errorMsg, durationMs: Date.now() - startedAt });
            nextHandle = "error";
            break;
          }
          if (query.length < 2) {
            ctx.variables[outputVariable] = null;
            log(ctx, { nodeId: node.id, nodeType: node.type, nodeLabel: label, status: "info", message: "La búsqueda del catálogo necesita al menos 2 caracteres.", durationMs: Date.now() - startedAt });
            nextHandle = "not_found";
            break;
          }
          const safeQuery = query.replace(/[%_,()]/g, " ").trim();
          const supabase = createServiceRoleClient();
          const { data: product, error } = await supabase
            .from("catalog_products")
            .select("id, name, description, sku, price, currency, stock, track_inventory, image_url")
            .eq("client_id", options.clientId)
            .eq("active", true)
            .or(`name.ilike.%${safeQuery}%,sku.ilike.%${safeQuery}%`)
            .limit(1)
            .maybeSingle();
          if (error) {
            ctx.variables[outputVariable] = null;
            log(ctx, { nodeId: node.id, nodeType: node.type, nodeLabel: label, status: "error", message: "No se pudo consultar el catálogo.", durationMs: Date.now() - startedAt });
            nextHandle = "error";
            break;
          }
          if (!product) {
            ctx.variables[outputVariable] = null;
            log(ctx, { nodeId: node.id, nodeType: node.type, nodeLabel: label, status: "info", message: `No se encontró un producto activo para “${query}”.`, durationMs: Date.now() - startedAt });
            nextHandle = "not_found";
            break;
          }
          const catalogProduct = {
            id: String(product.id),
            name: String(product.name),
            description: String(product.description || ""),
            sku: String(product.sku || ""),
            price: Number(product.price || 0),
            currency: String(product.currency || "USD"),
            available: product.track_inventory === false || Number(product.stock || 0) > 0,
            image_url: String(product.image_url || ""),
          };
          ctx.variables[outputVariable] = catalogProduct;
          ctx.variables[`${outputVariable}_name`] = catalogProduct.name;
          ctx.variables[`${outputVariable}_price`] = catalogProduct.price;
          ctx.variables[`${outputVariable}_available`] = catalogProduct.available;
          log(ctx, { nodeId: node.id, nodeType: node.type, nodeLabel: label, status: "success", message: `Producto encontrado: ${catalogProduct.name} · ${catalogProduct.price.toFixed(2)} ${catalogProduct.currency}.`, durationMs: Date.now() - startedAt });
          nextHandle = "found";
          break;
        }

        case "update_order": {
          const orderId = resolveTemplate(String(data.orderId || ""), ctx.variables).trim();
          const orderStatus = String(data.orderStatus || "confirmed");
          if (!options.clientId || !orderId) {
            errorMsg = !options.clientId ? "El flujo no tiene un negocio asociado." : "Falta el ID del pedido.";
            log(ctx, { nodeId: node.id, nodeType: node.type, nodeLabel: label, status: "error", message: errorMsg, durationMs: Date.now() - startedAt });
            nextHandle = "error";
            break;
          }
          const supabase = createServiceRoleClient();
          const { error } = await supabase.rpc("update_catalog_order_status", {
            p_client_id: options.clientId,
            p_order_id: orderId,
            p_status: orderStatus,
            p_payment_status: null,
          });
          if (error) {
            log(ctx, { nodeId: node.id, nodeType: node.type, nodeLabel: label, status: "error", message: `No se pudo actualizar el pedido: ${error.message}`, durationMs: Date.now() - startedAt });
            nextHandle = "error";
            break;
          }
          ctx.variables["order_id"] = orderId;
          ctx.variables["order_status"] = orderStatus;
          log(ctx, { nodeId: node.id, nodeType: node.type, nodeLabel: label, status: "success", message: `Pedido ${orderId} actualizado a ${orderStatus}.`, durationMs: Date.now() - startedAt });
          nextHandle = "out";
          break;
        }

        case "payment":
        case "create_payment": {
          const provider = String(data.provider || "Mock");
          const amount = Number(data.amount ?? 0);
          const currency = String(data.currency || "USD");
          const description = resolveTemplate(
            String(data.description || "Pago"),
            ctx.variables
          );
          const customer = resolveTemplate(
            String(data.customer || ""),
            ctx.variables
          );
          const phone = resolveTemplate(
            String(data.phoneNumber || ""),
            ctx.variables
          );
          const orderId = resolveTemplate(
            String(data.orderId || `ord_${Date.now()}`),
            ctx.variables
          );
          const outcome = mockPaymentOutcome(options.forcePaymentOutcome);
          ctx.paymentOutcome = outcome;
          // Regla: solo el nodo Pago o un Webhook pueden establecer payment_success.
          ctx.variables["payment_outcome"] = outcome;
          ctx.variables["payment_status"] = outcome;
          ctx.variables["payment_amount"] = amount;
          ctx.variables["payment_currency"] = currency;
          ctx.variables["payment_order_id"] = orderId;
          ctx.variables["payment_provider"] = provider;
          ctx.variables["payment_url"] =
            outcome === "error"
              ? ""
              : `https://pay.payflow.smt/${orderId}`;
          const statusMsg =
            outcome === "payment_success"
              ? `Pago de ${amount} ${currency} exitoso vía ${provider}.`
              : outcome === "payment_failed"
              ? `Pago de ${amount} ${currency} rechazado vía ${provider}.`
              : outcome === "payment_pending"
              ? `Pago de ${amount} ${currency} pendiente vía ${provider}.`
              : `Error del procesador de pagos (${provider}) para ${amount} ${currency}.`;
          log(ctx, {
            nodeId: node.id,
            nodeType: node.type as NodeType,
            nodeLabel: label,
            status: outcome === "error" ? "error" : "success",
            message: `${statusMsg} Pedido ${orderId}${customer ? ` · cliente: ${customer}` : ""}${phone ? ` · WhatsApp: ${phone}` : ""} → bifurcación a ${outcome}`,
            durationMs: Date.now() - startedAt,
          });
          nextHandle = outcome;

          // ─── Support "out" handle for create_payment ────────────────
          // If there's an edge with sourceHandle="out" from this node,
          // use "out" instead of the outcome. This allows the pattern:
          //   create_payment (out) → condition (payment_status 4-way) → whatsapp-*
          // If no "out" edge exists, fall back to the outcome handle
          // (direct 4-way branching from create_payment).
          const hasOutEdge = edges.some(
            (e) => e.source === node.id && (e.sourceHandle || null) === "out"
          );
          if (hasOutEdge) {
            nextHandle = "out";
          }
          break;
        }

        case "verify_payment": {
          const orderId = resolveTemplate(
            String(data.orderId || (ctx.variables["payment_order_id"] as string) || ""),
            ctx.variables
          );
          const currentStatus = (ctx.variables["payment_status"] as string) || "desconocido";
          const outputVariable = String(data.outputVariable || "payment_status");
          ctx.variables[outputVariable] = currentStatus;
          log(ctx, {
            nodeId: node.id,
            nodeType: node.type as NodeType,
            nodeLabel: label,
            status: "success",
            message: `Verificación del pedido ${orderId || "(sin ID)"}: estado actual = ${currentStatus}`,
            durationMs: Date.now() - startedAt,
          });
          nextHandle =
            currentStatus === "payment_success" ||
            currentStatus === "payment_failed" ||
            currentStatus === "payment_pending" ||
            currentStatus === "error"
              ? currentStatus
              : "error";
          break;
        }

        case "wait_confirmation": {
          const timeout = Number(data.timeout ?? 30);
          log(ctx, {
            nodeId: node.id,
            nodeType: node.type as NodeType,
            nodeLabel: label,
            status: "info",
            message: `Esperando confirmación del webhook (timeout simulado: ${timeout}s). Estado actual: ${ctx.variables["payment_status"] ?? "—"}`,
            durationMs: Date.now() - startedAt,
          });
          ctx.variables["confirmation_waited"] = true;
          nextHandle = "out";
          break;
        }

        case "payment_success":
        case "payment_failed":
        case "payment_pending": {
          const outcome = node.type as PaymentOutcome;
          // Estos nodos establecen explícitamente el estado del pago.
          ctx.paymentOutcome = outcome;
          ctx.variables["payment_outcome"] = outcome;
          ctx.variables["payment_status"] = outcome;
          const statusLabel =
            outcome === "payment_success"
              ? "exitoso"
              : outcome === "payment_failed"
              ? "fallido"
              : "pendiente";
          log(ctx, {
            nodeId: node.id,
            nodeType: node.type as NodeType,
            nodeLabel: label,
            status: "success",
            message: `Estado del pago establecido en ${statusLabel} (${outcome}).`,
            durationMs: Date.now() - startedAt,
          });
          nextHandle = "out";
          break;
        }

        case "ai_agent": {
          const systemPrompt =
            String(data.systemPrompt || "Eres un asistente útil.");
          const inputVar = String(data.inputVariable || "");
          const inputText = inputVar ? ctx.variables[inputVar] : undefined;
          const prompt = resolveTemplate(
            String(data.prompt || "Hola"),
            ctx.variables
          ) + (inputText ? `\n\nEntrada: ${String(inputText)}` : "");
          let outputVariable = String(data.outputVariable || "ai_response");
          // Regla: la IA NO puede confirmar pagos. No se le permite escribir
          // en payment_status ni payment_outcome.
          const PROTECTED = new Set(["payment_status", "payment_outcome"]);
          if (PROTECTED.has(outputVariable)) {
            log(ctx, {
              nodeId: node.id,
              nodeType: node.type as NodeType,
              nodeLabel: label,
              status: "info",
              message: `Variable de salida protegida "${outputVariable}". La IA no puede confirmar pagos; redirigiendo a "ai_response".`,
            });
            outputVariable = "ai_response";
          }
          let aiContent = "";

          // ─── Dynamic AI provider routing ────────────────────────────
          // Reads AI_PROVIDER env var and routes to the correct provider.
          // Supported: "openrouter", "zai", "mock" (default).
          const aiProvider = (process.env.AI_PROVIDER || "mock").toLowerCase();

          // Resolve provider config based on AI_PROVIDER.
          let providerName: string;
          let apiKey: string | undefined;
          let baseUrl: string;
          let model: string;
          let endpoint: string;

          if (aiProvider === "openrouter") {
            providerName = "openrouter";
            apiKey = process.env.OPENROUTER_API_KEY;
            baseUrl = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
            model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.2-3b-instruct:free";
            endpoint = `${baseUrl}/chat/completions`;
          } else if (aiProvider === "zai") {
            providerName = "zai";
            apiKey = process.env.ZAI_API_KEY;
            baseUrl = process.env.ZAI_BASE_URL || "https://api.z.ai/api/coding/paas/v4";
            model = process.env.ZAI_MODEL || "glm-5.1";
            endpoint = `${baseUrl}/chat/completions`;
          } else {
            providerName = "mock";
            apiKey = undefined;
            baseUrl = "";
            model = "mock";
            endpoint = "";
          }

          console.log("[engine] AI agent execution:", {
            provider: providerName,
            model,
            endpoint,
            hasApiKey: !!apiKey,
          });

          // Detect the client's intent from their message.
          // This is used to branch the flow (buy vs info) and to produce
          // a contextual mock response when no real AI provider is configured.
          const clientText = String(inputText ?? "").toLowerCase();
          const intent = detectIntent(clientText);

          // Build a system prompt that includes the demo catalog so the IA
          // (real or mock) can answer questions about products and prices.
          const catalogContext = buildCatalogContext();
          const fullSystemPrompt = `${systemPrompt}\n\n${catalogContext}`;

          if (providerName === "mock") {
            // Mock provider — produce a contextual response based on intent
            // and the demo catalog (no external call, works offline).
            aiContent = buildMockResponse(intent, clientText);
            log(ctx, {
              nodeId: node.id,
              nodeType: node.type as NodeType,
              nodeLabel: label,
              status: "info",
              message: `AI_PROVIDER=mock. Intención detectada: "${intent}". Respuesta contextual generada con catálogo demo (sin IA real).`,
              durationMs: Date.now() - startedAt,
            });
          } else if (!apiKey) {
            // Missing API key for the selected provider.
            const keyName = providerName === "openrouter" ? "OPENROUTER_API_KEY" : "ZAI_API_KEY";
            aiContent = buildMockResponse(intent, clientText);
            log(ctx, {
              nodeId: node.id,
              nodeType: node.type as NodeType,
              nodeLabel: label,
              status: "error",
              message: `Falta ${keyName} en las variables de entorno. Se usó respuesta contextual mock.`,
              durationMs: Date.now() - startedAt,
            });
          } else {
            // Call the selected provider via OpenAI-compatible Chat Completions.
            try {
              const res = await fetch(endpoint, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                  ...(providerName === "openrouter" && {
                    "HTTP-Referer": "https://payflow-smt.vercel.app",
                    "X-Title": "PayFlow SMT",
                  }),
                },
                body: JSON.stringify({
                  model,
                  messages: [
                    { role: "system", content: fullSystemPrompt },
                    { role: "user", content: prompt },
                  ],
                  temperature: 0.3,
                }),
                cache: "no-store",
              });

              if (!res.ok) {
                const errText = await res.text().catch(() => "");
                console.error(`[engine] ${providerName} API error:`, {
                  provider: providerName,
                  status: res.status,
                  statusText: res.statusText,
                  body: errText.slice(0, 500),
                });

                // Build a short, clear error message based on HTTP status.
                let shortMsg: string;
                if (res.status === 401 || res.status === 403) {
                  shortMsg = providerName === "openrouter"
                    ? "OPENROUTER_API_KEY inválida o sin permisos. Verifica tu API key en Vercel."
                    : "ZAI_API_KEY inválida o sin permisos. Verifica tu API key en Vercel.";
                } else if (res.status === 429) {
                  shortMsg = providerName === "openrouter"
                    ? "Límite de uso alcanzado en OpenRouter. Intenta nuevamente más tarde."
                    : "Saldo insuficiente en Z.ai. Recarga tu cuenta en z.ai para usar la IA real.";
                } else if (res.status === 404) {
                  shortMsg = `Modelo "${model}" no encontrado en ${providerName}. Verifica la variable de modelo en Vercel.`;
                } else if (res.status >= 500) {
                  shortMsg = `${providerName} no disponible (HTTP ${res.status}). Intenta nuevamente.`;
                } else {
                  shortMsg = `Falló ${providerName} (HTTP ${res.status}).`;
                }

                aiContent = buildMockResponse(intent, clientText);
                log(ctx, {
                  nodeId: node.id,
                  nodeType: node.type as NodeType,
                  nodeLabel: label,
                  status: "error",
                  message: `${shortMsg} Se usó respuesta contextual mock.`,
                  durationMs: Date.now() - startedAt,
                });
              } else {
                const data = await res.json();
                aiContent = data?.choices?.[0]?.message?.content || buildMockResponse(intent, clientText);

                console.log(`[engine] ${providerName} success:`, {
                  provider: providerName,
                  model,
                  httpStatus: res.status,
                  responseLength: aiContent.length,
                  responsePreview: aiContent.slice(0, 100),
                });
              }
            } catch (err) {
              console.error(`[engine] ${providerName} fetch failed:`, err instanceof Error ? err.message : String(err));
              // Network error — use mock fallback so the flow continues.
              aiContent = buildMockResponse(intent, clientText);
              log(ctx, {
                nodeId: node.id,
                nodeType: node.type as NodeType,
                nodeLabel: label,
                status: "error",
                message: `No se pudo conectar con ${providerName} (error de red). Se usó respuesta contextual mock.`,
                durationMs: Date.now() - startedAt,
              });
            }
          }

          ctx.variables[outputVariable] = aiContent;
          ctx.variables["last_ai_response"] = aiContent;
          ctx.variables["ai_intent"] = intent;
          // Log detallado: entrada recibida y resultado generado
          if (inputVar) {
            log(ctx, {
              nodeId: node.id,
              nodeType: node.type as NodeType,
              nodeLabel: label,
              status: "info",
              message: `Entrada recibida: {{${inputVar}}}="${String(inputText ?? "").slice(0, 60)}"`,
              durationMs: Date.now() - startedAt,
            });
          }
          log(ctx, {
            nodeId: node.id,
            nodeType: node.type as NodeType,
            nodeLabel: label,
            status: "success",
            message: `Nodo ejecutado. Intención: "${intent}". Resultado: {{${outputVariable}}}="${aiContent.slice(0, 60)}${aiContent.length > 60 ? "…" : ""}" (${aiContent.length} caracteres)`,
            durationMs: Date.now() - startedAt,
          });
          // Branch: "out" = buy intent, "info" = info/catalog only.
          // Falls back to "out" if no "info" edge exists (backward compatible).
          const hasInfoEdge = edges.some(
            (e) => e.source === node.id && (e.sourceHandle || null) === "info"
          );
          nextHandle = intent === "buy" || !hasInfoEdge ? "out" : "info";
          break;
        }

        case "api": {
          const url = resolveTemplate(String(data.url || ""), ctx.variables);
          const method = (String(data.method || "GET").toUpperCase()) as
            | "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
          let headers: Record<string, string> = {};
          if (data.headers) {
            try {
              headers = JSON.parse(String(data.headers));
            } catch {
              // ignore malformed headers
            }
          }
          const rawBody = data.body
            ? resolveTemplate(String(data.body), ctx.variables)
            : undefined;
          const outputVariable = String(data.outputVariable || "api_response");
          let responseSummary = "";
          let responseData: unknown = null;
          try {
            const res = await fetch(url, {
              method,
              headers,
              body: ["POST", "PUT", "PATCH"].includes(method) && rawBody ? rawBody : undefined,
            });
            const text = await res.text();
            try {
              responseData = JSON.parse(text);
            } catch {
              responseData = text;
            }
            responseSummary = `HTTP ${res.status} ${res.statusText}`;
            ctx.variables[outputVariable] = responseData;
            ctx.variables["last_api_status"] = res.status;
            log(ctx, {
              nodeId: node.id,
              nodeType: node.type as NodeType,
              nodeLabel: label,
              status: res.ok ? "success" : "error",
              message: `${method} ${url} → ${responseSummary}`,
              durationMs: Date.now() - startedAt,
            });
          } catch (err) {
            ctx.variables[outputVariable] = null;
            errorMsg = `Falló la petición API: ${err instanceof Error ? err.message : String(err)}`;
            log(ctx, {
              nodeId: node.id,
              nodeType: node.type as NodeType,
              nodeLabel: label,
              status: "error",
              message: errorMsg,
              durationMs: Date.now() - startedAt,
            });
          }
          nextHandle = "out";
          break;
        }

        case "end": {
          const message = resolveTemplate(
            String(data.message || "Fluj finalizado."),
            ctx.variables
          );
          log(ctx, {
            nodeId: node.id,
            nodeType: node.type as NodeType,
            nodeLabel: label,
            status: "success",
            message: `Fluj finalizado. ${message}`,
            durationMs: Date.now() - startedAt,
          });
          shouldStop = true;
          break;
        }

        default: {
          log(ctx, {
            nodeId: node.id,
            nodeType: node.type as NodeType,
            nodeLabel: label,
            status: "error",
            message: `Tipo de nodo desconocido: ${node.type}`,
          });
          shouldStop = true;
        }
      }
    } catch (err) {
      log(ctx, {
        nodeId: node.id,
        nodeType: node.type as NodeType,
        nodeLabel: label,
        status: "error",
        message: `Error inesperado: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - startedAt,
      });
      return {
        status: "failed",
        entries: ctx.log,
        variables: ctx.variables,
        whatsappMessages: ctx.whatsappMessages,
        finalNode: node.id,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    if (shouldStop) {
      return {
        status: "success",
        entries: ctx.log,
        variables: ctx.variables,
        whatsappMessages: ctx.whatsappMessages,
        finalNode: node.id,
      };
    }

    // Cycle protection: if we revisit the same node with the same handle too many times, stop.
    const visitKey = `${node.id}:${nextHandle}`;
    if (visited.has(visitKey)) {
      // Allow re-visits but rely on maxSteps to break true infinite loops.
    }
    visited.add(visitKey);

    current = findNextNode(node.id, edges, nodes, nextHandle);
    if (!current) {
      log(ctx, {
        nodeId: node.id,
        nodeType: node.type as NodeType,
        nodeLabel: label,
        status: "error",
        message: `No hay conexión saliente desde el conector "${nextHandle}". El flujo es inválido.`,
      });
      return {
        status: "failed",
        entries: ctx.log,
        variables: ctx.variables,
        whatsappMessages: ctx.whatsappMessages,
        finalNode: node.id,
        error: `Salida sin conectar: ${nextHandle}`,
      };
    }
  }

  if (steps >= maxSteps) {
    log(ctx, {
      nodeId: "—",
      nodeType: "end",
      nodeLabel: "Motor",
      status: "error",
      message: `Ejecución detenida: se alcanzó el máximo de pasos (${maxSteps}). Posible bucle infinito.`,
    });
    return {
      status: "stopped",
      entries: ctx.log,
      variables: ctx.variables,
      whatsappMessages: ctx.whatsappMessages,
      error: "Máximo de pasos alcanzado",
    };
  }

  return {
    status: "success",
    entries: ctx.log,
    variables: ctx.variables,
    whatsappMessages: ctx.whatsappMessages,
  };
}

// ─── AI intent detection & catalog helpers ────────────────────────────
// Used by the ai_agent node to branch the flow (buy vs info) and to
// produce contextual responses when no real AI provider is configured.

export type AiIntent = "buy" | "info" | "greeting";

/**
 * Demo catalog embedded in code so the simulator can answer product/pricing
 * questions without a database. Real deployments can override this by
 * configuring a real AI provider (the catalog context is injected into the
 * system prompt so the IA can use the business's actual catalog).
 */
const DEMO_CATALOG = [
  { name: "Almuerzo del día", description: "Sopa, segundo y jugo natural.", price: 3.5, currency: "USD" },
  { name: "Hamburguesa clásica", description: "Carne 150g, queso, lechuga, tomate y papas.", price: 5.0, currency: "USD" },
  { name: "Pollo a la plancha", description: "Pechuga a la plancha con ensalada y arroz.", price: 6.5, currency: "USD" },
  { name: "Ensalada César", description: "Lechuga, pollo, crutones, parmesano y aderezo César.", price: 4.5, currency: "USD" },
  { name: "Lasaña de carne", description: "Capas de pasta, carne boloñesa y queso gratinado.", price: 5.5, currency: "USD" },
  { name: "Jugo natural", description: "Naranja, maracuyá o mora. 350ml.", price: 1.5, currency: "USD" },
];

/**
 * Detect the client's intent from their message.
 * - "buy": explicit purchase intent (quiero comprar, pagar, llevar, pedir, cuánto cuesta + producto)
 * - "info": questions about products, prices, menu, hours, location
 * - "greeting": hola, buenas, etc.
 */
function detectIntent(text: string): AiIntent {
  const t = text.toLowerCase().trim();
  if (!t) return "greeting";

  // Buy signals
  const buyKeywords = [
    "comprar", "pagar", "llevar", "pedir", "ordenar", "quiero el", "quiero la",
    "deseo", "reservar", "separar", "facturar", "transferir", "tarjeta",
    "cómo pago", "como pago", "link de pago", "link pago",
  ];
  // Info signals
  const infoKeywords = [
    "qué", "que", "cuánto", "cuanto", "precio", "precios", "menú", "menu",
    "platos", "plato", "carta", "tienen", "hay", "disponible", "horario",
    "horarios", "dónde", "donde", "ubicación", "ubicacion", "ayuda", "info",
    "información", "informacion", "quién", "quien", "cuál", "cual",
  ];
  const greetingKeywords = ["hola", "buenas", "buenos días", "buenas tardes", "buenas noches", "saludos"];

  if (greetingKeywords.some((k) => t.includes(k)) && t.length < 25) {
    return "greeting";
  }
  if (buyKeywords.some((k) => t.includes(k))) {
    return "buy";
  }
  if (infoKeywords.some((k) => t.includes(k))) {
    return "info";
  }
  // Default: treat short affirmative answers as buy intent, else info.
  const affirmative = ["sí", "si", "claro", "obvio", "de acuerdo", "adelante"];
  if (affirmative.some((k) => t === k)) return "buy";
  return "info";
}

/** Build a catalog context string to inject into the system prompt. */
function buildCatalogContext(): string {
  const lines = DEMO_CATALOG.map(
    (p) => `- ${p.name}: ${p.description} · ${p.price.toFixed(2)} ${p.currency}`
  ).join("\n");
  return `Catálogo del negocio (usa esta información para responder):\n${lines}`;
}

/**
 * Build a contextual mock response based on the detected intent.
 * This replaces the old "Confirmo que deseas continuar con el pago."
 * which was always returned regardless of the client's message.
 */
function buildMockResponse(intent: AiIntent, clientText: string): string {
  if (intent === "greeting") {
    return "¡Hola! 👋 Soy el asistente virtual. ¿En qué puedo ayudarte hoy? Puedes preguntarme por nuestros platos, precios o realizar un pedido.";
  }
  if (intent === "info") {
    // If the client asks about prices/products, list the catalog.
    const catalogLines = DEMO_CATALOG.map(
      (p) => `• ${p.name} — ${p.price.toFixed(2)} ${p.currency} (${p.description})`
    ).join("\n");
    return `Claro, aquí tienes nuestro menú de hoy:\n\n${catalogLines}\n\n¿Te gustaría realizar un pedido? Escríbeme "quiero pedir" y lo gestiono enseguida.`;
  }
  // buy intent — confirm the purchase intent and hand off to payment.
  return `¡Perfecto! Para procesar tu pedido, te generaré un link seguro de pago. Cuando lo completes, confirmaremos tu transacción. 🛒`;
}

