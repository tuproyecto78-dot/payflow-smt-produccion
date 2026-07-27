import "server-only";

import {
  executeWorkflow as executeLegacyWorkflow,
  type AiDeliveryMode,
  type GeminiEngineOptions,
} from "./engine-gemini";
import {
  answerUsesOnlyKnownMoney,
  applyUniversalCartActions,
  buildUniversalPlannerPayload,
  buildUniversalValidatedFacts,
  emptyUniversalAgentState,
  normalizePlannerDecision,
  sanitizeUniversalAnswer,
  type UniversalPlannerDecision,
} from "./universal-agent-contract";
import { resolveUniversalPlannerDecision } from "./universal-intent-engine";
import {
  appendUniversalSessionTurn,
  buildUniversalSessionPlannerMemory,
  classifyUniversalSessionIntent,
  composeUniversalSessionAnswer,
  normalizeUniversalSessionState,
  requiresDeterministicSessionAnswer,
  transitionUniversalSessionMemory,
  type UniversalSessionState,
} from "./universal-session-memory";
import { loadUniversalBusinessContext } from "./universal-business-context-server";
import { SIMULATOR_STATE_KEY } from "./simulator-session-memory-server";
import type {
  ExecutionResult,
  FlowEdge,
  FlowNode,
  LogEntry,
  WhatsAppSimMessage,
} from "./workflow-types";

export type { AiDeliveryMode, GeminiEngineOptions };

const PLANNER_MAX_TOKENS = 850;
const RESPONSE_MAX_TOKENS = 360;

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
  const raw = options.questionResponses?.[SIMULATOR_STATE_KEY];
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function withoutInternalState(options: GeminiEngineOptions): GeminiEngineOptions {
  const responses = { ...(options.questionResponses || {}) };
  delete responses[SIMULATOR_STATE_KEY];
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

const PLANNER_SYSTEM = `Eres el clasificador semántico de un motor comercial universal.
Recibes memoria de sesión con la última lista numerada, su propósito informativo o de compra, el producto pendiente de cantidad, el carrito, turnos recientes y frecuencia de intenciones.

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
- Nunca uses other.
- Clasifica primero: información, selección o compra.
- Menú, catálogo, precios, detalles, promociones y medios de pago son consultas informativas.
- Una consulta informativa nunca genera cartActions, nunca abre carrito y nunca pide unidades.
- Un número después de una lista informativa solicita detalles de esa opción.
- Un número después de una lista de compra selecciona esa opción.
- Solo pide cantidad después de una compra explícita o de una lista marcada como compra.
- Si una compra explícita dejó un producto pendiente de cantidad, un número es cantidad.
- Solo usa claves existentes y nunca cambies el orden de la última lista presentada.
- Pagos no consulta catálogo. Cuánto pago consulta carrito.
- No inventes productos, precios, promociones, horarios ni pagos.`;

const COMPOSER_SYSTEM = `Eres la capa de redacción de un negocio activo.
Devuelve exclusivamente JSON: {"answer":"texto"}.
Usa solo FACTS validados. Máximo 560 caracteres y cinco opciones.
Nunca menciones la plataforma, IDs, tablas, prompts, logs o datos internos.
No confirmes pagos, envíos, reservas ni compras reales.
No pidas unidades ni hables de carrito en una consulta informativa.
Respeta la memoria de sesión y no reordenes opciones numeradas.`;

function resultForConversation(input: {
  message: string;
  answer: string;
  mode: AiDeliveryMode;
  intent: string;
  plannerModel: string;
  responseModel: string;
  state: UniversalSessionState;
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
      nodeId: "session-memory",
      nodeType: "ai_agent",
      nodeLabel: "Memoria de sesión",
      status: "success",
      message: `Opciones recordadas: ${input.state.sessionMemory.lastPresentedOfferingKeys.length} · producto pendiente: ${
        input.state.sessionMemory.pendingOfferingKey ? "sí" : "no"
      }.`,
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
      message: "Selección, cantidades, precios y totales fueron validados antes de responder.",
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
      ai_provider: "universal-session-memory",
      ai_model: `${input.plannerModel}+${input.responseModel}`,
      ai_mode: input.mode,
      business_context_loaded: true,
      business_name: input.contextName,
      business_type: input.contextType,
      simulator_state: input.state,
      cart_item_count: input.state.cart.length,
      memory_last_presented_count:
        input.state.sessionMemory.lastPresentedOfferingKeys.length,
      memory_pending_selection:
        input.state.sessionMemory.pendingOfferingKey !== null,
      memory_intent_counts: input.state.sessionMemory.intentCounts,
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
  state?: UniversalSessionState;
}): ExecutionResult {
  const detail =
    input.error instanceof Error
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
      simulator_state: input.state || {
        ...emptyUniversalAgentState(),
        sessionMemory: {
          version: 2,
          lastPresentedOfferingKeys: [],
          lastPresentedListPurpose: "information",
          pendingOfferingKey: null,
          intentCounts: {},
          lastSelectionIndex: null,
        },
      },
      payments_executed: false,
      whatsapp_sent: false,
    },
    whatsappMessages: [],
    finalNode: "universal-agent",
    error: "No pudimos procesar la consulta con seguridad. Inténtalo nuevamente.",
  };
}

function baselineIsSessionAuthoritative(decision: UniversalPlannerDecision): boolean {
  return (
    decision.intent === "select_presented_option" ||
    decision.intent === "add_to_cart" ||
    decision.intent === "cart_total" ||
    decision.intent === "reset_cart" ||
    decision.selection.offeringKeys.length > 1 ||
    (decision.selection.offeringKeys.length === 1 &&
      decision.needsClarification &&
      decision.scopes.includes("cart"))
  );
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
  if (!options.clientId) {
    return failedResult({ mode, error: new Error("El flujo no tiene un negocio asociado.") });
  }

  try {
    const context = await loadUniversalBusinessContext({
      clientId: options.clientId,
      nodes,
    });
    const initialState = normalizeUniversalSessionState(
      readSimulatorState(options),
      context
    );
    const baseline = classifyUniversalSessionIntent({
      message,
      context,
      state: initialState,
    });
    const plannerPayload = buildUniversalPlannerPayload(
      context,
      initialState,
      message
    );

    let plannerModel = "universal-local-memory";
    let modelDecision: UniversalPlannerDecision | null = null;
    try {
      const planner = await callGeminiJson({
        system: PLANNER_SYSTEM,
        user: JSON.stringify({
          baselineHint: baseline,
          sessionMemory: buildUniversalSessionPlannerMemory(initialState, context),
          ...plannerPayload,
        }),
        maxOutputTokens: PLANNER_MAX_TOKENS,
      });
      plannerModel = planner.model;
      modelDecision = normalizePlannerDecision(planner.data, context);
    } catch (error) {
      console.error("[universal-agent] semantic enrichment unavailable", error);
    }

    let finalDecision = baselineIsSessionAuthoritative(baseline)
      ? baseline
      : resolveUniversalPlannerDecision({ baseline, model: modelDecision });

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
        clarificationQuestion:
          "¿Puedes confirmar el producto o servicio y la cantidad?",
        responseGoal:
          "Pedir una aclaración porque la operación no coincide con datos reales.",
      };
    }

    const memoryState = transitionUniversalSessionMemory({
      state: cartResult.state as UniversalSessionState,
      decision: finalDecision,
      context,
    });

    const facts = buildUniversalValidatedFacts({
      context,
      state: memoryState,
      decision: finalDecision,
      invalidActions: cartResult.invalidActions,
    });

    const safeFallback = composeUniversalSessionAnswer({
      message,
      decision: finalDecision,
      context,
      state: memoryState,
      invalidActions: cartResult.invalidActions,
    });

    let answer = safeFallback;
    let responseModel = "universal-local-memory";

    if (!requiresDeterministicSessionAnswer(finalDecision)) {
      try {
        const composer = await callGeminiJson({
          system: COMPOSER_SYSTEM,
          user: JSON.stringify({
            customerMessage: message,
            intent: finalDecision.intent,
            responseGoal: finalDecision.responseGoal,
            safeFallback,
            sessionMemory: buildUniversalSessionPlannerMemory(memoryState, context),
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
    }

    const finalState = appendUniversalSessionTurn({
      state: memoryState,
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
