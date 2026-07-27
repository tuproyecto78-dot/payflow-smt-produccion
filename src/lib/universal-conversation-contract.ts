import type {
  UniversalBusinessContext,
  UniversalDataScope,
  UniversalPlannerDecision,
} from "./universal-agent-contract";

export const UNIVERSAL_CONVERSATION_ARCHITECTURE_VERSION = 3 as const;

export type UniversalConversationAct =
  | "social"
  | "informational"
  | "transactional"
  | "cart_management"
  | "unknown";

export type UniversalIntentTopic =
  | "greeting"
  | "offerings"
  | "promotions"
  | "payment"
  | "hours"
  | "location"
  | "policies"
  | "appointments"
  | "recommendation"
  | "cart"
  | "general";

export type UniversalIntentMode =
  | "greet"
  | "browse"
  | "detail"
  | "recommend"
  | "select"
  | "quantity"
  | "total"
  | "reset"
  | "ask";

export type UniversalIntentSource = "local" | "model" | "memory" | "policy";

export type UniversalOrderOperation = "add" | "set";

/**
 * A semantic line item. Ambiguous items keep their validated candidate keys
 * instead of guessing a catalog entry.
 */
export type UniversalOrderItemCandidate = {
  phrase: string;
  quantity: number | null;
  offeringKey: string | null;
  candidateOfferingKeys: string[];
};

/**
 * Semantic interpretation only. It deliberately has no cart actions.
 * Mutations are created later by the deterministic policy layer.
 */
export type UniversalIntentCandidate = {
  act: UniversalConversationAct;
  topic: UniversalIntentTopic;
  mode: UniversalIntentMode;
  confidence: number;
  offeringKeys: string[];
  knowledgeKeys: string[];
  quantity: number | null;
  selectionIndex: number | null;
  orderItems: UniversalOrderItemCandidate[];
  orderOperation: UniversalOrderOperation;
  checkoutRequested: boolean;
  paymentMethod: string | null;
  source: UniversalIntentSource;
  evidence: string[];
};

export type UniversalKnowledgeKind =
  | "offering"
  | "promotion"
  | "faq"
  | "document"
  | "hours"
  | "payment"
  | "policy"
  | "address"
  | "rule";

export type UniversalKnowledgeItem = {
  key: string;
  kind: UniversalKnowledgeKind;
  scope: UniversalDataScope;
  title: string;
  content: string;
  category: string;
  offeringKey: string | null;
  authority: "catalog" | "business" | "knowledge_center" | "workflow";
};

export type UniversalKnowledgeMatch = {
  item: UniversalKnowledgeItem;
  score: number;
};

export type UniversalKnowledgeIndex = {
  clientId: string;
  businessName: string;
  items: UniversalKnowledgeItem[];
};

export type UniversalKnowledgeRetrieval = {
  query: string;
  matches: UniversalKnowledgeMatch[];
  offeringKeys: string[];
  knowledgeKeys: string[];
};

export type UniversalSemanticClassifierInput = {
  message: string;
  business: {
    name: string;
    type: string;
    tone: string;
  };
  localCandidate: UniversalIntentCandidate;
  relevantKnowledge: Array<{
    key: string;
    kind: UniversalKnowledgeKind;
    title: string;
    content: string;
  }>;
  memory: {
    lastPresentedOptions: Array<{
      number: number;
      key: string;
      name: string;
    }>;
    lastPresentedListPurpose: "information" | "purchase";
    pendingOffering: string | null;
    checkoutStage:
      | "browsing"
      | "building_order"
      | "awaiting_payment"
      | "payment_selected";
    selectedPaymentMethod: string | null;
    pendingOrderItemCount: number;
    recentTurns: Array<{ role: "customer" | "business"; text: string }>;
  };
};

export type UniversalSemanticClassifierResult = {
  candidate: UniversalIntentCandidate;
  model: string;
};

export type UniversalResponseComposerInput = {
  message: string;
  intent: UniversalIntentCandidate;
  decision: UniversalPlannerDecision;
  safeFallback: string;
  validatedFacts: unknown;
  relevantKnowledge: Array<{
    key: string;
    kind: UniversalKnowledgeKind;
    title: string;
    content: string;
  }>;
  business: {
    name: string;
    type: string;
    tone: string;
  };
};

export type UniversalResponseComposerResult = {
  answer: string;
  model: string;
};

export type UniversalConversationAdapters = {
  classifySemantics?: (
    input: UniversalSemanticClassifierInput
  ) => Promise<UniversalSemanticClassifierResult | null>;
  composeResponse?: (
    input: UniversalResponseComposerInput
  ) => Promise<UniversalResponseComposerResult | null>;
};

export type UniversalConversationDiagnostics = {
  architectureVersion: typeof UNIVERSAL_CONVERSATION_ARCHITECTURE_VERSION;
  classifierModel: string;
  responseModel: string;
  localCandidate: UniversalIntentCandidate;
  resolvedCandidate: UniversalIntentCandidate;
  retrievedKnowledgeCount: number;
  contextWarnings: string[];
};

export type UniversalConversationResult<State> = {
  answer: string;
  decision: UniversalPlannerDecision;
  state: State;
  context: UniversalBusinessContext;
  retrieval: UniversalKnowledgeRetrieval;
  diagnostics: UniversalConversationDiagnostics;
};
