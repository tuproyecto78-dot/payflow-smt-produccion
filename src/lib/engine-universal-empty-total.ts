import "server-only";

import {
  executeWorkflow as executeUniversalWorkflow,
  type AiDeliveryMode,
  type GeminiEngineOptions,
} from "./engine-universal-core-runtime";
import {
  buildEmptyCartTotalState,
  EMPTY_CART_TOTAL_ANSWER,
  isEmptyCartTotalRequest,
  parseSimulatorState,
  simulatorCartIsEmpty,
} from "./universal-empty-cart-total";
import type {
  ExecutionResult,
  FlowEdge,
  FlowNode,
  LogEntry,
  WhatsAppSimMessage,
} from "./workflow-types";

export type { AiDeliveryMode, GeminiEngineOptions };

const SIMULATOR_STATE_KEY = "__payflow_simulator_state";

function nowIso(): string {
  return new Date().toISOString();
}

function entry(input: Omit<LogEntry, "timestamp">): LogEntry {
  return { ...input, timestamp: nowIso() };
}

function emptyCartTotalResult(input: {
  message: string;
  mode: AiDeliveryMode;
  state: Record<string, unknown>;
}): ExecutionResult {
  const started = nowIso();
  const simulatorState = buildEmptyCartTotalState({
    state: input.state,
    customerMessage: input.message,
  });
  const responseText =
    input.mode === "assisted"
      ? `📝 Sugerencia pendiente de aprobación:\n\n${EMPTY_CART_TOTAL_ANSWER}`
      : EMPTY_CART_TOTAL_ANSWER;

  const whatsappMessages: WhatsAppSimMessage[] = [
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
      nodeId: "intent-classifier",
      nodeType: "ai_agent",
      nodeLabel: "Clasificador universal",
      status: "success",
      message: "Intención: cart_total · carrito vacío.",
    }),
    entry({
      nodeId: "temporary-cart",
      nodeType: "catalog_search",
      nodeLabel: "Pedido temporal",
      status: "success",
      message: "Carrito temporal vacío. No se consultó ni mostró catálogo.",
    }),
  ];

  if (input.mode === "assisted") {
    entries.push(
      entry({
        nodeId: "approval-gate",
        nodeType: "end",
        nodeLabel: "Aprobación requerida",
        status: "info",
        message: "La respuesta no fue enviada ni ejecutó pagos.",
      })
    );
  }

  return {
    status: "success",
    entries,
    variables: {
      user_response: input.message,
      ai_response: EMPTY_CART_TOTAL_ANSWER,
      ai_intent: "cart_total",
      ai_confidence: 1,
      ai_scopes: ["identity", "cart"],
      ai_provider: "universal-empty-cart-guard",
      ai_model: "empty-cart-total-v1",
      ai_mode: input.mode,
      ai_architecture_version: 3,
      ai_conversation_act: "cart_management",
      ai_topic: "cart",
      ai_topics: ["cart"],
      business_context_loaded: false,
      simulator_state: simulatorState,
      cart_item_count: 0,
      payments_executed: false,
      whatsapp_sent: false,
      ai_requires_approval: input.mode === "assisted",
    },
    whatsappMessages,
    finalNode: input.mode === "assisted" ? "approval-gate" : "simulator-response",
  };
}

export async function executeWorkflow(
  nodes: FlowNode[],
  edges: FlowEdge[],
  options: GeminiEngineOptions = {}
): Promise<ExecutionResult> {
  const message = options.clientMessage?.trim();
  const mode: AiDeliveryMode = options.aiMode || "simulation";

  if (
    !message ||
    !options.clientId ||
    mode === "automatic" ||
    !isEmptyCartTotalRequest(message)
  ) {
    return executeUniversalWorkflow(nodes, edges, options);
  }

  const parsedState = parseSimulatorState(
    options.questionResponses?.[SIMULATOR_STATE_KEY]
  );
  if (!parsedState.parsed || !simulatorCartIsEmpty(parsedState.state)) {
    return executeUniversalWorkflow(nodes, edges, options);
  }

  return emptyCartTotalResult({
    message,
    mode,
    state: parsedState.state,
  });
}
