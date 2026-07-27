import {
  answerUsesOnlyKnownMoney,
  applyUniversalCartActions,
  buildUniversalValidatedFacts,
  sanitizeUniversalAnswer,
  type UniversalPlannerDecision,
} from "./universal-agent-contract";
import type {
  UniversalConversationAdapters,
  UniversalConversationResult,
  UniversalIntentCandidate,
  UniversalIntentTopic,
  UniversalKnowledgeRetrieval,
} from "./universal-conversation-contract";
import {
  UNIVERSAL_CONVERSATION_ARCHITECTURE_VERSION,
} from "./universal-conversation-contract";
import { planUniversalDecision } from "./universal-decision-policy";
import {
  classifyLocalUniversalIntent,
  normalizeUniversalIntentCandidate,
  resolveUniversalIntentCandidate,
} from "./universal-intent-classifier";
import {
  buildUniversalKnowledgeIndex,
  retrieveUniversalKnowledge,
} from "./universal-knowledge-engine";
import {
  appendUniversalSessionTurn,
  buildUniversalSessionPlannerMemory,
  normalizeUniversalSessionState,
  transitionUniversalSessionMemory,
  type UniversalSessionState,
} from "./universal-session-memory";
import {
  composeUniversalCommercialAnswer,
  mayUseControlledModelResponse,
} from "./universal-response-composer";
import type { UniversalBusinessContext, UniversalDataScope } from "./universal-agent-contract";

function scopesForTopic(topic: UniversalIntentTopic): UniversalDataScope[] {
  if (topic === "offerings" || topic === "recommendation") return ["offerings"];
  if (topic === "promotions") return ["promotions", "faqs"];
  if (topic === "payment") return ["payment", "faqs"];
  if (topic === "hours") return ["hours", "faqs"];
  if (topic === "location") return ["address", "faqs"];
  if (topic === "policies") return ["policies", "faqs", "rules"];
  if (topic === "appointments") return ["hours", "faqs", "rules"];
  if (topic === "cart") return ["cart"];
  return ["faqs", "policies", "rules", "address"];
}

function mergeReferencedKnowledge(input: {
  retrieval: UniversalKnowledgeRetrieval;
  candidate: UniversalIntentCandidate;
  index: ReturnType<typeof buildUniversalKnowledgeIndex>;
}): UniversalKnowledgeRetrieval {
  const byKey = new Map(
    input.index.items.map((knowledgeItem) => [knowledgeItem.key, knowledgeItem])
  );
  const existing = new Set(
    input.retrieval.matches.map((match) => match.item.key)
  );
  const matches = [...input.retrieval.matches];

  for (const key of input.candidate.knowledgeKeys) {
    if (existing.has(key)) continue;
    const knowledgeItem = byKey.get(key);
    if (!knowledgeItem) continue;
    matches.push({ item: knowledgeItem, score: 1 });
    existing.add(key);
  }

  return {
    ...input.retrieval,
    matches: matches.slice(0, 12),
    offeringKeys: Array.from(
      new Set([
        ...input.retrieval.offeringKeys,
        ...input.candidate.offeringKeys,
      ])
    ).slice(0, 12),
    knowledgeKeys: matches.map((match) => match.item.key),
  };
}

function invalidActionDecision(
  decision: UniversalPlannerDecision
): UniversalPlannerDecision {
  return {
    ...decision,
    intent: "clarification",
    cartActions: [],
    needsClarification: true,
    clarificationQuestion:
      "¿Puedes confirmar el producto o servicio y la cantidad?",
    responseGoal:
      "Pedir una aclaración porque la operación no coincide con datos reales.",
  };
}

function semanticInput(input: {
  message: string;
  context: UniversalBusinessContext;
  state: UniversalSessionState;
  localCandidate: UniversalIntentCandidate;
  retrieval: UniversalKnowledgeRetrieval;
}) {
  const memory = buildUniversalSessionPlannerMemory(input.state, input.context);
  return {
    message: input.message,
    business: {
      name: input.context.businessName,
      type: input.context.businessType,
      tone: input.context.tone,
    },
    localCandidate: input.localCandidate,
    relevantKnowledge: input.retrieval.matches.slice(0, 12).map((match) => ({
      key: match.item.key,
      kind: match.item.kind,
      title: match.item.title,
      content: match.item.content,
    })),
    memory: {
      lastPresentedOptions: memory.lastPresentedOptions.filter(
        (
          option
        ): option is {
          number: number;
          key: string;
          name: string;
        } => Boolean(option)
      ),
      lastPresentedListPurpose: memory.lastPresentedListPurpose,
      pendingOffering: memory.pendingOffering,
      recentTurns: input.state.recentTurns,
    },
  };
}

export async function runUniversalConversation(input: {
  message: string;
  context: UniversalBusinessContext;
  rawState?: unknown;
  adapters?: UniversalConversationAdapters;
}): Promise<UniversalConversationResult<UniversalSessionState>> {
  const message = input.message.trim().slice(0, 4000);
  const state = normalizeUniversalSessionState(input.rawState, input.context);
  const index = buildUniversalKnowledgeIndex(input.context);
  const initialRetrieval = retrieveUniversalKnowledge({
    query: message,
    index,
    limit: 12,
  });
  const localCandidate = classifyLocalUniversalIntent({
    message,
    state,
    retrieval: initialRetrieval,
  });

  let modelCandidate: UniversalIntentCandidate | null = null;
  let classifierModel = "universal-local-v3";
  if (input.adapters?.classifySemantics) {
    try {
      const classified = await input.adapters.classifySemantics(
        semanticInput({
          message,
          context: input.context,
          state,
          localCandidate,
          retrieval: initialRetrieval,
        })
      );
      if (classified) {
        modelCandidate = normalizeUniversalIntentCandidate({
          value: classified.candidate,
          index,
          source: "model",
        });
        classifierModel = classified.model;
      }
    } catch (error) {
      console.error("[universal-core] semantic classifier unavailable", error);
    }
  }

  const resolvedCandidate = resolveUniversalIntentCandidate({
    local: localCandidate,
    model: modelCandidate,
  });
  const scopedRetrieval = retrieveUniversalKnowledge({
    query: message,
    index,
    scopes: scopesForTopic(resolvedCandidate.topic),
    limit: 12,
  });
  const retrieval = mergeReferencedKnowledge({
    retrieval:
      scopedRetrieval.matches.length > 0 ? scopedRetrieval : initialRetrieval,
    candidate: resolvedCandidate,
    index,
  });

  let decision = planUniversalDecision({
    candidate: resolvedCandidate,
    context: input.context,
    state,
    index,
    retrieval,
  });
  const cartResult = applyUniversalCartActions({
    state,
    decision,
    context: input.context,
  });
  if (cartResult.invalidActions.length) {
    decision = invalidActionDecision(decision);
  }

  const memoryState = transitionUniversalSessionMemory({
    state: cartResult.state as UniversalSessionState,
    decision,
    context: input.context,
  });
  const validatedFacts = buildUniversalValidatedFacts({
    context: input.context,
    state: memoryState,
    decision,
    invalidActions: cartResult.invalidActions,
  });
  const safeFallback = composeUniversalCommercialAnswer({
    message,
    candidate: resolvedCandidate,
    decision,
    context: input.context,
    state: memoryState,
    retrieval,
  });

  let answer = safeFallback;
  let responseModel = "universal-commercial-v3";
  if (
    input.adapters?.composeResponse &&
    mayUseControlledModelResponse(decision) &&
    retrieval.matches.length > 0
  ) {
    try {
      const composed = await input.adapters.composeResponse({
        message,
        intent: resolvedCandidate,
        decision,
        safeFallback,
        validatedFacts,
        relevantKnowledge: retrieval.matches.slice(0, 8).map((match) => ({
          key: match.item.key,
          kind: match.item.kind,
          title: match.item.title,
          content: match.item.content,
        })),
        business: {
          name: input.context.businessName,
          type: input.context.businessType,
          tone: input.context.tone,
        },
      });
      const candidateAnswer = sanitizeUniversalAnswer(
        composed?.answer || "",
        input.context.businessName
      );
      if (
        composed &&
        candidateAnswer &&
        candidateAnswer.length <= 560 &&
        answerUsesOnlyKnownMoney(candidateAnswer, validatedFacts)
      ) {
        answer = candidateAnswer;
        responseModel = composed.model;
      }
    } catch (error) {
      console.error("[universal-core] response composer unavailable", error);
    }
  }

  const finalState = appendUniversalSessionTurn({
    state: memoryState,
    customerMessage: message,
    businessAnswer: answer,
    intent: decision.intent,
    pendingQuestion: decision.needsClarification
      ? decision.clarificationQuestion
      : null,
  });

  return {
    answer,
    decision,
    state: finalState,
    context: input.context,
    retrieval,
    diagnostics: {
      architectureVersion: UNIVERSAL_CONVERSATION_ARCHITECTURE_VERSION,
      classifierModel,
      responseModel,
      localCandidate,
      resolvedCandidate,
      retrievedKnowledgeCount: retrieval.matches.length,
      contextWarnings: input.context.warnings,
    },
  };
}
