import {
  sanitizeCustomerAnswer,
  type BusinessPaymentProvider,
} from "./business-context-contract";

export type UniversalOfferingKind = "product" | "service";

export type UniversalOffering = {
  key: string;
  kind: UniversalOfferingKind;
  name: string;
  description: string;
  price: number | null;
  currency: string;
  category: string;
  available: boolean;
};

export type UniversalFaq = {
  question: string;
  answer: string;
};

export type UniversalBusinessContext = {
  clientId: string;
  businessName: string;
  businessType: string;
  tone: string;
  hours: string[];
  offerings: UniversalOffering[];
  promotions: string[];
  payment: {
    provider: BusinessPaymentProvider;
    summary: string;
    conditions: string[];
  };
  faqs: UniversalFaq[];
  policies: string[];
  address: string;
  humanHandoffRules: string[];
  appointmentConditions: string[];
  rules: string[];
  summary: string;
  warnings: string[];
};

export type UniversalCartItemState = {
  offeringKey: string;
  quantity: number;
};

export type UniversalConversationTurn = {
  role: "customer" | "business";
  text: string;
};

export type UniversalAgentState = {
  version: 2;
  cart: UniversalCartItemState[];
  recentTurns: UniversalConversationTurn[];
  lastIntent: string;
  pendingQuestion: string | null;
};

export type UniversalDataScope =
  | "identity"
  | "offerings"
  | "promotions"
  | "hours"
  | "payment"
  | "faqs"
  | "policies"
  | "address"
  | "cart"
  | "rules";

export type UniversalSelectionMode =
  | "none"
  | "preview"
  | "selected"
  | "complete";

export type UniversalCartAction = {
  type: "add" | "set" | "remove" | "clear";
  offeringKey?: string;
  quantity?: number;
};

export type UniversalPlannerDecision = {
  intent: string;
  confidence: number;
  scopes: UniversalDataScope[];
  selection: {
    mode: UniversalSelectionMode;
    offeringKeys: string[];
    maxItems: number;
  };
  cartActions: UniversalCartAction[];
  needsClarification: boolean;
  clarificationQuestion: string;
  responseGoal: string;
};

export type UniversalCartSnapshot = {
  items: Array<{
    offeringKey: string;
    name: string;
    quantity: number;
    unitPrice: number;
    currency: string;
    subtotal: number;
  }>;
  itemCount: number;
  unitCount: number;
  totals: Record<string, number>;
};

const VALID_SCOPES = new Set<UniversalDataScope>([
  "identity",
  "offerings",
  "promotions",
  "hours",
  "payment",
  "faqs",
  "policies",
  "address",
  "cart",
  "rules",
]);

const VALID_SELECTION_MODES = new Set<UniversalSelectionMode>([
  "none",
  "preview",
  "selected",
  "complete",
]);

const VALID_CART_ACTIONS = new Set<UniversalCartAction["type"]>([
  "add",
  "set",
  "remove",
  "clear",
]);

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function compactText(value: unknown, maxLength: number): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function finiteInteger(value: unknown, min: number, max: number): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  const integer = Math.trunc(numeric);
  return integer >= min && integer <= max ? integer : null;
}

function normalizeName(value: string): string {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function createOfferingKey(
  kind: UniversalOfferingKind,
  name: string,
  suffix = ""
): string {
  const slug = normalizeName(name).replace(/\s+/g, "-").slice(0, 80) || "item";
  const safeSuffix = normalizeName(suffix).replace(/\s+/g, "-").slice(0, 24);
  return `${kind}:${slug}${safeSuffix ? `:${safeSuffix}` : ""}`;
}

export function emptyUniversalAgentState(): UniversalAgentState {
  return {
    version: 2,
    cart: [],
    recentTurns: [],
    lastIntent: "",
    pendingQuestion: null,
  };
}

function findOfferingByLegacyName(
  context: UniversalBusinessContext,
  name: string
): UniversalOffering | null {
  const normalized = normalizeName(name);
  if (!normalized) return null;
  return (
    context.offerings.find(
      (offering) => normalizeName(offering.name) === normalized
    ) || null
  );
}

export function normalizeUniversalAgentState(
  value: unknown,
  context: UniversalBusinessContext
): UniversalAgentState {
  const input = safeRecord(value);
  const validOfferings = new Map(
    context.offerings
      .filter(
        (offering) =>
          offering.available &&
          offering.price !== null &&
          Number.isFinite(offering.price) &&
          offering.price > 0
      )
      .map((offering) => [offering.key, offering])
  );
  const mergedCart = new Map<string, number>();
  const rawCart = Array.isArray(input.cart) ? input.cart.slice(0, 60) : [];

  for (const raw of rawCart) {
    const item = safeRecord(raw);
    const directKey = compactText(item.offeringKey, 160);
    const legacyName = compactText(item.productName, 180);
    const offering = directKey
      ? validOfferings.get(directKey) || null
      : findOfferingByLegacyName(context, legacyName);
    const quantity = finiteInteger(item.quantity, 1, 99);
    if (!offering || !quantity) continue;
    mergedCart.set(
      offering.key,
      Math.min(99, (mergedCart.get(offering.key) || 0) + quantity)
    );
  }

  const recentTurns: UniversalConversationTurn[] = [];
  const rawTurns = Array.isArray(input.recentTurns)
    ? input.recentTurns.slice(-8)
    : [];
  for (const raw of rawTurns) {
    const turn = safeRecord(raw);
    const role = turn.role === "business" ? "business" : "customer";
    const text = compactText(turn.text, 500);
    if (text) recentTurns.push({ role, text });
  }

  return {
    version: 2,
    cart: [...mergedCart.entries()].map(([offeringKey, quantity]) => ({
      offeringKey,
      quantity,
    })),
    recentTurns,
    lastIntent: compactText(input.lastIntent, 100),
    pendingQuestion: compactText(input.pendingQuestion, 260) || null,
  };
}

export function normalizePlannerDecision(
  value: unknown,
  context: UniversalBusinessContext
): UniversalPlannerDecision {
  const input = safeRecord(value);
  const selectionInput = safeRecord(input.selection);
  const validKeys = new Set(context.offerings.map((offering) => offering.key));

  const scopes = Array.isArray(input.scopes)
    ? Array.from(
        new Set(
          input.scopes
            .map((scope) => compactText(scope, 40) as UniversalDataScope)
            .filter((scope) => VALID_SCOPES.has(scope))
        )
      )
    : [];

  if (!scopes.includes("identity")) scopes.unshift("identity");

  const mode = VALID_SELECTION_MODES.has(
    selectionInput.mode as UniversalSelectionMode
  )
    ? (selectionInput.mode as UniversalSelectionMode)
    : "none";
  const offeringKeys = Array.isArray(selectionInput.offeringKeys)
    ? Array.from(
        new Set(
          selectionInput.offeringKeys
            .map((key) => compactText(key, 160))
            .filter((key) => validKeys.has(key))
        )
      ).slice(0, mode === "complete" ? 150 : 5)
    : [];
  const requestedMax = finiteInteger(selectionInput.maxItems, 1, 150);
  const maxItems =
    mode === "complete"
      ? Math.min(requestedMax || context.offerings.length || 1, 150)
      : Math.min(requestedMax || 5, 5);

  const cartActions: UniversalCartAction[] = [];
  if (Array.isArray(input.cartActions)) {
    for (const raw of input.cartActions.slice(0, 12)) {
      const action = safeRecord(raw);
      const type = action.type as UniversalCartAction["type"];
      if (!VALID_CART_ACTIONS.has(type)) continue;
      if (type === "clear") {
        cartActions.push({ type });
        continue;
      }
      const offeringKey = compactText(action.offeringKey, 160);
      const quantity = finiteInteger(action.quantity, 1, 99);
      if (!offeringKey || !quantity) continue;
      cartActions.push({ type, offeringKey, quantity });
    }
  }

  const confidenceValue = Number(input.confidence);
  const confidence = Number.isFinite(confidenceValue)
    ? Math.max(0, Math.min(1, confidenceValue))
    : 0;
  const needsClarification = input.needsClarification === true;
  const clarificationQuestion = compactText(input.clarificationQuestion, 260);

  return {
    intent: compactText(input.intent, 100) || "clarification",
    confidence,
    scopes,
    selection: { mode, offeringKeys, maxItems },
    cartActions,
    needsClarification,
    clarificationQuestion:
      clarificationQuestion ||
      (needsClarification ? "¿Puedes darme un poco más de detalle?" : ""),
    responseGoal: compactText(input.responseGoal, 260),
  };
}

export function applyUniversalCartActions(input: {
  state: UniversalAgentState;
  decision: UniversalPlannerDecision;
  context: UniversalBusinessContext;
}): {
  state: UniversalAgentState;
  invalidActions: string[];
  changed: boolean;
} {
  const cart = new Map(
    input.state.cart.map((item) => [item.offeringKey, item.quantity])
  );
  const offerings = new Map(
    input.context.offerings.map((offering) => [offering.key, offering])
  );
  const invalidActions: string[] = [];
  let changed = false;

  for (const action of input.decision.cartActions) {
    if (action.type === "clear") {
      if (cart.size) changed = true;
      cart.clear();
      continue;
    }

    const offering = action.offeringKey
      ? offerings.get(action.offeringKey)
      : undefined;
    if (
      !offering ||
      !offering.available ||
      offering.price === null ||
      !Number.isFinite(offering.price) ||
      offering.price <= 0 ||
      !action.quantity
    ) {
      invalidActions.push(action.offeringKey || "oferta-no-identificada");
      continue;
    }

    const previous = cart.get(offering.key) || 0;
    if (action.type === "add") {
      cart.set(offering.key, Math.min(99, previous + action.quantity));
      changed = true;
    } else if (action.type === "set") {
      cart.set(offering.key, action.quantity);
      changed = previous !== action.quantity;
    } else if (action.type === "remove") {
      const next = Math.max(0, previous - action.quantity);
      if (next === 0) cart.delete(offering.key);
      else cart.set(offering.key, next);
      changed = changed || previous !== next;
    }
  }

  return {
    state: {
      ...input.state,
      cart: [...cart.entries()].map(([offeringKey, quantity]) => ({
        offeringKey,
        quantity,
      })),
    },
    invalidActions,
    changed,
  };
}

export function getUniversalCartSnapshot(
  state: UniversalAgentState,
  context: UniversalBusinessContext
): UniversalCartSnapshot {
  const offerings = new Map(
    context.offerings.map((offering) => [offering.key, offering])
  );
  const items: UniversalCartSnapshot["items"] = [];
  const totals: Record<string, number> = {};

  for (const item of state.cart) {
    const offering = offerings.get(item.offeringKey);
    if (
      !offering ||
      !offering.available ||
      offering.price === null ||
      offering.price <= 0
    ) {
      continue;
    }
    const subtotal = offering.price * item.quantity;
    items.push({
      offeringKey: offering.key,
      name: offering.name,
      quantity: item.quantity,
      unitPrice: offering.price,
      currency: offering.currency,
      subtotal,
    });
    totals[offering.currency] = (totals[offering.currency] || 0) + subtotal;
  }

  return {
    items,
    itemCount: items.length,
    unitCount: items.reduce((sum, item) => sum + item.quantity, 0),
    totals,
  };
}

function compactOffering(offering: UniversalOffering) {
  return {
    key: offering.key,
    kind: offering.kind,
    name: offering.name,
    category: offering.category || null,
    price: offering.price,
    currency: offering.currency,
    available: offering.available,
    description: compactText(offering.description, 140) || null,
  };
}

export function buildUniversalPlannerPayload(
  context: UniversalBusinessContext,
  state: UniversalAgentState,
  message: string
) {
  return {
    customerMessage: compactText(message, 4000),
    business: {
      name: context.businessName,
      type: context.businessType || null,
      tone: context.tone,
      hours: context.hours,
      promotions: context.promotions,
      payment: context.payment,
      faqs: context.faqs.slice(0, 30),
      policies: context.policies.slice(0, 30),
      address: context.address || null,
      humanHandoffRules: context.humanHandoffRules.slice(0, 20),
      appointmentConditions: context.appointmentConditions.slice(0, 20),
      rules: context.rules.slice(0, 20),
      summary: context.summary || null,
      offerings: context.offerings.slice(0, 150).map(compactOffering),
    },
    conversation: {
      recentTurns: state.recentTurns,
      pendingQuestion: state.pendingQuestion,
      lastIntent: state.lastIntent,
      cart: getUniversalCartSnapshot(state, context),
    },
  };
}

export function buildUniversalValidatedFacts(input: {
  context: UniversalBusinessContext;
  state: UniversalAgentState;
  decision: UniversalPlannerDecision;
  invalidActions?: string[];
}) {
  const byKey = new Map(
    input.context.offerings.map((offering) => [offering.key, offering])
  );
  let selected: UniversalOffering[] = [];

  if (input.decision.selection.mode === "complete") {
    selected = input.context.offerings.slice(0, input.decision.selection.maxItems);
  } else if (input.decision.selection.offeringKeys.length) {
    selected = input.decision.selection.offeringKeys
      .map((key) => byKey.get(key))
      .filter((offering): offering is UniversalOffering => Boolean(offering))
      .slice(0, input.decision.selection.maxItems);
  } else if (
    input.decision.selection.mode === "preview" ||
    input.decision.scopes.includes("offerings")
  ) {
    selected = input.context.offerings.slice(0, input.decision.selection.maxItems);
  }

  const requested = new Set(input.decision.scopes);
  const cart = getUniversalCartSnapshot(input.state, input.context);

  return {
    identity: {
      businessName: input.context.businessName,
      businessType: input.context.businessType || null,
      tone: input.context.tone,
      summary: input.context.summary || null,
    },
    selectedOfferings: requested.has("offerings")
      ? selected.map(compactOffering)
      : [],
    promotions: requested.has("promotions")
      ? input.context.promotions
      : [],
    hours: requested.has("hours") ? input.context.hours : [],
    payment: requested.has("payment") ? input.context.payment : null,
    faqs: requested.has("faqs") ? input.context.faqs.slice(0, 10) : [],
    policies: requested.has("policies")
      ? input.context.policies.slice(0, 15)
      : [],
    address: requested.has("address")
      ? input.context.address || null
      : null,
    cart: requested.has("cart") || input.decision.cartActions.length ? cart : null,
    rules: requested.has("rules") ? input.context.rules.slice(0, 15) : [],
    humanHandoffRules: input.context.humanHandoffRules.slice(0, 10),
    appointmentConditions: input.context.appointmentConditions.slice(0, 10),
    missing: {
      offerings:
        requested.has("offerings") && input.context.offerings.length === 0,
      promotions:
        requested.has("promotions") && input.context.promotions.length === 0,
      hours: requested.has("hours") && input.context.hours.length === 0,
      payment:
        requested.has("payment") &&
        (input.context.payment.provider === "none" ||
          input.context.payment.provider === "unknown"),
      address: requested.has("address") && !input.context.address,
      invalidCartActions: input.invalidActions || [],
    },
    safety: {
      whatsappRealEnabled: false,
      paymentsRealEnabled: false,
      automaticModeEnabled: false,
    },
  };
}

export function appendUniversalTurn(input: {
  state: UniversalAgentState;
  customerMessage: string;
  businessAnswer: string;
  intent: string;
  pendingQuestion?: string | null;
}): UniversalAgentState {
  const recentTurns = [
    ...input.state.recentTurns,
    { role: "customer" as const, text: compactText(input.customerMessage, 500) },
    { role: "business" as const, text: compactText(input.businessAnswer, 500) },
  ].filter((turn) => turn.text).slice(-8);

  return {
    ...input.state,
    recentTurns,
    lastIntent: compactText(input.intent, 100),
    pendingQuestion: compactText(input.pendingQuestion, 260) || null,
  };
}

export function sanitizeUniversalAnswer(
  answer: string,
  businessName: string
): string {
  return sanitizeCustomerAnswer(
    answer
      .replace(/^```(?:json|text)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim(),
    businessName,
    560
  );
}

function knownMoneyValues(facts: unknown): Set<string> {
  const values = new Set<string>();
  const visit = (value: unknown, parentKey = "") => {
    if (typeof value === "number" && Number.isFinite(value)) {
      if (/price|subtotal|total/i.test(parentKey)) {
        values.add(value.toFixed(2));
        values.add(String(value));
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, parentKey));
      return;
    }
    if (value && typeof value === "object") {
      Object.entries(value as Record<string, unknown>).forEach(([key, item]) =>
        visit(item, parentKey ? `${parentKey}.${key}` : key)
      );
    }
  };
  visit(facts);
  return values;
}

export function answerUsesOnlyKnownMoney(
  answer: string,
  facts: unknown
): boolean {
  const known = knownMoneyValues(facts);
  const matches = answer.matchAll(/\b(\d+(?:[.,]\d{1,2})?)\s*(USD|EUR|COP|PEN|MXN|ARS)\b/gi);
  for (const match of matches) {
    const normalized = Number(match[1].replace(",", "."));
    if (!Number.isFinite(normalized)) continue;
    if (!known.has(normalized.toFixed(2)) && !known.has(String(normalized))) {
      return false;
    }
  }
  return true;
}
