import "server-only";

import {
  executeWorkflow as executeLegacyWorkflow,
  type AiDeliveryMode,
  type GeminiEngineOptions,
} from "./engine-gemini";
import {
  answerUsesOnlyKnownMoney,
  appendUniversalTurn,
  applyUniversalCartActions,
  buildUniversalPlannerPayload,
  buildUniversalValidatedFacts,
  emptyUniversalAgentState,
  normalizePlannerDecision,
  normalizeUniversalAgentState,
  sanitizeUniversalAnswer,
  type UniversalAgentState,
  type UniversalPlannerDecision,
} from "./universal-agent-contract";
import {
  classifyUniversalIntent,
  composeUniversalSafeAnswer,
  resolveUniversalPlannerDecision,
} from "./universal-intent-engine";
import { loadUniversalBusinessContext } from "./universal-business-context-server";
import type {
  ExecutionResult,
  FlowEdge,
  FlowNode,
  LogEntry,
  WhatsAppSimMessage,
} from "./workflow-types";

export type { AiDeliveryMode, GeminiEngineOptions };

const STATE_KEY = "__payflow_simulator_state";
const PLANNER_MAX_TOKENS = 850;
const RESPONSE_MAX_TOKENS = 380;

function nowIso() {
  return new Date().toISOString();
}

function entry(input: Omit<LogEntry, "timestamp">): LogEntry {
  return { ...input, timestamp: nowIso() };
}

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readSimulatorState(options: GeminiEngineOptions): unknown {
  const raw = options.questionResponses?.[STATE_KEY];
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function withoutInternalState(options: GeminiEngineOptions): GeminiEngineOptions {
  const responses = { ...(options.questionResponses || {}) };
  delete responses[STATE_KEY];
  return {
    ...options,
    questionResponses: Object.keys(responses).length ? responses : undefined,
  };
}

function extractGeminiText(payload: unknown): string {
  const root = safeRecord(payload);
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  const texts: string[] = [];
  for (const rawCandidate of candidates) {
    const candidate = safeRecord(rawCandidate);
    const content = safeRecord(candidate.content);
    const parts = Array.isArray(content.parts) ? content.parts : [];
    for (const rawPart of parts) {
      const text = String(safeRecord(rawPart).text || "").trim();
      if (text) texts.push(text);
    }
  }
  return texts.join("\n").trim();
}

function parseJsonObject(text: string): Record<string, unknown> {
  const clean = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return safeRecord(JSON.parse(clean));
  } catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return safeRecord(JSON.parse(clean.slice(start, end + 1)));
    }
    throw new Error("El modelo no devolvió JSON válido.");
  }
}

async function callGeminiJson(input: {
  system: string;
  user: string;
  maxOutputTokens: number;
}): Promise<{ data: Record<string, unknown>; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY.");

  const configuredModel = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const models = Array.from(new Set([configuredModel, "gemini-2.5-flash"]));
  let lastError = "Gemini no pudo procesar la solicitud.";

  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: [{ role: "user", parts: [{ text: input.user }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: input.maxOutputTokens,
            responseMimeType: "application/json",
          },
        }),
        cache: "no-store",
        signal: controller.signal,
      });

      if (response.ok) {
        const payload = await response.json();
        const text = extractGeminiText(payload);
        if (!text) throw new Error("Gemini no devolvió contenido.");
        return { data: parseJsonObject(text), model };
      }

      if (response.status === 404) {
        lastError = `El modelo ${model} no está disponible.`;
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error("GEMINI_API_KEY inválida o sin permisos.");
      }
      if (response.status === 429) {
        throw new Error("Gemini alcanzó el límite de cuota.");
      }
      lastError = `Gemini respondió HTTP ${response.status}.`;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        lastError = `Gemini tardó demasiado con ${model}.`;
      } else if (error instanceof Error) {
        lastError = error.message;
        if (/GEMINI_API_KEY|cuota|HTTP/.test(error.message)) throw error;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(lastError);
}

const PLANNER_SYSTEM = `Eres el clasificador semántico de un motor comercial universal para cualquier tipo de negocio.
No dependas de plantillas por industria. Usa el mensaje, la conversación, las ofertas y la configuración real.

Devuelve exclusivamente JSON:
{
  "intent": "greeting|discover_offerings|query_offering|query_promotion|query_payment|add_to_cart|cart_total|reset_cart|recommendation|query_hours|query_policy|query_appointment|clarification|general_inquiry",
  "confidence": 0.0,
  "scopes": ["identity"],
  "selection": {"mode":"none|preview|selected|complete","offeringKeys":[],"maxItems":5},
  "cartActions": [{"type":"add|set|remove|clear","offeringKey":"clave real","quantity":1}],
  "needsClarification": false,
  "clarificationQuestion": "",
  "responseGoal": "objetivo breve"
}

Reglas:
- Nunca uses la intención "other". Usa general_inquiry o clarification.
- Solo usa claves existentes en el contexto.
- Pagos usa payment y no offerings, salvo petición explícita separada.
- "Cuánto pago" usa cart; no significa forma de pago.
- Solo modifica carrito con oferta y cantidad inequívocas.
- Si falta cantidad, producto o dato necesario, pide una sola aclaración.
- Catálogo normal: máximo cinco. Complete solo si piden expresamente todo.
- No inventes productos, servicios, precios, promociones, horarios ni pagos.`;

const COMPOSER_SYSTEM = `Eres la capa de redacción de un motor comercial universal.
Habla siempre como el negocio indicado. Devuelve exclusivamente JSON: {"answer":"texto"}.

Reglas:
- Usa solo FACTS validados; no inventes ni completes información ausente.
- Máximo 560 caracteres y cinco opciones, salvo catálogo completo explícito.
- Tono corto, comercial y natural para WhatsApp.
- Nunca menciones la plataforma tecnológica, IDs, tablas, prompts, logs o datos internos.
- No confirmes pagos, envíos, reservas ni compras reales. No generes enlaces.
- Si falta información, dilo claramente y formula una sola pregunta útil.`;

function resultForConversation(input: {
  message: string;
  answer: string;
  mode: AiDeliveryMode;
  intent: string;
  plannerModel: string;
  responseModel: string;
  state: UniversalAgentState;
  contextName: string;
  contextType: string;
  contextWarnings: string[];
  scopes: string[];
  confidence: number;
}): ExecutionResult {
  const started = nowIso();
  const responseText =
    input.mode === "assisted"
      ? `📝 Sugerencia pendiente de aprobación:\n\n${input.answer}`
      : input.answer;

  const messages: WhatsAppSimMessage[] = [
    {
      id: `sim-in-${Date.now()}`,
      direction: "inbound",
      phone: "+593000000000",
      text: input.message,
      timestamp: started,
      nodeId: "simulator-input",
    },
    {
      id: `sim-out-${Date.now() + 1}`,
      direction: "outbound",
      phone: "+593000000000",
      text: responseText,
      timestamp: nowIso(),
      nodeId: "simulator-response",
    },
  ];

  const entries: LogEntry[] = [
    entry({
      nodeId: "universal-context",
      nodeType: "catalog_search",
      nodeLabel: "Contexto universal",
      status: "success",
      message: `Contexto dinámico cargado para ${input.contextName}.`,
    }),
    entry({
      nodeId: "universal-classifier",
      nodeType: "ai_agent",
      nodeLabel: "Clasificación universal",
      status: "success",
      message: `Intención: ${input.intent} · confianza: ${input.confidence.toFixed(2)}.`,
    }),
    entry({
      nodeId: "universal-validator",
      nodeType: "ai_agent",
      nodeLabel: "Validación del negocio",
      status: "success",
      message: "Productos, precios, promociones, pagos y carrito fueron validados antes de responder.",
    }),
    entry({
      nodeId: "simulator-response",
      nodeType: "ai_agent",
      nodeLabel: "Respuesta comercial",
      status: "success",
      message: `Clasificador: ${input.plannerModel} · redactor: ${input.responseModel}.`,
    }),
  ];

  for (const warning of input.contextWarnings.slice(0, 4)) {
    entries.push(
      entry({
        nodeId: "universal-context",
        nodeType: "catalog_search",
        nodeLabel: "Contexto parcial",
        status: "info",
        message: warning,
      })
    );
  }

  if (input.mode === "assisted") {
    entries.push(
      entry({
        nodeId: "approval-gate",
        nodeType: "end",
        nodeLabel: "Aprobación requerida",
        status: "info",
        message: "La respuesta no fue enviada por WhatsApp ni ejecutó pagos.",
      })
    );
  }

  return {
    status: "success",
    entries,
    variables: {
      user_response: input.message,
      ai_response: input.answer,
      ai_intent: input.intent,
      ai_confidence: input.confidence,
      ai_scopes: input.scopes,
      ai_provider: "universal-hybrid",
      ai_model: `${input.plannerModel}+${input.responseModel}`,
      ai_mode: input.mode,
      business_context_loaded: true,
      business_name: input.contextName,
      business_type: input.contextType,
      simulator_state: input.state,
      cart_item_count: input.state.cart.length,
      payments_executed: false,
      whatsapp_sent: false,
      ai_requires_approval: input.mode === "assisted",
    },
    whatsappMessages: messages,
    finalNode: input.mode === "assisted" ? "approval-gate" : "simulator-response",
  };
}

function failedResult(input: {
  mode: AiDeliveryMode;
  error: unknown;
  state?: UniversalAgentState;
}): ExecutionResult {
  const detail = input.error instanceof Error
    ? input.error.message
    : "No se pudo procesar la conversación.";
  return {
    status: "failed",
    entries: [
      entry({
        nodeId: "universal-agent",
        nodeType: "ai_agent",
        nodeLabel: "Agente universal",
        status: "error",
        message: detail,
      }),
    ],
    variables: {
      ai_mode: input.mode,
      simulator_state: input.state || emptyUniversalAgentState(),
      payments_executed: false,
      whatsapp_sent: false,
    },
    whatsappMessages: [],
    finalNode: "universal-agent",
    error: "No pudimos procesar la consulta con seguridad. Inténtalo nuevamente.",
  };
}

export async function executeWorkflow(
  nodes: FlowNode[],
  edges: FlowEdge[],
  options: GeminiEngineOptions = {}
): Promise<ExecutionResult> {
  const cleanOptions = withoutInternalState(options);
  const message = options.clientMessage?.trim();
  if (!message) return executeLegacyWorkflow(nodes, edges, cleanOptions);

  const mode: AiDeliveryMode = options.aiMode || "simulation";
  if (mode === "automatic" && process.env.AI_AUTOMATIC_MODE_ENABLED !== "true") {
    return failedResult({ mode, error: new Error("El modo automático está deshabilitado.") });
  }

  // ─── Sandbox fallback: if no clientId, use demo-business with the
  // Universal Intent Library + Conversation Manager + Cart. ──────────
  // This allows testing the intent library + cart without a real business.
  const sandboxBusinessId = options.clientId || "demo-business";
  const isSandbox = !options.clientId || process.env.NODE_ENV !== "production" || process.env.PAYMENTS_SANDBOX_ENABLED === "true";

  if (isSandbox) {
    try {
      const sandboxResult = await runSandboxIntentFlow(sandboxBusinessId, message, options);
      if (sandboxResult) return sandboxResult;
    } catch (err) {
      console.error("[universal-agent] sandbox intent flow error:", err instanceof Error ? err.message : String(err));
      // Fall through to the normal path if sandbox fails.
    }
  }

  if (!options.clientId) {
    return failedResult({ mode, error: new Error("El flujo no tiene un negocio asociado.") });
  }

  try {
    const context = await loadUniversalBusinessContext({
      clientId: options.clientId,
      nodes,
    });
    const initialState = normalizeUniversalAgentState(readSimulatorState(options), context);
    const baseline = classifyUniversalIntent({ message, context, state: initialState });
    const plannerPayload = buildUniversalPlannerPayload(context, initialState, message);

    let plannerModel = "universal-local";
    let modelDecision: UniversalPlannerDecision | null = null;
    try {
      const planner = await callGeminiJson({
        system: PLANNER_SYSTEM,
        user: JSON.stringify({ baselineHint: baseline, ...plannerPayload }),
        maxOutputTokens: PLANNER_MAX_TOKENS,
      });
      plannerModel = planner.model;
      modelDecision = normalizePlannerDecision(planner.data, context);
    } catch (error) {
      console.error("[universal-agent] semantic enrichment unavailable", error);
    }

    let finalDecision = resolveUniversalPlannerDecision({
      baseline,
      model: modelDecision,
    });

    const cartResult = applyUniversalCartActions({
      state: initialState,
      decision: finalDecision,
      context,
    });

    if (cartResult.invalidActions.length) {
      finalDecision = {
        ...finalDecision,
        intent: "clarification",
        needsClarification: true,
        clarificationQuestion: "¿Puedes confirmar el producto o servicio y la cantidad?",
        responseGoal: "Pedir una aclaración porque la operación no coincide con datos reales.",
      };
    }

    const facts = buildUniversalValidatedFacts({
      context,
      state: cartResult.state,
      decision: finalDecision,
      invalidActions: cartResult.invalidActions,
    });

    const safeFallback = composeUniversalSafeAnswer({
      message,
      decision: finalDecision,
      context,
      state: cartResult.state,
      invalidActions: cartResult.invalidActions,
    });

    let answer = safeFallback;
    let responseModel = "universal-local";
    try {
      const composer = await callGeminiJson({
        system: COMPOSER_SYSTEM,
        user: JSON.stringify({
          customerMessage: message,
          intent: finalDecision.intent,
          selectionMode: finalDecision.selection.mode,
          needsClarification: finalDecision.needsClarification,
          clarificationQuestion: finalDecision.clarificationQuestion,
          responseGoal: finalDecision.responseGoal,
          safeFallback,
          FACTS: facts,
        }),
        maxOutputTokens: RESPONSE_MAX_TOKENS,
      });
      const candidate = sanitizeUniversalAnswer(
        String(composer.data.answer || ""),
        context.businessName
      );
      if (candidate && answerUsesOnlyKnownMoney(candidate, facts)) {
        answer = candidate;
        responseModel = composer.model;
      }
    } catch (error) {
      console.error("[universal-agent] commercial composer unavailable", error);
    }

    const finalState = appendUniversalTurn({
      state: cartResult.state,
      customerMessage: message,
      businessAnswer: answer,
      intent: finalDecision.intent,
      pendingQuestion: finalDecision.needsClarification
        ? finalDecision.clarificationQuestion
        : null,
    });

    return resultForConversation({
      message,
      answer,
      mode,
      intent: finalDecision.intent,
      plannerModel,
      responseModel,
      state: finalState,
      contextName: context.businessName,
      contextType: context.businessType,
      contextWarnings: context.warnings,
      scopes: finalDecision.scopes,
      confidence: finalDecision.confidence,
    });
  } catch (error) {
    return failedResult({ mode, error });
  }
}

// ─── Sandbox Intent Flow (uses Universal Intent Library + Cart) ──────
// This runs when no clientId is configured (sandbox/demo mode).
// It uses the intent-library + conversation-manager + cart modules
// to provide full conversational commerce without a real business tenant.

async function runSandboxIntentFlow(
  businessId: string,
  message: string,
  options: GeminiEngineOptions
): Promise<ExecutionResult | null> {
  try {
    const intentLib = await import("@/lib/intent");
    const knowledge = await (await import("@/lib/knowledge-center")).getKnowledgeContext(businessId);
    const phoneNumber = (options as Record<string, unknown>)?.clientPhone as string || "+593999999999";

    // Load or create the persisted conversation session + cart.
    const ctx = await intentLib.loadContext(businessId, phoneNumber);
    await intentLib.addMessage(ctx.sessionId, "client", message);

    // Detect intent with full context.
    const intentMatch = intentLib.detectIntent(message, {
      cart: ctx.cart,
      pendingIntent: ctx.pendingIntent,
      pendingEntities: ctx.pendingEntities,
    });

    let aiResponse = "";
    let intentLabel = "no_match";
    const cart = await intentLib.getOrCreateCart(ctx.sessionId, businessId);

    // ─── Cart operations ───────────────────────────────────────────
    if (intentMatch && (intentMatch.intent === "#CARRITO_AGREGAR" || intentMatch.intent === "#CARRITO_AGREGAR_MULTIPLE")) {
      const items = [...cart.items];
      const productNames = (intentMatch.entities.productos || "").split(",").map((s: string) => s.trim()).filter(Boolean);
      const qty = parseInt(intentMatch.entities.cantidades || "1", 10) || 1;
      for (const pname of productNames) {
        const found = knowledge.products.find((p) => p.name.toLowerCase().includes(pname.toLowerCase()) || pname.toLowerCase().includes(p.name.toLowerCase()));
        if (found) {
          const existing = items.find((i) => i.productId === found.name);
          if (existing) existing.qty += qty;
          else items.push({ productId: found.name, name: found.name, price: found.price, currency: found.currency, qty });
        }
      }
      const { total, count } = await intentLib.saveCartItems(cart.id, items);
      aiResponse = items.length > 0
        ? `✅ Agregué ${count} producto(s) a tu carrito.\n\n🛒 *Tu carrito:*\n${items.map((i, idx) => `${idx + 1}. ${i.name} x${i.qty} — ${(i.price * i.qty).toFixed(2)} ${i.currency}`).join("\n")}\n\n*Total: ${total.toFixed(2)} USD*\n\n¿Algo más?`
        : "No reconocí el producto. ¿Puedes verificar el nombre con el menú?";
      intentLabel = "cart_add";
    } else if (intentMatch && intentMatch.intent === "#CARRITO_QUITAR") {
      const items = [...cart.items];
      const idx = parseInt(intentMatch.entities.producto_o_indice || "0", 10);
      if (idx > 0 && idx <= items.length) {
        const removed = items.splice(idx - 1, 1)[0];
        const { total } = await intentLib.saveCartItems(cart.id, items);
        aiResponse = `✅ Quité "${removed.name}" de tu carrito.\n\n🛒 *Carrito actualizado:*\n${items.length > 0 ? items.map((i, n) => `${n + 1}. ${i.name} x${i.qty} — ${(i.price * i.qty).toFixed(2)} ${i.currency}`).join("\n") : "(vacío)"}\n\n*Total: ${total.toFixed(2)} USD*`;
      } else {
        aiResponse = "No encontré ese producto en tu carrito. Usa el número que aparece al lado de cada item.";
      }
      intentLabel = "cart_remove";
    } else if (intentMatch && intentMatch.intent === "#CARRITO_MODIFICAR_CANTIDAD") {
      const items = [...cart.items];
      const idx = parseInt(intentMatch.entities.producto_o_indice || "0", 10);
      const qty = parseInt(intentMatch.entities.cantidad || "1", 10);
      if (idx > 0 && idx <= items.length && qty > 0) {
        items[idx - 1].qty = qty;
        const { total } = await intentLib.saveCartItems(cart.id, items);
        aiResponse = `✅ Cambié la cantidad de "${items[idx - 1].name}" a ${qty}.\n\n🛒 *Carrito actualizado:*\n${items.map((i, n) => `${n + 1}. ${i.name} x${i.qty} — ${(i.price * i.qty).toFixed(2)} ${i.currency}`).join("\n")}\n\n*Total: ${total.toFixed(2)} USD*`;
      } else {
        aiResponse = "No pude identificar el producto o la cantidad. Usa el número del carrito y la cantidad deseada.";
      }
      intentLabel = "cart_qty";
    } else if (intentMatch && intentMatch.intent === "#CARRITO_CONSULTAR") {
      aiResponse = cart.items.length > 0
        ? `🛒 *Tu carrito:*\n${cart.items.map((i, n) => `${n + 1}. ${i.name} x${i.qty} — ${(i.price * i.qty).toFixed(2)} ${i.currency}`).join("\n")}\n\n*Total: ${cart.total.toFixed(2)} USD*`
        : "Tu carrito está vacío. ¿Qué te gustaría pedir?";
      intentLabel = "cart_view";
    } else if (intentMatch && intentMatch.intent === "#CARRITO_CONSULTAR_TOTAL") {
      aiResponse = cart.items.length > 0
        ? `💰 Llevas ${cart.items.reduce((s, i) => s + i.qty, 0)} producto(s) en el carrito.\n\n*Total hasta ahora: ${cart.total.toFixed(2)} USD*\n\n¿Quieres agregar algo más o confirmar el pedido?`
        : "Tu carrito está vacío.";
      intentLabel = "cart_total";
    } else if (intentMatch && intentMatch.intent === "#CARRITO_VER_MENU") {
      if (knowledge.products.length === 0) {
        aiResponse = "No tengo productos cargados en el catálogo en este momento.";
      } else {
        const byCat = new Map<string, typeof knowledge.products>();
        for (const p of knowledge.products) {
          if (!byCat.has(p.category)) byCat.set(p.category, []);
          byCat.get(p.category)!.push(p);
        }
        const lines: string[] = ["📋 *Nuestro menú:*"];
        for (const [cat, items] of byCat) {
          lines.push(`\n*${cat}*`);
          items.forEach((p, i) => lines.push(`${i + 1}. ${p.name} — ${p.price.toFixed(2)} ${p.currency}`));
        }
        lines.push("\nTu carrito se mantiene. ¿Qué te gustaría agregar?");
        aiResponse = lines.join("\n");
      }
      intentLabel = "view_menu";
    } else if (intentMatch && intentMatch.intent === "#CARRITO_NUEVO_PEDIDO") {
      await intentLib.clearCart(cart.id);
      aiResponse = "🧹 Carrito vaciado. ¿Qué te gustaría pedir?";
      intentLabel = "cart_new";
    } else if (intentMatch && intentMatch.intent === "#CARRITO_CONFIRMAR_PEDIDO") {
      if (cart.items.length === 0) {
        aiResponse = "Tu carrito está vacío. Agrega productos primero con el menú.";
      } else {
        aiResponse = `✅ *Pedido confirmado:*\n${cart.items.map((i, n) => `${n + 1}. ${i.name} x${i.qty} — ${(i.price * i.qty).toFixed(2)} ${i.currency}`).join("\n")}\n\n*Total: ${cart.total.toFixed(2)} USD*\n\nTe generaré el link de pago enseguida. 🛒`;
      }
      intentLabel = "cart_confirm";
    } else if (intentMatch && intentMatch.intent === "#CARRITO_CANCELAR_PEDIDO") {
      await intentLib.clearCart(cart.id);
      aiResponse = "❌ Pedido cancelado. Tu carrito está vacío. ¿En qué más puedo ayudarte?";
      intentLabel = "cart_cancel";
    } else if (intentMatch && intentMatch.intent === "#CARRITO_SELECCIONAR_NUMERO") {
      const selector = intentMatch.entities.selector || "";
      const idx = parseInt(selector, 10);
      if (!isNaN(idx) && idx > 0 && idx <= knowledge.products.length) {
        const p = knowledge.products[idx - 1];
        const items = [...cart.items];
        const existing = items.find((i) => i.productId === p.name);
        if (existing) existing.qty += 1;
        else items.push({ productId: p.name, name: p.name, price: p.price, currency: p.currency, qty: 1 });
        const { total } = await intentLib.saveCartItems(cart.id, items);
        aiResponse = `✅ Agregué "${p.name}" a tu carrito.\n\n🛒 *Tu carrito:*\n${items.map((i, n) => `${n + 1}. ${i.name} x${i.qty} — ${(i.price * i.qty).toFixed(2)} ${i.currency}`).join("\n")}\n\n*Total: ${total.toFixed(2)} USD*`;
      } else {
        aiResponse = `Elegiste "${selector}". ¿Podrías confirmar el nombre del producto?`;
      }
      intentLabel = "cart_select";
    } else {
      // No cart intent — check if it's a greeting or info
      if (intentMatch && knowledge.products.length > 0) {
        const byCat = new Map<string, typeof knowledge.products>();
        for (const p of knowledge.products) {
          if (!byCat.has(p.category)) byCat.set(p.category, []);
          byCat.get(p.category)!.push(p);
        }
        const lines: string[] = [`¡Hola! 👋 Bienvenido a ${knowledge.businessName || "nuestro negocio"}. Puedo ayudarte con nuestro menú o tomar tu pedido.`];
        lines.push("\n📋 *Nuestro menú:*");
        for (const [cat, items] of byCat) {
          lines.push(`\n*${cat}*`);
          items.forEach((p, i) => lines.push(`${i + 1}. ${p.name} — ${p.price.toFixed(2)} ${p.currency}`));
        }
        lines.push("\n¿Qué te gustaría pedir?");
        aiResponse = lines.join("\n");
        intentLabel = "greeting";
      } else {
        aiResponse = "¡Hola! 👋 Bienvenido. Puedo ayudarte con nuestro menú o tomar tu pedido. ¿Qué deseas saber?";
        intentLabel = "greeting";
      }
    }

    await intentLib.addMessage(ctx.sessionId, "bot", aiResponse, intentLabel);

    // Build the execution result in the same format as the universal runtime.
    return {
      status: "success",
      entries: [
        {
          nodeId: "universal-agent",
          nodeType: "ai_agent",
          nodeLabel: "Agente universal",
          status: "success",
          message: `Intención: ${intentLabel}. Respuesta generada con Knowledge Center + Cart.`,
          timestamp: new Date().toISOString(),
        },
      ],
      variables: {
        ai_response: aiResponse,
        last_ai_response: aiResponse,
        ai_intent: intentLabel,
        ai_mode: "simulation",
        simulator_state: {
          version: 2,
          cart: cart.items,
          recentTurns: [...ctx.history.slice(-4)],
          lastIntent: intentLabel,
          pendingQuestion: null,
        },
        payments_executed: false,
        whatsapp_sent: false,
        conversation_session_id: ctx.sessionId,
        cart_total: cart.total,
        cart_count: cart.items.reduce((s, i) => s + i.qty, 0),
      },
      whatsappMessages: [],
      finalNode: "universal-agent",
    };
  } catch (err) {
    console.error("[sandbox-intent-flow] error:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
