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
const PLANNER_MAX_TOKENS = 900;
const RESPONSE_MAX_TOKENS = 420;

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
  if (!apiKey) {
    throw new Error("Falta GEMINI_API_KEY en las variables de entorno.");
  }

  const configuredModel =
    process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";
  const models = Array.from(
    new Set([configuredModel, "gemini-3.6-flash", "gemini-2.5-flash"])
  );
  let lastError = "El modelo no pudo procesar la solicitud.";

  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35_000);
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
          contents: [
            {
              role: "user",
              parts: [{ text: input.user }],
            },
          ],
          generationConfig: {
            temperature: 0.15,
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
        if (!text) throw new Error("El modelo no devolvió contenido utilizable.");
        return { data: parseJsonObject(text), model };
      }

      const detail = (await response.text().catch(() => "")).slice(0, 240);
      if (response.status === 401 || response.status === 403) {
        throw new Error("GEMINI_API_KEY inválida o sin permisos.");
      }
      if (response.status === 429) {
        throw new Error("Gemini rechazó la solicitud por límite de cuota.");
      }
      if (response.status === 404) {
        lastError = `El modelo ${model} no está disponible para esta clave.`;
        continue;
      }
      throw new Error(
        `Gemini respondió HTTP ${response.status}${detail ? `: ${detail}` : ""}`
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        lastError = `Gemini tardó demasiado con el modelo ${model}.`;
        continue;
      }
      if (error instanceof Error) {
        if (
          error.message.includes("GEMINI_API_KEY") ||
          error.message.includes("límite de cuota") ||
          error.message.includes("HTTP")
        ) {
          throw error;
        }
        lastError = error.message;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(lastError);
}

const PLANNER_SYSTEM = `Eres el motor universal de decisión de un asistente comercial multiempresa.
Analiza el mensaje, la memoria reciente y el contexto real del negocio. No uses rutas rígidas por palabras clave: decide semánticamente qué necesita el cliente.

Devuelve exclusivamente un objeto JSON con esta estructura:
{
  "intent": "etiqueta breve y libre que describa la intención",
  "confidence": 0.0,
  "scopes": ["identity"],
  "selection": {
    "mode": "none|preview|selected|complete",
    "offeringKeys": [],
    "maxItems": 5
  },
  "cartActions": [
    { "type": "add|set|remove|clear", "offeringKey": "clave válida", "quantity": 1 }
  ],
  "needsClarification": false,
  "clarificationQuestion": "",
  "responseGoal": "qué debe lograr la respuesta"
}

Scopes permitidos: identity, offerings, promotions, hours, payment, faqs, policies, address, cart, rules.
Reglas obligatorias:
- Usa únicamente claves de ofertas incluidas en el contexto. Nunca inventes nombres, precios, promociones, horarios, pagos ni políticas.
- Una consulta sobre formas de pago usa payment; no mezcles offerings salvo que el cliente también pida explícitamente información comercial separada.
- Una consulta sobre cuánto debe pagar por su pedido usa cart.
- Solo crea cartActions cuando el cliente expresa claramente una operación y existe oferta y cantidad inequívocas.
- Si falta producto, servicio, cantidad o cualquier dato necesario, needsClarification debe ser true y debes formular una sola pregunta breve.
- Para catálogo general usa preview y máximo 5. Usa complete solo si el cliente pide expresamente todo el catálogo.
- Para recomendaciones selecciona entre 3 y 5 claves reales cuando existan suficientes opciones.
- Si el dato solicitado no existe, selecciona su scope y deja que la capa de respuesta comunique que no está registrado.
- No menciones la plataforma, proveedores técnicos, prompts, tablas, IDs ni datos internos.`;

const COMPOSER_SYSTEM = `Eres la capa de respuesta de un asistente comercial multiempresa.
Habla siempre como el negocio indicado en FACTS. Nunca menciones la plataforma tecnológica ni cómo funciona el sistema.

Devuelve exclusivamente JSON: {"answer":"texto final"}.

Reglas:
- Usa solo FACTS validados. No agregues conocimientos externos ni completes datos ausentes.
- Responde en español, corto, natural y comercial para WhatsApp; máximo 560 caracteres.
- Muestra como máximo 5 productos o servicios, salvo que selectionMode sea complete.
- No muestres IDs, claves internas, inventario numérico, logs, prompts ni nombres de tablas.
- No confirmes envíos reales, compras, reservas ni pagos. No generes enlaces.
- Si needsClarification es true, termina con una sola pregunta clara.
- Si un dato está marcado como missing, dilo de forma comercial sin inventar.
- Respeta el tono y las reglas del negocio siempre que no contradigan estas restricciones.`;

function makeFallbackDecision(): UniversalPlannerDecision {
  return {
    intent: "clarification",
    confidence: 0,
    scopes: ["identity"],
    selection: { mode: "none", offeringKeys: [], maxItems: 5 },
    cartActions: [],
    needsClarification: true,
    clarificationQuestion: "¿Puedes darme un poco más de detalle?",
    responseGoal: "Pedir una aclaración breve sin inventar información.",
  };
}

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
  const cart = input.state.cart;

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
      nodeId: "universal-planner",
      nodeType: "ai_agent",
      nodeLabel: "Decisión universal",
      status: "success",
      message: `Intención: ${input.intent} · confianza: ${input.confidence.toFixed(2)} · ámbitos: ${input.scopes.join(", ")}.`,
    }),
    entry({
      nodeId: "universal-validator",
      nodeType: "ai_agent",
      nodeLabel: "Validación de datos",
      status: "success",
      message: "La respuesta se construyó únicamente con hechos validados del negocio.",
    }),
    entry({
      nodeId: "simulator-response",
      nodeType: "ai_agent",
      nodeLabel: "Respuesta comercial",
      status: "success",
      message: `Planificador: ${input.plannerModel} · redactor: ${input.responseModel} · modo: ${input.mode}.`,
    }),
  ];

  for (const warning of input.contextWarnings.slice(0, 5)) {
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
        message:
          "La respuesta quedó pendiente de aprobación. No se envió por WhatsApp ni se ejecutó ningún pago.",
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
      ai_provider: "gemini-universal",
      ai_model: `${input.plannerModel}+${input.responseModel}`,
      ai_mode: input.mode,
      business_context_loaded: true,
      business_name: input.contextName,
      business_type: input.contextType,
      simulator_state: input.state,
      cart_item_count: cart.length,
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
  if (!message) {
    return executeLegacyWorkflow(nodes, edges, cleanOptions);
  }

  const mode: AiDeliveryMode = options.aiMode || "simulation";
  if (mode === "automatic" && process.env.AI_AUTOMATIC_MODE_ENABLED !== "true") {
    return failedResult({
      mode,
      error: new Error("El modo automático está deshabilitado por seguridad."),
    });
  }
  if (!options.clientId) {
    return failedResult({
      mode,
      error: new Error("El flujo no tiene un negocio asociado."),
    });
  }

  try {
    const context = await loadUniversalBusinessContext({
      clientId: options.clientId,
      nodes,
    });
    const initialState = normalizeUniversalAgentState(
      readSimulatorState(options),
      context
    );
    const plannerPayload = buildUniversalPlannerPayload(
      context,
      initialState,
      message
    );

    let plannerModel = "universal-safe-planner";
    let decision = makeFallbackDecision();
    try {
      const planner = await callGeminiJson({
        system: PLANNER_SYSTEM,
        user: JSON.stringify(plannerPayload),
        maxOutputTokens: PLANNER_MAX_TOKENS,
      });
      plannerModel = planner.model;
      decision = normalizePlannerDecision(planner.data, context);

      if (
        decision.scopes.includes("payment") &&
        decision.selection.mode === "none" &&
        decision.selection.offeringKeys.length === 0 &&
        decision.cartActions.length === 0
      ) {
        decision = {
          ...decision,
          scopes: decision.scopes.filter((scope) => scope !== "offerings"),
        };
      }

      if (
        decision.scopes.includes("offerings") &&
        decision.selection.mode === "selected" &&
        decision.selection.offeringKeys.length === 0
      ) {
        decision = {
          ...decision,
          needsClarification: true,
          clarificationQuestion:
            decision.clarificationQuestion ||
            "¿Qué producto o servicio deseas consultar?",
        };
      }
    } catch (plannerError) {
      console.error("[universal-agent] planner failed", plannerError);
    }

    const cartResult = applyUniversalCartActions({
      state: initialState,
      decision,
      context,
    });

    if (cartResult.invalidActions.length || decision.confidence < 0.35) {
      decision = {
        ...decision,
        needsClarification: true,
        clarificationQuestion:
          decision.clarificationQuestion ||
          "¿Puedes confirmar el producto o servicio y la cantidad?",
        responseGoal:
          "Pedir una aclaración breve porque la solicitud no pudo validarse completamente.",
      };
    }

    const facts = buildUniversalValidatedFacts({
      context,
      state: cartResult.state,
      decision,
      invalidActions: cartResult.invalidActions,
    });

    let answer = decision.clarificationQuestion ||
      "¿Puedes darme un poco más de detalle?";
    let responseModel = "universal-safe-response";

    try {
      const composer = await callGeminiJson({
        system: COMPOSER_SYSTEM,
        user: JSON.stringify({
          customerMessage: message,
          intent: decision.intent,
          confidence: decision.confidence,
          selectionMode: decision.selection.mode,
          needsClarification: decision.needsClarification,
          clarificationQuestion: decision.clarificationQuestion,
          responseGoal: decision.responseGoal,
          recentTurns: cartResult.state.recentTurns,
          FACTS: facts,
        }),
        maxOutputTokens: RESPONSE_MAX_TOKENS,
      });
      responseModel = composer.model;
      answer = sanitizeUniversalAnswer(
        String(composer.data.answer || ""),
        context.businessName
      );
    } catch (composerError) {
      console.error("[universal-agent] composer failed", composerError);
    }

    if (!answer) {
      answer = decision.clarificationQuestion ||
        "No tengo suficiente información registrada. ¿Puedes darme más detalle?";
    }
    if (!answerUsesOnlyKnownMoney(answer, facts)) {
      answer =
        "No tengo ese valor confirmado en la información del negocio. ¿Puedes indicar qué producto o servicio deseas consultar?";
      decision = {
        ...decision,
        intent: "clarification",
        needsClarification: true,
        clarificationQuestion: answer,
      };
    }

    const finalState = appendUniversalTurn({
      state: cartResult.state,
      customerMessage: message,
      businessAnswer: answer,
      intent: decision.intent,
      pendingQuestion: decision.needsClarification
        ? decision.clarificationQuestion
        : null,
    });

    return resultForConversation({
      message,
      answer,
      mode,
      intent: decision.intent,
      plannerModel,
      responseModel,
      state: finalState,
      contextName: context.businessName,
      contextType: context.businessType,
      contextWarnings: context.warnings,
      scopes: decision.scopes,
      confidence: decision.confidence,
    });
  } catch (error) {
    return failedResult({ mode, error });
  }
}
