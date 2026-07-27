import type { UniversalBusinessContext } from "./universal-agent-contract";
import type {
  UniversalKnowledgeIndex,
  UniversalOrderItemCandidate,
  UniversalOrderOperation,
} from "./universal-conversation-contract";
import {
  normalizeUniversalText,
  universalTokens,
} from "./universal-knowledge-engine";

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

const ORDER_NOISE = new Set([
  "agrega",
  "agregar",
  "anade",
  "anadir",
  "comprar",
  "compro",
  "cuanto",
  "dame",
  "deme",
  "deseo",
  "es",
  "eso",
  "finalizar",
  "listo",
  "llevo",
  "mas",
  "necesito",
  "ordenar",
  "pagar",
  "pedi",
  "pedido",
  "pedir",
  "pido",
  "ponme",
  "por",
  "quiero",
  "quisiera",
  "suma",
  "te",
  "total",
  "unidad",
  "unidades",
  "y",
]);

const ADDITIVE_ROOTS = [
  "agreg",
  "anad",
  "ademas",
  "tambien",
  "otra",
  "otro",
  "mas",
  "suma",
];

type OfferingDescriptor = {
  key: string;
  name: string;
  normalizedName: string;
  nameTokens: string[];
  categoryTokens: string[];
};

type RankedOffering = {
  descriptor: OfferingDescriptor;
  score: number;
  coverage: number;
  exact: boolean;
};

function finiteInteger(value: unknown, min = 1, max = 99): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  const integer = Math.trunc(numeric);
  return integer >= min && integer <= max ? integer : null;
}

function numberValue(token: string): number | null {
  return finiteInteger(token) || NUMBER_WORDS[token] || null;
}

function descriptors(index: UniversalKnowledgeIndex): OfferingDescriptor[] {
  const seen = new Set<string>();
  const values: OfferingDescriptor[] = [];
  for (const item of index.items) {
    if (item.kind !== "offering" || !item.offeringKey) continue;
    if (seen.has(item.offeringKey)) continue;
    seen.add(item.offeringKey);
    values.push({
      key: item.offeringKey,
      name: item.title,
      normalizedName: normalizeUniversalText(item.title),
      nameTokens: universalTokens(item.title),
      categoryTokens: universalTokens(item.category),
    });
  }
  return values;
}

function semanticPhraseTokens(value: string): string[] {
  return universalTokens(value).filter(
    (token) => !ORDER_NOISE.has(token) && !numberValue(token)
  );
}

function rankOfferings(
  phrase: string,
  available: OfferingDescriptor[]
): RankedOffering[] {
  const normalizedPhrase = normalizeUniversalText(phrase);
  const phraseTokens = semanticPhraseTokens(phrase);
  if (!phraseTokens.length) return [];

  const documentFrequency = new Map<string, number>();
  for (const descriptor of available) {
    for (const token of new Set(descriptor.nameTokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }
  }

  return available
    .map((descriptor) => {
      const nameTokens = new Set(descriptor.nameTokens);
      const categoryTokens = new Set(descriptor.categoryTokens);
      const matchedName = phraseTokens.filter((token) => nameTokens.has(token));
      const matchedCategory = phraseTokens.filter(
        (token) => !nameTokens.has(token) && categoryTokens.has(token)
      );
      const exact =
        Boolean(descriptor.normalizedName) &&
        (normalizedPhrase === descriptor.normalizedName ||
          normalizedPhrase.includes(descriptor.normalizedName));
      const weighted = matchedName.reduce((sum, token) => {
        const frequency = documentFrequency.get(token) || 1;
        return sum + 8 / frequency;
      }, 0);
      const coverage = descriptor.nameTokens.length
        ? matchedName.length / descriptor.nameTokens.length
        : 0;
      const score =
        (exact ? 100 : 0) +
        weighted +
        coverage * 10 +
        matchedCategory.length * 1.5;
      return { descriptor, score, coverage, exact };
    })
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.coverage - left.coverage ||
        left.descriptor.name.localeCompare(right.descriptor.name, "es")
    );
}

function resolvedItem(
  phrase: string,
  quantity: number | null,
  available: OfferingDescriptor[]
): UniversalOrderItemCandidate | null {
  const ranked = rankOfferings(phrase, available);
  if (!ranked.length) return null;

  const top = ranked[0];
  const second = ranked[1];
  const unique =
    top.exact ||
    !second ||
    top.score >= second.score + 4 ||
    (top.coverage >= 0.6 && top.score >= second.score * 1.35);
  const floor = Math.max(2.5, top.score * 0.55);
  const candidateOfferingKeys = ranked
    .filter((entry) => entry.score >= floor)
    .slice(0, 5)
    .map((entry) => entry.descriptor.key);

  return {
    phrase: normalizeUniversalText(phrase).slice(0, 120),
    quantity,
    offeringKey: unique ? top.descriptor.key : null,
    candidateOfferingKeys: unique
      ? [top.descriptor.key]
      : candidateOfferingKeys,
  };
}

function quantitySegments(message: string): Array<{
  quantity: number;
  phrase: string;
}> {
  const words = normalizeUniversalText(message).split(" ").filter(Boolean);
  const positions = words
    .map((word, index) => ({ index, quantity: numberValue(word) }))
    .filter(
      (
        entry
      ): entry is {
        index: number;
        quantity: number;
      } => entry.quantity !== null
    );

  return positions
    .map((entry, positionIndex) => {
      const next = positions[positionIndex + 1]?.index ?? words.length;
      const phrase = words
        .slice(entry.index + 1, next)
        .filter((word) => !ORDER_NOISE.has(word))
        .join(" ")
        .trim();
      return { quantity: entry.quantity, phrase };
    })
    .filter((entry) => semanticPhraseTokens(entry.phrase).length > 0);
}

function operationForMessage(message: string): UniversalOrderOperation {
  const tokens = normalizeUniversalText(message).split(" ").filter(Boolean);
  return tokens.some((token) =>
    ADDITIVE_ROOTS.some(
      (root) => token === root || token.startsWith(root)
    )
  )
    ? "add"
    : "set";
}

function checkoutSignal(message: string): boolean {
  const text = normalizeUniversalText(message);
  return (
    /\b(?:total|cuanto es|cuanto debo|a pagar|como pago|finalizar)\b/.test(text) ||
    /\b(?:eso es todo|nada mas|no deseo mas|listo con eso)\b/.test(text)
  );
}

export function parseUniversalOrderRequest(input: {
  message: string;
  index: UniversalKnowledgeIndex;
}): {
  items: UniversalOrderItemCandidate[];
  operation: UniversalOrderOperation;
  checkoutRequested: boolean;
} {
  const available = descriptors(input.index);
  const segments = quantitySegments(input.message);
  const items = (
    segments.length
      ? segments.map((segment) =>
          resolvedItem(segment.phrase, segment.quantity, available)
        )
      : [resolvedItem(input.message, null, available)]
  ).filter((item): item is UniversalOrderItemCandidate => Boolean(item));

  return {
    items,
    operation: operationForMessage(input.message),
    checkoutRequested: checkoutSignal(input.message),
  };
}

function singleSelectionNumber(message: string): number | null {
  const text = normalizeUniversalText(message)
    .replace(/^(?:opcion|numero|la opcion|el numero)\s+/, "")
    .trim();
  return numberValue(text);
}

export function continueUniversalOrderDraft(input: {
  message: string;
  items: UniversalOrderItemCandidate[];
  index: UniversalKnowledgeIndex;
}): {
  items: UniversalOrderItemCandidate[];
  changed: boolean;
} {
  const unresolvedIndex = input.items.findIndex(
    (item) => !item.offeringKey
  );
  if (unresolvedIndex < 0) {
    return { items: input.items, changed: false };
  }

  const current = input.items[unresolvedIndex];
  const availableByKey = new Map(
    descriptors(input.index).map((descriptor) => [descriptor.key, descriptor])
  );
  const candidates = current.candidateOfferingKeys
    .map((key) => availableByKey.get(key))
    .filter(
      (descriptor): descriptor is OfferingDescriptor => Boolean(descriptor)
    );
  if (!candidates.length) {
    return { items: input.items, changed: false };
  }

  const selection = singleSelectionNumber(input.message);
  const selectedByNumber = selection ? candidates[selection - 1] || null : null;
  const ranked = selectedByNumber
    ? []
    : rankOfferings(input.message, candidates);
  const selectedByName =
    ranked.length &&
    (ranked[0].exact ||
      !ranked[1] ||
      ranked[0].score >= ranked[1].score + 4)
      ? ranked[0].descriptor
      : null;
  const selected = selectedByNumber || selectedByName;
  if (!selected) {
    return { items: input.items, changed: false };
  }

  const items = input.items.map((item, index) =>
    index === unresolvedIndex
      ? {
          ...item,
          offeringKey: selected.key,
          candidateOfferingKeys: [selected.key],
        }
      : item
  );
  return { items, changed: true };
}

type PaymentMethodDefinition = {
  label: string;
  aliases: string[];
};

const PAYMENT_METHODS: PaymentMethodDefinition[] = [
  {
    label: "transferencia bancaria",
    aliases: ["transferencia", "transferencia bancaria"],
  },
  { label: "tarjeta", aliases: ["tarjeta", "credito", "debito"] },
  { label: "efectivo", aliases: ["efectivo", "contra entrega"] },
  { label: "depósito", aliases: ["deposito"] },
  {
    label: "pago digital",
    aliases: ["link de pago", "enlace de pago", "payphone", "pago digital"],
  },
];

export function configuredPaymentMethods(
  payment: UniversalBusinessContext["payment"]
): string[] {
  const configured = normalizeUniversalText(
    [payment.summary, ...payment.conditions].join(" ")
  );
  return PAYMENT_METHODS.filter((method) =>
    method.aliases.some((alias) =>
      configured.includes(normalizeUniversalText(alias))
    )
  ).map((method) => method.label);
}

export function selectedConfiguredPaymentMethod(input: {
  message: string;
  payment: UniversalBusinessContext["payment"];
}): string | null {
  const configured = new Set(configuredPaymentMethods(input.payment));
  const message = normalizeUniversalText(input.message);
  return (
    PAYMENT_METHODS.find(
      (method) =>
        configured.has(method.label) &&
        method.aliases.some((alias) =>
          message.includes(normalizeUniversalText(alias))
        )
    )?.label || null
  );
}

export function isAffirmativeCommercialReply(message: string): boolean {
  const text = normalizeUniversalText(message);
  return /^(?:si|claro|ok|okay|dale|de acuerdo|perfecto|agregalo|anadelo)$/.test(
    text
  );
}
