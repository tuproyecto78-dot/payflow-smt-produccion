import type {
  UniversalBusinessContext,
  UniversalDataScope,
  UniversalOffering,
} from "./universal-agent-contract";
import type {
  UniversalKnowledgeIndex,
  UniversalKnowledgeItem,
  UniversalKnowledgeMatch,
  UniversalKnowledgeRetrieval,
} from "./universal-conversation-contract";

const TOKEN_STOP_WORDS = new Set([
  "a",
  "al",
  "algo",
  "con",
  "cual",
  "cuales",
  "de",
  "del",
  "el",
  "en",
  "es",
  "esta",
  "estas",
  "este",
  "estos",
  "hay",
  "la",
  "las",
  "lo",
  "los",
  "me",
  "para",
  "por",
  "que",
  "quiero",
  "quisiera",
  "tiene",
  "tienen",
  "un",
  "una",
  "unas",
  "unos",
]);

export function normalizeUniversalText(value: string): string {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stemToken(value: string): string {
  let token = normalizeUniversalText(value);
  if (token.length > 7 && token.endsWith("mente")) token = token.slice(0, -5);
  if (token.length > 5 && token.endsWith("es")) token = token.slice(0, -2);
  else if (token.length > 4 && token.endsWith("s")) token = token.slice(0, -1);
  return token;
}

export function universalTokens(value: string): string[] {
  return normalizeUniversalText(value)
    .split(" ")
    .map(stemToken)
    .filter((token) => token.length > 1 && !TOKEN_STOP_WORDS.has(token));
}

function compact(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function item(input: UniversalKnowledgeItem): UniversalKnowledgeItem {
  return {
    ...input,
    title: compact(input.title, 240),
    content: compact(input.content, 1600),
    category: compact(input.category, 120),
  };
}

function offeringContent(offering: UniversalOffering): string {
  const price =
    offering.price !== null && Number.isFinite(offering.price)
      ? `${offering.price.toFixed(2)} ${offering.currency}`
      : "";
  return [offering.name, offering.category, offering.description, price]
    .filter(Boolean)
    .join(" · ");
}

export function buildUniversalKnowledgeIndex(
  context: UniversalBusinessContext
): UniversalKnowledgeIndex {
  const items: UniversalKnowledgeItem[] = [];

  for (const offering of context.offerings) {
    if (!offering.available || !offering.name) continue;
    items.push(
      item({
        key: `knowledge:${offering.key}`,
        kind: "offering",
        scope: "offerings",
        title: offering.name,
        content: offeringContent(offering),
        category: offering.category,
        offeringKey: offering.key,
        authority:
          offering.source === "knowledge_center"
            ? "knowledge_center"
            : offering.source === "onboarding"
              ? "business"
              : "catalog",
      })
    );
  }

  context.promotions.forEach((promotion, index) => {
    items.push(
      item({
        key: `promotion:${index + 1}`,
        kind: "promotion",
        scope: "promotions",
        title: `Promoción ${index + 1}`,
        content: promotion,
        category: "promotions",
        offeringKey: null,
        authority: "business",
      })
    );
  });

  context.faqs.forEach((faq, index) => {
    items.push(
      item({
        key: `faq:${index + 1}`,
        kind: "faq",
        scope: "faqs",
        title: faq.question,
        content: faq.answer,
        category: "faq",
        offeringKey: null,
        authority: "knowledge_center",
      })
    );
  });

  context.hours.forEach((hours, index) => {
    items.push(
      item({
        key: `hours:${index + 1}`,
        kind: "hours",
        scope: "hours",
        title: "Horario",
        content: hours,
        category: "hours",
        offeringKey: null,
        authority: "business",
      })
    );
  });

  const paymentContent = [
    context.payment.summary,
    ...context.payment.conditions,
  ]
    .filter(Boolean)
    .join(" ");
  if (paymentContent) {
    items.push(
      item({
        key: "payment:configured",
        kind: "payment",
        scope: "payment",
        title: "Formas de pago",
        content: paymentContent,
        category: "payment",
        offeringKey: null,
        authority: "business",
      })
    );
  }

  context.policies.forEach((policy, index) => {
    items.push(
      item({
        key: `policy:${index + 1}`,
        kind: "policy",
        scope: "policies",
        title: `Política ${index + 1}`,
        content: policy,
        category: "policies",
        offeringKey: null,
        authority: "business",
      })
    );
  });

  if (context.address) {
    items.push(
      item({
        key: "address:business",
        kind: "address",
        scope: "address",
        title: "Dirección",
        content: context.address,
        category: "address",
        offeringKey: null,
        authority: "business",
      })
    );
  }

  context.rules.forEach((rule, index) => {
    items.push(
      item({
        key: `rule:${index + 1}`,
        kind: "rule",
        scope: "rules",
        title: `Regla ${index + 1}`,
        content: rule,
        category: "rules",
        offeringKey: null,
        authority: "workflow",
      })
    );
  });

  for (const entry of context.knowledge || []) {
    const key = compact(entry.key, 180);
    const title = compact(entry.title, 240);
    const content = compact(entry.content, 1600);
    if (!key || (!title && !content)) continue;
    items.push(
      item({
        key,
        kind: "document",
        scope: "faqs",
        title: title || "Información del negocio",
        content,
        category: entry.category || "general",
        offeringKey: null,
        authority: "knowledge_center",
      })
    );
  }

  return {
    clientId: context.clientId,
    businessName: context.businessName,
    items,
  };
}

function scoreKnowledgeItem(
  query: string,
  queryTokens: string[],
  knowledgeItem: UniversalKnowledgeItem
): number {
  if (!queryTokens.length) return 0;
  const title = normalizeUniversalText(knowledgeItem.title);
  const content = normalizeUniversalText(knowledgeItem.content);
  const category = normalizeUniversalText(knowledgeItem.category);
  const titleTokens = new Set(universalTokens(title));
  const contentTokens = new Set(universalTokens(content));
  const categoryTokens = new Set(universalTokens(category));
  let score = 0;
  let matched = 0;

  if (title && query === title) score += 120;
  else if (title && (title.includes(query) || query.includes(title))) score += 70;

  for (const token of queryTokens) {
    if (titleTokens.has(token)) {
      score += 24;
      matched += 1;
    } else if (categoryTokens.has(token)) {
      score += 16;
      matched += 1;
    } else if (contentTokens.has(token)) {
      score += 7;
      matched += 1;
    }
  }

  if (matched === queryTokens.length) score += 24;
  if (score > 0 && knowledgeItem.authority === "catalog") score += 3;
  return score;
}

export function retrieveUniversalKnowledge(input: {
  query: string;
  index: UniversalKnowledgeIndex;
  scopes?: UniversalDataScope[];
  limit?: number;
}): UniversalKnowledgeRetrieval {
  const query = normalizeUniversalText(input.query);
  const queryTokens = universalTokens(query);
  const allowedScopes = input.scopes?.length
    ? new Set(input.scopes)
    : null;
  const limit = Math.max(1, Math.min(30, input.limit || 12));

  const matches: UniversalKnowledgeMatch[] = input.index.items
    .filter((knowledgeItem) =>
      allowedScopes ? allowedScopes.has(knowledgeItem.scope) : true
    )
    .map((knowledgeItem) => ({
      item: knowledgeItem,
      score: scoreKnowledgeItem(query, queryTokens, knowledgeItem),
    }))
    .filter((match) => match.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.item.title.localeCompare(right.item.title, "es")
    )
    .slice(0, limit);

  return {
    query,
    matches,
    offeringKeys: Array.from(
      new Set(
        matches
          .map((match) => match.item.offeringKey)
          .filter((key): key is string => Boolean(key))
      )
    ),
    knowledgeKeys: matches.map((match) => match.item.key),
  };
}

export function knowledgeItemsForScopes(
  index: UniversalKnowledgeIndex,
  scopes: UniversalDataScope[],
  limit = 12
): UniversalKnowledgeItem[] {
  const allowed = new Set(scopes);
  return index.items
    .filter((knowledgeItem) => allowed.has(knowledgeItem.scope))
    .slice(0, Math.max(1, Math.min(30, limit)));
}
