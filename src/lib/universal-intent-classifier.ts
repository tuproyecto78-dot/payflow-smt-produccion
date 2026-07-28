import type { UniversalBusinessContext } from "./universal-agent-contract";
import type { UniversalSessionState } from "./universal-session-memory";
import {
  normalizeUniversalText,
  universalTokens,
} from "./universal-knowledge-engine";
import {
  continueUniversalOrderDraft,
  parseUniversalOrderRequest,
  selectedConfiguredPaymentMethod,
} from "./universal-order-parser";
import type {
  UniversalConversationAct,
  UniversalIntentCandidate,
  UniversalIntentMode,
  UniversalIntentTopic,
  UniversalKnowledgeIndex,
  UniversalKnowledgeRetrieval,
} from "./universal-conversation-contract";

const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  veinte: 20,
};

const VALID_ACTS = new Set<UniversalConversationAct>([
  "social",
  "informational",
  "transactional",
  "cart_management",
  "unknown",
]);

const VALID_TOPICS = new Set<UniversalIntentTopic>([
  "greeting",
  "offerings",
  "promotions",
  "payment",
  "hours",
  "location",
  "policies",
  "appointments",
  "recommendation",
  "cart",
  "general",
]);

const VALID_MODES = new Set<UniversalIntentMode>([
  "greet",
  "browse",
  "detail",
  "recommend",
  "select",
  "quantity",
  "total",
  "finish",
  "reset",
  "ask",
]);

/**
 * Language concepts are centralized and domain-neutral. Business vocabulary
 * comes from the dynamic knowledge index, never from hard-coded product names.
 */
const CONCEPTS = {
  greeting: ["hola", "saludo", "buenos", "buenas"],
  information: [
    "saber",
    "ver",
    "mostrar",
    "muestra",
    "informacion",
    "detalle",
    "conocer",
    "consultar",
  ],
  interrogative: ["que", "cual", "cuales", "cuanto", "como", "donde", "cuando"],
  purchase: [
    "agrega",
    "agregar",
    "anade",
    "anadir",
    "ponme",
    "dame",
    "deme",
    "comprar",
    "compro",
    "pedir",
    "pido",
    "llevo",
    "ordenar",
  ],
  desire: ["quiero", "quisiera", "deseo", "necesito"],
  offerings: [
    "menu",
    "catalogo",
    "carta",
    "producto",
    "productos",
    "servicio",
    "servicios",
    "plato",
    "platos",
    "opcion",
    "opciones",
    "precio",
    "precios",
    "venden",
    "ofrecen",
  ],
  promotions: ["promocion", "promociones", "promo", "oferta", "descuento"],
  payment: [
    "pago",
    "pagos",
    "pagar",
    "transferencia",
    "tarjeta",
    "efectivo",
    "deposito",
  ],
  hours: ["horario", "horarios", "abren", "abierto", "cierran", "atienden"],
  location: ["direccion", "ubicacion", "local", "sucursal", "donde"],
  policies: [
    "politica",
    "devolucion",
    "garantia",
    "cambio",
    "envio",
    "entrega",
    "cancelacion",
  ],
  appointments: ["cita", "agendar", "agenda", "turno", "reservar", "reserva"],
  recommendation: ["recomienda", "recomendacion", "sugiere", "sugerencia", "mejor"],
  cart: ["carrito", "pedido", "orden"],
  reset: ["nuevo", "nueva", "reiniciar", "vaciar", "borrar", "cancelar", "limpiar"],
  total: ["total", "suma", "debo"],
} as const;

function finiteInteger(value: unknown, min = 1, max = 99): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  const integer = Math.trunc(numeric);
  return integer >= min && integer <= max ? integer : null;
}

function hasConcept(tokens: string[], concepts: readonly string[]): boolean {
  return tokens.some((token) =>
    concepts.some(
      (concept) =>
        token === concept ||
        (concept.length >= 5 &&
          token.length >= 5 &&
          (token.startsWith(concept) || concept.startsWith(token)))
    )
  );
}

function uniqueValidKeys(values: unknown, valid: Set<string>, max = 12): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter((value) => valid.has(value))
    )
  ).slice(0, max);
}

function uniqueValidTopics(values: unknown): UniversalIntentTopic[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim() as UniversalIntentTopic)
        .filter((value) => VALID_TOPICS.has(value))
    )
  ).slice(0, VALID_TOPICS.size);
}

function bareNumber(message: string): number | null {
  const text = normalizeUniversalText(message);
  const match = text.match(
    /^(?:(?:opcion|numero|la opcion|el numero)\s+)?(\d{1,2})(?:\s+(?:unidad|unidades))?$/
  );
  if (match) return finiteInteger(match[1]);
  const withoutPrefix = text.replace(
    /^(?:opcion|numero|la opcion|el numero)\s+/,
    ""
  );
  return NUMBER_WORDS[withoutPrefix] || null;
}

function selectionAndQuantity(message: string): {
  selectionIndex: number;
  quantity: number;
} | null {
  const text = normalizeUniversalText(message);
  const direct = text.match(
    /^(?:(?:opcion|numero|la opcion|el numero)\s+)?(\d{1,2})\s*(?:x|por|cantidad)\s*(\d{1,2})(?:\s+unidades?)?$/
  );
  if (!direct) return null;
  const selectionIndex = finiteInteger(direct[1], 1, 100);
  const quantity = finiteInteger(direct[2], 1, 99);
  return selectionIndex && quantity ? { selectionIndex, quantity } : null;
}

function referencedSelection(message: string): number | null {
  const text = normalizeUniversalText(message);
  const match = text.match(
    /\b(?:opcion|numero)\s+(\d{1,2})\b|\b(?:agrega|anade|dame|deme|ponme|quiero|deseo|llevo)\s+(?:el|la)?\s*(\d{1,2})\b/
  );
  return finiteInteger(match?.[1] || match?.[2], 1, 100);
}

function explicitQuantity(message: string, selectionIndex: number | null): number | null {
  const text = normalizeUniversalText(message);
  const unitMatch = text.match(/\b(\d{1,2})\s+unidades?\b/);
  if (unitMatch) return finiteInteger(unitMatch[1]);

  const words = text.split(" ");
  for (let index = 0; index < words.length; index += 1) {
    const numeric = finiteInteger(words[index]) || NUMBER_WORDS[words[index]] || null;
    if (!numeric) continue;
    if (selectionIndex && numeric === selectionIndex) {
      continue;
    }
    return numeric;
  }
  return null;
}

function genericOfferingBrowse(tokens: string[]): boolean {
  const meaningful = tokens.filter(
    (token) =>
      !CONCEPTS.information.includes(
        token as (typeof CONCEPTS.information)[number]
      ) &&
      !CONCEPTS.interrogative.includes(
        token as (typeof CONCEPTS.interrogative)[number]
      ) &&
      !CONCEPTS.desire.includes(token as (typeof CONCEPTS.desire)[number]) &&
      !["el", "la", "los", "las", "con", "de", "hoy", "actuales", "disponibles"].includes(
        token
      )
  );
  return (
    meaningful.length > 0 &&
    meaningful.every((token) =>
      CONCEPTS.offerings.includes(token as (typeof CONCEPTS.offerings)[number])
    )
  );
}

function candidate(
  input: Partial<UniversalIntentCandidate> & {
    act: UniversalConversationAct;
    topic: UniversalIntentTopic;
    mode: UniversalIntentMode;
  }
): UniversalIntentCandidate {
  const allRequestedTopics = Array.from(
    new Set([input.topic, ...(input.requestedTopics || [])])
  ).filter((topic) => VALID_TOPICS.has(topic));
  const requestedTopics =
    allRequestedTopics.length > 1
      ? allRequestedTopics.filter((topic) => topic !== "general")
      : allRequestedTopics;
  return {
    act: input.act,
    topic: input.topic,
    requestedTopics,
    mode: input.mode,
    confidence: Math.max(0, Math.min(1, input.confidence ?? 0.8)),
    offeringKeys: input.offeringKeys || [],
    knowledgeKeys: input.knowledgeKeys || [],
    quantity: input.quantity ?? null,
    selectionIndex: input.selectionIndex ?? null,
    orderItems: input.orderItems || [],
    orderOperation: input.orderOperation || "set",
    checkoutRequested: input.checkoutRequested === true,
    paymentMethod: input.paymentMethod || null,
    source: input.source || "local",
    evidence: input.evidence || [],
  };
}

function hasPurchaseVerb(tokens: string[]): boolean {
  const roots = [
    "agreg",
    "anad",
    "compr",
    "encarg",
    "llev",
    "orden",
    "ped",
    "pon",
    "solicit",
  ];
  return tokens.some(
    (token) =>
      ["dame", "deme"].includes(token) ||
      roots.some((root) => token.startsWith(root))
  );
}

function hasOperationalPurchaseVerb(tokens: string[]): boolean {
  return tokens.some(
    (token) =>
      ["dame", "deme", "compro", "pido", "pedi", "llevo"].includes(
        token
      ) ||
      ["agreg", "anad", "encarg", "ponme", "solicit"].some((root) =>
        token.startsWith(root)
      )
  );
}

function isOrderCompletionReply(message: string): boolean {
  const text = normalizeUniversalText(message);
  return (
    /^(?:no(?: gracias)?|ya no|nada mas|solo eso|eso es todo)$/.test(text) ||
    /^(?:ya )?no (?:quiero|deseo) mas(?: solo lo que(?: le)? pedi)?$/.test(
      text
    ) ||
    /^solo lo que(?: le)? pedi$/.test(text)
  );
}

function requestsPaymentInformation(
  message: string,
  tokens: string[]
): boolean {
  if (!hasConcept(tokens, CONCEPTS.payment)) return false;
  const text = normalizeUniversalText(message);
  return (
    /\b(?:forma|formas|medio|medios|metodo|metodos|opcion|opciones)(?:\s+de)?\s+(?:pago|pagos|pagar)\b/.test(
      text
    ) ||
    /\bcomo\s+(?:(?:puedo|podemos|se|debo|debemos|prefiero|prefieres)\s+)?pagar\b/.test(
      text
    ) ||
    /\b(?:aceptan|reciben|tienen)\s+(?:pagos?|tarjeta|efectivo|transferencia|deposito)\b/.test(
      text
    ) ||
    (message.includes("?") &&
      !/\b(?:cuanto|total|suma|debo)\b/.test(text))
  );
}

function detectedRequestedTopics(input: {
  message: string;
  tokens: string[];
  state: UniversalSessionState;
  primary: UniversalIntentTopic;
}): UniversalIntentTopic[] {
  const { message, tokens, state, primary } = input;
  const topics: UniversalIntentTopic[] = [primary];
  const text = normalizeUniversalText(message);
  const totalRequest =
    hasConcept(tokens, CONCEPTS.total) ||
    /\b(?:cuanto es|cuanto debo)\b/.test(text);

  if (
    totalRequest &&
    (state.cart.length > 0 || hasConcept(tokens, CONCEPTS.cart))
  ) {
    topics.push("cart");
  }
  if (requestsPaymentInformation(message, tokens)) topics.push("payment");
  if (hasConcept(tokens, CONCEPTS.promotions)) topics.push("promotions");
  if (hasConcept(tokens, CONCEPTS.hours)) topics.push("hours");
  if (hasConcept(tokens, CONCEPTS.location)) topics.push("location");
  if (hasConcept(tokens, CONCEPTS.appointments)) topics.push("appointments");
  if (hasConcept(tokens, CONCEPTS.policies)) topics.push("policies");
  if (hasConcept(tokens, CONCEPTS.recommendation)) {
    topics.push("recommendation");
  }
  if (hasConcept(tokens, CONCEPTS.offerings)) topics.push("offerings");

  return Array.from(new Set(topics));
}

function inferredTopic(tokens: string[], state: UniversalSessionState): UniversalIntentTopic {
  if (hasConcept(tokens, CONCEPTS.promotions) || /\b\d+\s*x\s*\d+\b/.test(tokens.join(" "))) {
    return "promotions";
  }
  if (hasConcept(tokens, CONCEPTS.payment)) return "payment";
  if (hasConcept(tokens, CONCEPTS.hours)) return "hours";
  if (hasConcept(tokens, CONCEPTS.location)) return "location";
  if (hasConcept(tokens, CONCEPTS.appointments)) return "appointments";
  if (hasConcept(tokens, CONCEPTS.policies)) return "policies";
  if (hasConcept(tokens, CONCEPTS.recommendation)) return "recommendation";
  if (
    hasConcept(tokens, CONCEPTS.cart) &&
    (hasConcept(tokens, CONCEPTS.total) || state.cart.length > 0)
  ) {
    return "cart";
  }
  if (hasConcept(tokens, CONCEPTS.cart)) return "offerings";
  if (hasConcept(tokens, CONCEPTS.offerings)) return "offerings";
  if (
    hasConcept(tokens, CONCEPTS.purchase) &&
    hasConcept(tokens, CONCEPTS.interrogative)
  ) {
    return "offerings";
  }
  return "general";
}

export function classifyLocalUniversalIntent(input: {
  message: string;
  state: UniversalSessionState;
  context: UniversalBusinessContext;
  index: UniversalKnowledgeIndex;
  retrieval: UniversalKnowledgeRetrieval;
}): UniversalIntentCandidate {
  const text = normalizeUniversalText(input.message);
  const tokens = text.split(" ").filter(Boolean);
  const semanticTokens = universalTokens(text);
  const memory = input.state.sessionMemory;
  const parsedOrder = parseUniversalOrderRequest({
    message: input.message,
    index: input.index,
  });
  const combinedSelection = selectionAndQuantity(input.message);
  const number = bareNumber(input.message);
  const selectionIndex =
    combinedSelection?.selectionIndex ||
    referencedSelection(input.message) ||
    (memory.lastPresentedOfferingKeys.length ? number : null);
  const quantity =
    combinedSelection?.quantity ||
    (memory.pendingOfferingKey && number ? number : null) ||
    explicitQuantity(input.message, selectionIndex);

  if (isOrderCompletionReply(input.message)) {
    return candidate({
      act: "cart_management",
      topic: "cart",
      mode: "finish",
      confidence: 1,
      source: "local",
      evidence: ["order_selection_complete"],
    });
  }

  const configuredPaymentMethod = selectedConfiguredPaymentMethod({
    message: input.message,
    payment: input.context.payment,
  });
  const paymentSelection =
    configuredPaymentMethod &&
    input.state.cart.length > 0 &&
    ["awaiting_payment", "payment_selected"].includes(memory.checkoutStage) &&
    !input.message.includes("?") &&
    !hasConcept(tokens, CONCEPTS.interrogative);
  if (paymentSelection) {
    return candidate({
      act: "transactional",
      topic: "payment",
      mode: "select",
      confidence: 0.99,
      paymentMethod: configuredPaymentMethod,
      knowledgeKeys: input.retrieval.knowledgeKeys,
      source: "memory",
      evidence: ["configured_payment_selection"],
    });
  }

  if (memory.pendingOrderDraft) {
    const continued = continueUniversalOrderDraft({
      message: input.message,
      items: memory.pendingOrderDraft.items,
      index: input.index,
    });
    if (continued.changed) {
      return candidate({
        act: "transactional",
        topic: "offerings",
        mode: continued.items.every((item) => item.offeringKey)
          ? "quantity"
          : "select",
        confidence: 1,
        offeringKeys: continued.items
          .map((item) => item.offeringKey)
          .filter((key): key is string => Boolean(key)),
        knowledgeKeys: input.retrieval.knowledgeKeys,
        quantity:
          continued.items.length === 1
            ? continued.items[0].quantity
            : null,
        orderItems: continued.items,
        orderOperation: memory.pendingOrderDraft.operation,
        checkoutRequested:
          memory.pendingOrderDraft.checkoutRequested ||
          parsedOrder.checkoutRequested,
        source: "memory",
        evidence: ["memory_order_draft_continuation"],
      });
    }
  }

  if (
    memory.pendingOfferingKey &&
    quantity &&
    (number !== null || hasConcept(tokens, CONCEPTS.purchase))
  ) {
    return candidate({
      act: "transactional",
      topic: "offerings",
      mode: "quantity",
      confidence: 1,
      offeringKeys: [memory.pendingOfferingKey],
      knowledgeKeys: input.retrieval.knowledgeKeys,
      quantity,
      source: "memory",
      evidence: ["memory_pending_quantity"],
    });
  }

  if (memory.lastPresentedOfferingKeys.length && selectionIndex) {
    const selectedKey =
      memory.lastPresentedOfferingKeys[selectionIndex - 1] || null;
    const explicitTransaction =
      Boolean(combinedSelection) ||
      hasConcept(tokens, CONCEPTS.purchase) ||
      (hasConcept(tokens, CONCEPTS.desire) &&
        !hasConcept(tokens, CONCEPTS.information)) ||
      memory.lastPresentedListPurpose === "purchase";
    return candidate({
      act: explicitTransaction ? "transactional" : "informational",
      topic: "offerings",
      mode: quantity ? "quantity" : "select",
      confidence: selectedKey ? 1 : 0.98,
      offeringKeys: selectedKey ? [selectedKey] : [],
      knowledgeKeys: input.retrieval.knowledgeKeys,
      quantity,
      selectionIndex,
      source: "memory",
      evidence: [
        explicitTransaction
          ? combinedSelection
            ? "explicit_selection_quantity"
            : "purchase_selection"
          : "informational_selection",
      ],
    });
  }

  const wordCount = tokens.length;
  if (
    wordCount > 0 &&
    wordCount <= 5 &&
    hasConcept(tokens, CONCEPTS.greeting) &&
    !hasConcept(tokens, CONCEPTS.purchase)
  ) {
    return candidate({
      act: "social",
      topic: "greeting",
      mode: "greet",
      confidence: 0.99,
      knowledgeKeys: input.retrieval.knowledgeKeys,
      evidence: ["greeting"],
    });
  }

  const topic = inferredTopic(tokens, input.state);
  const informationCue =
    input.message.includes("?") ||
    hasConcept(tokens, CONCEPTS.information) ||
    hasConcept(tokens, CONCEPTS.interrogative);
  const strongPurchaseCue = hasPurchaseVerb(tokens);
  const operationalPurchaseCue = hasOperationalPurchaseVerb(tokens);
  const desireCue = hasConcept(tokens, CONCEPTS.desire);
  const informationQualifier =
    hasConcept(tokens, CONCEPTS.information) ||
    (hasConcept(tokens, ["precio", "precios", "cuesta", "costar"]) &&
      !strongPurchaseCue);
  const resetCue =
    hasConcept(tokens, CONCEPTS.reset) &&
    hasConcept(tokens, CONCEPTS.cart);
  const totalCue =
    hasConcept(tokens, CONCEPTS.total) ||
    (tokens.includes("cuanto") && hasConcept(tokens, CONCEPTS.payment));
  const requestedTopics = detectedRequestedTopics({
    message: input.message,
    tokens,
    state: input.state,
    primary: totalCue ? "cart" : topic,
  });

  if (resetCue) {
    return candidate({
      act: "cart_management",
      topic: "cart",
      mode: "reset",
      confidence: 0.99,
      evidence: ["cart_reset"],
    });
  }

  const completeOrderItems =
    parsedOrder.items.length > 0 &&
    parsedOrder.items.every((item) => item.quantity !== null);
  const explicitOrderItems =
    parsedOrder.items.length > 0 &&
    !informationQualifier &&
    (strongPurchaseCue || desireCue || completeOrderItems);

  if (explicitOrderItems) {
    const offeringKeys = parsedOrder.items
      .map((item) => item.offeringKey)
      .filter((key): key is string => Boolean(key));
    return candidate({
      act: "transactional",
      topic: "offerings",
      mode: parsedOrder.items.every(
        (item) => item.offeringKey && item.quantity
      )
        ? "quantity"
        : "select",
      confidence: strongPurchaseCue || completeOrderItems ? 0.98 : 0.92,
      offeringKeys,
      knowledgeKeys: input.retrieval.knowledgeKeys,
      quantity:
        parsedOrder.items.length === 1
          ? parsedOrder.items[0].quantity
          : null,
      selectionIndex,
      orderItems: parsedOrder.items,
      orderOperation: parsedOrder.operation,
      checkoutRequested: parsedOrder.checkoutRequested || totalCue,
      evidence: ["explicit_order_items"],
    });
  }

  if (
    totalCue &&
    parsedOrder.items.length === 0 &&
    (input.state.cart.length > 0 || hasConcept(tokens, CONCEPTS.cart))
  ) {
    return candidate({
      act: "cart_management",
      topic: "cart",
      requestedTopics,
      mode: "total",
      confidence: 0.98,
      evidence: ["cart_total"],
    });
  }

  const hasOfferingReference = input.retrieval.offeringKeys.length > 0;
  const transactional =
    !informationQualifier &&
    (!informationCue || operationalPurchaseCue) &&
    (strongPurchaseCue ||
      (desireCue &&
        (hasOfferingReference ||
          topic === "offerings" ||
          quantity !== null)));

  if (transactional) {
    return candidate({
      act: "transactional",
      topic: topic === "general" ? "offerings" : topic,
      requestedTopics,
      mode:
        selectionIndex !== null
          ? quantity
            ? "quantity"
            : "select"
          : hasOfferingReference && input.retrieval.offeringKeys.length === 1
            ? "detail"
            : "browse",
      confidence: strongPurchaseCue ? 0.97 : 0.9,
      offeringKeys: input.retrieval.offeringKeys,
      knowledgeKeys: input.retrieval.knowledgeKeys,
      quantity,
      selectionIndex,
      orderOperation: parsedOrder.operation,
      checkoutRequested: parsedOrder.checkoutRequested,
      evidence: ["explicit_purchase"],
    });
  }

  if (topic !== "general" || hasOfferingReference) {
    const resolvedTopic =
      topic === "general" && hasOfferingReference ? "offerings" : topic;
    const mode =
      resolvedTopic === "recommendation"
        ? "recommend"
        : resolvedTopic === "offerings" &&
            (genericOfferingBrowse(tokens) ||
              input.retrieval.offeringKeys.length !== 1)
          ? "browse"
          : "detail";
    return candidate({
      act: "informational",
      topic: resolvedTopic,
      requestedTopics: detectedRequestedTopics({
        message: input.message,
        tokens,
        state: input.state,
        primary: resolvedTopic,
      }),
      mode,
      confidence: informationCue || resolvedTopic !== "offerings" ? 0.95 : 0.86,
      offeringKeys: input.retrieval.offeringKeys,
      knowledgeKeys: input.retrieval.knowledgeKeys,
      quantity,
      selectionIndex,
      evidence: [informationCue ? "information_request" : "knowledge_match"],
    });
  }

  return candidate({
    act: "unknown",
    topic: "general",
    requestedTopics,
    mode: "ask",
    confidence: semanticTokens.length ? 0.45 : 0.2,
    knowledgeKeys: input.retrieval.knowledgeKeys,
    evidence: ["ambiguous"],
  });
}

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeUniversalIntentCandidate(input: {
  value: unknown;
  index: UniversalKnowledgeIndex;
  source?: "model" | "local";
}): UniversalIntentCandidate {
  const value = safeRecord(input.value);
  const validOfferingKeys = new Set(
    input.index.items
      .map((knowledgeItem) => knowledgeItem.offeringKey)
      .filter((key): key is string => Boolean(key))
  );
  const validKnowledgeKeys = new Set(
    input.index.items.map((knowledgeItem) => knowledgeItem.key)
  );
  const act = VALID_ACTS.has(value.act as UniversalConversationAct)
    ? (value.act as UniversalConversationAct)
    : "unknown";
  const topic = VALID_TOPICS.has(value.topic as UniversalIntentTopic)
    ? (value.topic as UniversalIntentTopic)
    : "general";
  const mode = VALID_MODES.has(value.mode as UniversalIntentMode)
    ? (value.mode as UniversalIntentMode)
    : "ask";
  const numericConfidence = Number(value.confidence);
  const orderItems = Array.isArray(value.orderItems)
    ? value.orderItems
        .slice(0, 12)
        .map((rawItem) => {
          const item = safeRecord(rawItem);
          const directKey = String(item.offeringKey || "").trim();
          const offeringKey = validOfferingKeys.has(directKey)
            ? directKey
            : null;
          const candidateOfferingKeys = uniqueValidKeys(
            item.candidateOfferingKeys,
            validOfferingKeys,
            5
          );
          const phrase = String(item.phrase || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 120);
          if (!phrase || (!offeringKey && !candidateOfferingKeys.length)) {
            return null;
          }
          return {
            phrase,
            quantity: finiteInteger(item.quantity),
            offeringKey,
            candidateOfferingKeys: offeringKey
              ? [offeringKey]
              : candidateOfferingKeys,
          };
        })
        .filter(
          (
            item
          ): item is {
            phrase: string;
            quantity: number | null;
            offeringKey: string | null;
            candidateOfferingKeys: string[];
          } => Boolean(item)
        )
    : [];

  return candidate({
    act,
    topic,
    requestedTopics: uniqueValidTopics(value.requestedTopics),
    mode,
    confidence: Number.isFinite(numericConfidence) ? numericConfidence : 0,
    offeringKeys: uniqueValidKeys(value.offeringKeys, validOfferingKeys),
    knowledgeKeys: uniqueValidKeys(value.knowledgeKeys, validKnowledgeKeys),
    quantity: finiteInteger(value.quantity),
    selectionIndex: finiteInteger(value.selectionIndex, 1, 100),
    orderItems,
    orderOperation: value.orderOperation === "add" ? "add" : "set",
    checkoutRequested: value.checkoutRequested === true,
    paymentMethod:
      typeof value.paymentMethod === "string"
        ? value.paymentMethod.replace(/\s+/g, " ").trim().slice(0, 80) || null
        : null,
    source: input.source || "model",
    evidence: Array.isArray(value.evidence)
      ? value.evidence
          .map((entry) => String(entry || "").trim().slice(0, 80))
          .filter(Boolean)
          .slice(0, 8)
      : [],
  });
}

function transactionIsLocallyAuthorized(local: UniversalIntentCandidate): boolean {
  return (
    local.act === "transactional" &&
    local.evidence.some((entry) =>
      [
        "explicit_purchase",
        "explicit_selection_quantity",
        "purchase_selection",
        "memory_pending_quantity",
        "explicit_order_items",
        "memory_order_draft_continuation",
        "configured_payment_selection",
      ].includes(entry)
    )
  );
}

/**
 * Gemini can resolve ambiguity and entities, but it cannot grant permission
 * for a transaction. The local/memory evidence remains the authority.
 */
export function resolveUniversalIntentCandidate(input: {
  local: UniversalIntentCandidate;
  model?: UniversalIntentCandidate | null;
}): UniversalIntentCandidate {
  const local = input.local;
  const model = input.model;
  if (!model || model.confidence < 0.55) return local;

  if (local.act === "cart_management" || local.act === "social") return local;

  if (local.act === "informational") {
    const explicitLocalTopic = local.topic !== "general";
    const offeringTopic =
      local.topic === "offerings" || local.topic === "recommendation";
    return {
      ...local,
      topic: local.topic === "general" ? model.topic : local.topic,
      mode: local.mode === "ask" ? model.mode : local.mode,
      offeringKeys: offeringTopic
        ? local.offeringKeys.length > 0
          ? local.offeringKeys
          : model.offeringKeys
        : [],
      knowledgeKeys: Array.from(
        new Set([...local.knowledgeKeys, ...model.knowledgeKeys])
      ).slice(0, 12),
      requestedTopics: explicitLocalTopic
        ? local.requestedTopics
        : Array.from(
            new Set([...local.requestedTopics, ...model.requestedTopics])
          ),
      confidence: Math.max(local.confidence, Math.min(model.confidence, 0.96)),
      source: "policy",
      evidence: [...local.evidence, "model_semantic_enrichment"],
    };
  }

  if (transactionIsLocallyAuthorized(local)) {
    return {
      ...local,
      topic: local.topic === "general" ? model.topic : local.topic,
      offeringKeys:
        local.offeringKeys.length > 0
          ? local.offeringKeys
          : model.offeringKeys,
      knowledgeKeys: Array.from(
        new Set([...local.knowledgeKeys, ...model.knowledgeKeys])
      ).slice(0, 12),
      requestedTopics: Array.from(
        new Set([...local.requestedTopics, ...model.requestedTopics])
      ),
      quantity: local.quantity ?? model.quantity,
      orderItems:
        local.orderItems.length > 0 ? local.orderItems : model.orderItems,
      orderOperation: local.orderOperation,
      checkoutRequested:
        local.checkoutRequested || model.checkoutRequested,
      paymentMethod: local.paymentMethod,
      confidence: Math.max(local.confidence, Math.min(model.confidence, 0.96)),
      source: "policy",
      evidence: [...local.evidence, "model_entity_resolution"],
    };
  }

  if (local.act === "unknown" && model.act !== "transactional") {
    return {
      ...model,
      source: "policy",
      offeringKeys: model.offeringKeys,
      knowledgeKeys: model.knowledgeKeys,
      evidence: [...model.evidence, "model_ambiguity_resolution"],
    };
  }

  return local;
}
