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

interface EngineOptions {
  // Override the payment outcome for deterministic testing.
  forcePaymentOutcome?: PaymentOutcome;
  // Override the question response (mock user input).
  questionResponses?: Record<string, string>;
  // Max nodes to process (cycle protection).
  maxSteps?: number;
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
    (e) => e.source === currentId && (handle ? e.sourceHandle === handle : true)
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
            const override = options.questionResponses?.[outputVariable];
            const reply =
              override ??
              (data.defaultResponse
                ? resolveTemplate(String(data.defaultResponse), ctx.variables)
                : "sí");
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
          nextHandle = "out";
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
          try {
            const ZAIModule = await import("z-ai-web-dev-sdk");
            const ZAI = ZAIModule.default;
            const zai = await ZAI.create();
            const completion = await zai.chat.completions.create({
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt },
              ],
              thinking: { type: "disabled" },
            });
            aiContent = completion.choices[0]?.message?.content || "";
          } catch (err) {
            aiContent = `[Error de IA: ${err instanceof Error ? err.message : "desconocido"}]`;
            log(ctx, {
              nodeId: node.id,
              nodeType: node.type as NodeType,
              nodeLabel: label,
              status: "error",
              message: `Falló la llamada al Agente IA: ${err instanceof Error ? err.message : String(err)}`,
              durationMs: Date.now() - startedAt,
            });
          }
          ctx.variables[outputVariable] = aiContent;
          ctx.variables["last_ai_response"] = aiContent;
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
            message: `Nodo ejecutado. Resultado generado: {{${outputVariable}}}="${aiContent.slice(0, 60)}${aiContent.length > 60 ? "…" : ""}" (${aiContent.length} caracteres)`,
            durationMs: Date.now() - startedAt,
          });
          nextHandle = "out";
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
        status: "info",
        message: `No hay conexión saliente desde el conector "${nextHandle}". Fluj finalizado.`,
      });
      return {
        status: "success",
        entries: ctx.log,
        variables: ctx.variables,
        whatsappMessages: ctx.whatsappMessages,
        finalNode: node.id,
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
