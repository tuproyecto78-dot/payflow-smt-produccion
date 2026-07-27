import "server-only";

import {
  executeWorkflow as executeLegacyWorkflow,
  type AiDeliveryMode,
  type GeminiEngineOptions,
} from "./engine-gemini";
import { emptyUniversalAgentState } from "./universal-agent-contract";
import { runUniversalConversation } from "./universal-agent-orchestrator";
import { loadUniversalBusinessContext } from "./universal-business-context-server";
import {
  classifyUniversalSemanticsWithGemini,
  composeUniversalResponseWithGemini,
} from "./universal-gemini-server";
import { SIMULATOR_STATE_KEY } from "./simulator-session-memory-server";
import type { UniversalSessionState } from "./universal-session-memory";
import type {
  ExecutionResult,
  FlowEdge,
  FlowNode,
  LogEntry,
  WhatsAppSimMessage,
} from "./workflow-types";

export type { AiDeliveryMode, GeminiEngineOptions };

function nowIso() {
  return new Date().toISOString();
}

function entry(input: Omit<LogEntry, "timestamp">): LogEntry {
  return { ...input, timestamp: nowIso() };
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

function resultForConversation(input: {
  message: string;
  answer: string;
  mode: AiDeliveryMode;
  state: UniversalSessionState;
  businessName: string;
  businessType: string;
  warnings: string[];
  decision: {
    intent: string;
    confidence: number;
    scopes: string[];
  };
  architectureVersion: number;
  act: string;
  topic: string;
  classifierModel: string;
  responseModel: string;
  knowledgeCount: number;
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
      nodeId: "business-context",
      nodeType: "catalog_search",
      nodeLabel: "Contexto del negocio",
      status: "success",
      message: `Contexto aislado cargado para ${input.businessName}.`,
    }),
    entry({
      nodeId: "knowledge-retrieval",
      nodeType: "catalog_search",
      nodeLabel: "Centro de conocimiento",
      status: "success",
      message: `Conocimiento relevante validado: ${input.knowledgeCount} referencia(s).`,
    }),
    entry({
      nodeId: "intent-classifier",
      nodeType: "ai_agent",
      nodeLabel: "Clasificador universal",
      status: "success",
      message: `Intención: ${input.decision.intent} · confianza: ${input.decision.confidence.toFixed(
        2
      )}.`,
    }),
    entry({
      nodeId: "action-policy",
      nodeType: "ai_agent",
      nodeLabel: "Política de acciones",
      status: "success",
      message:
        "La intención fue validada antes de permitir cambios en el carrito temporal.",
    }),
    entry({
      nodeId: "conversation-memory",
      nodeType: "ai_agent",
      nodeLabel: "Memoria conversacional",
      status: "success",
      message: `Opciones recordadas: ${input.state.sessionMemory.lastPresentedOfferingKeys.length} · producto pendiente: ${
        input.state.sessionMemory.pendingOfferingKey ? "sí" : "no"
      }.`,
    }),
  ];

  for (const warning of input.warnings.slice(0, 4)) {
    entries.push(
      entry({
        nodeId: "business-context",
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
        message: "La respuesta no fue enviada ni ejecutó pagos.",
      })
    );
  }

  return {
    status: "success",
    entries,
    variables: {
      user_response: input.message,
      ai_response: input.answer,
      ai_intent: input.decision.intent,
      ai_confidence: input.decision.confidence,
      ai_scopes: input.decision.scopes,
      ai_provider: "universal-conversation-core",
      ai_model: `${input.classifierModel}+${input.responseModel}`,
      ai_mode: input.mode,
      ai_architecture_version: input.architectureVersion,
      ai_conversation_act: input.act,
      ai_topic: input.topic,
      business_context_loaded: true,
      business_name: input.businessName,
      business_type: input.businessType,
      knowledge_matches: input.knowledgeCount,
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

function emptySessionState(): UniversalSessionState {
  return {
    ...emptyUniversalAgentState(),
    sessionMemory: {
      version: 2,
      lastPresentedOfferingKeys: [],
      lastPresentedListPurpose: "information",
      pendingOfferingKey: null,
      intentCounts: {},
      lastSelectionIndex: null,
    },
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
      ai_architecture_version: 3,
      simulator_state: input.state || emptySessionState(),
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
    return failedResult({
      mode,
      error: new Error("El modo automático está deshabilitado."),
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
    const conversation = await runUniversalConversation({
      message,
      context,
      rawState: readSimulatorState(options),
      adapters: {
        classifySemantics: classifyUniversalSemanticsWithGemini,
        composeResponse: composeUniversalResponseWithGemini,
      },
    });

    return resultForConversation({
      message,
      answer: conversation.answer,
      mode,
      state: conversation.state,
      businessName: context.businessName,
      businessType: context.businessType,
      warnings: conversation.diagnostics.contextWarnings,
      decision: {
        intent: conversation.decision.intent,
        confidence: conversation.decision.confidence,
        scopes: conversation.decision.scopes,
      },
      architectureVersion: conversation.diagnostics.architectureVersion,
      act: conversation.diagnostics.resolvedCandidate.act,
      topic: conversation.diagnostics.resolvedCandidate.topic,
      classifierModel: conversation.diagnostics.classifierModel,
      responseModel: conversation.diagnostics.responseModel,
      knowledgeCount: conversation.diagnostics.retrievedKnowledgeCount,
    });
  } catch (error) {
    return failedResult({ mode, error });
  }
}
