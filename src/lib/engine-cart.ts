import "server-only";

import {
  executeWorkflow as executeGeminiWorkflow,
  type AiDeliveryMode,
  type GeminiEngineOptions,
} from "./engine-gemini";
import { sanitizeCustomerAnswer } from "./business-context-contract";
import { loadBusinessContext } from "./business-context-server";
import {
  emptySimulatorConversationState,
  getSimulatorCartMetrics,
  isPotentialCommerceMessage,
  normalizeSimulatorConversationState,
  processSimulatorCommerceMessage,
  type SimulatorCommerceResult,
  type SimulatorConversationState,
} from "./simulator-commerce";
import type {
  ExecutionResult,
  FlowEdge,
  FlowNode,
  LogEntry,
  WhatsAppSimMessage,
} from "./workflow-types";

export type { AiDeliveryMode };
export type { GeminiEngineOptions };

const STATE_KEY = "__payflow_simulator_state";

function nowIso() {
  return new Date().toISOString();
}

function entry(input: Omit<LogEntry, "timestamp">): LogEntry {
  return { ...input, timestamp: nowIso() };
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

function commerceResult(input: {
  message: string;
  mode: AiDeliveryMode;
  context: Awaited<ReturnType<typeof loadBusinessContext>>;
  commerce: SimulatorCommerceResult;
}): ExecutionResult {
  const started = nowIso();
  const safeAnswer = sanitizeCustomerAnswer(
    input.commerce.answer,
    input.context.businessName
  );
  const responseText =
    input.mode === "assisted"
      ? `📝 Sugerencia pendiente de aprobación:\n\n${safeAnswer}`
      : safeAnswer;
  const metrics = getSimulatorCartMetrics(input.commerce.state, input.context);

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
      nodeId: "simulator-input",
      nodeType: "whatsapp",
      nodeLabel: "Mensaje del cliente",
      status: "success",
      message: `Intención detectada: ${input.commerce.intent}.`,
    }),
    entry({
      nodeId: "business-context",
      nodeType: "catalog_search",
      nodeLabel: "Contexto del negocio",
      status: "success",
      message: `Contexto cargado para ${input.context.businessName}.`,
    }),
    entry({
      nodeId:
        input.commerce.dataSource === "cart" ? "temporary-cart" : "catalog-context",
      nodeType: "catalog_search",
      nodeLabel:
        input.commerce.dataSource === "cart" ? "Pedido temporal" : "Catálogo real",
      status: "success",
      message:
        input.commerce.dataSource === "cart"
          ? `Pedido temporal: ${metrics.unitCount} unidad(es), sin ejecutar cobros.`
          : `Coincidencias reales consultadas: ${input.commerce.matchedProductCount}.`,
    }),
    entry({
      nodeId: "simulator-response",
      nodeType: "ai_agent",
      nodeLabel: "Reglas comerciales del negocio",
      status: "success",
      message: `Respuesta determinista · modo: ${input.mode}.`,
    }),
  ];

  if (input.mode === "assisted") {
    entries.push(
      entry({
        nodeId: "approval-gate",
        nodeType: "end",
        nodeLabel: "Aprobación requerida",
        status: "info",
        message:
          "La respuesta quedó como sugerencia. No se envió por WhatsApp ni se ejecutó ningún cobro.",
      })
    );
  }

  return {
    status: "success",
    entries,
    variables: {
      user_response: input.message,
      ai_response: safeAnswer,
      ai_intent: input.commerce.intent,
      ai_provider: "business-rules",
      ai_model: "simulator-commerce-v1",
      ai_mode: input.mode,
      business_context_loaded: true,
      business_name: input.context.businessName,
      business_type: input.context.businessType,
      simulator_state: input.commerce.state,
      cart_item_count: metrics.itemCount,
      cart_unit_count: metrics.unitCount,
      cart_totals: metrics.totals,
      payments_executed: false,
      whatsapp_sent: false,
      ai_requires_approval: input.mode === "assisted",
    },
    whatsappMessages: messages,
    finalNode: input.mode === "assisted" ? "approval-gate" : "simulator-response",
  };
}

function commerceFailure(input: {
  mode: AiDeliveryMode;
  error: unknown;
  state: SimulatorConversationState;
}): ExecutionResult {
  const message =
    input.error instanceof Error
      ? input.error.message
      : "No se pudo procesar el pedido temporal.";
  return {
    status: "failed",
    entries: [
      entry({
        nodeId: "temporary-cart",
        nodeType: "ai_agent",
        nodeLabel: "Pedido temporal",
        status: "error",
        message,
      }),
    ],
    variables: {
      ai_mode: input.mode,
      simulator_state: input.state,
      payments_executed: false,
      whatsapp_sent: false,
    },
    whatsappMessages: [],
    finalNode: "temporary-cart",
    error: message,
  };
}

export async function executeWorkflow(
  nodes: FlowNode[],
  edges: FlowEdge[],
  options: GeminiEngineOptions = {}
): Promise<ExecutionResult> {
  const cleanOptions = withoutInternalState(options);
  const message = options.clientMessage?.trim();
  if (!message) return executeGeminiWorkflow(nodes, edges, cleanOptions);

  const mode: AiDeliveryMode = options.aiMode || "simulation";
  if (
    (mode === "automatic" && process.env.AI_AUTOMATIC_MODE_ENABLED !== "true") ||
    !options.clientId
  ) {
    return executeGeminiWorkflow(nodes, edges, cleanOptions);
  }

  const rawState = readSimulatorState(options);
  if (!isPotentialCommerceMessage(message, rawState)) {
    return executeGeminiWorkflow(nodes, edges, cleanOptions);
  }

  try {
    const context = await loadBusinessContext({ clientId: options.clientId, nodes });
    const state = normalizeSimulatorConversationState(rawState, context);
    const commerce = processSimulatorCommerceMessage({ message, context, state });
    if (!commerce) return executeGeminiWorkflow(nodes, edges, cleanOptions);
    return commerceResult({ message, mode, context, commerce });
  } catch (error) {
    return commerceFailure({
      mode,
      error,
      state: emptySimulatorConversationState(),
    });
  }
}
