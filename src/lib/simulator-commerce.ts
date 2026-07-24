import type { BusinessContext, BusinessProduct } from "./business-context-contract";

export type SimulatorCartItemState = { productName: string; quantity: number };
export type SimulatorPendingAction = {
  kind: "product" | "quantity";
  query: string;
  quantity: number | null;
  candidateNames: string[];
};
export type SimulatorConversationState = {
  version: 1;
  cart: SimulatorCartItemState[];
  lastShownProductNames: string[];
  pending: SimulatorPendingAction | null;
};
export type SimulatorCommerceIntent =
  | "product_query"
  | "add_to_cart"
  | "cart_total"
  | "cart_summary"
  | "cart_clear"
  | "clarification";
export type SimulatorCommerceResult = {
  intent: SimulatorCommerceIntent;
  answer: string;
  state: SimulatorConversationState;
  dataSource: "catalog" | "cart";
  matchedProductCount: number;
};

type ScoredProduct = { product: BusinessProduct; score: number };
const MAX_QTY = 99;
const MAX_OPTIONS = 5;
const NUMBER_WORDS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11,
  doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16,
  diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
};
const ADD_TERMS = ["quiero", "dame", "deme", "agrega", "anade", "ponme", "quisiera", "me llevo"];
const QUESTION_TERMS = ["tienen", "tiene", "hay", "venden", "ofrecen", "manejan", "cuanto cuesta", "cuanto cuestan", "precio de", "precios de"];
const TOTAL_TERMS = ["cuanto pago", "cuanto debo", "cuanto es", "cuanto seria", "total", "suma del pedido"];
const SUMMARY_TERMS = ["mi pedido", "que llevo", "que he pedido", "que pedi", "ver pedido", "resumen del pedido", "carrito"];
const CLEAR_TERMS = ["vaciar carrito", "vaciar pedido", "cancelar pedido", "borrar pedido", "nuevo pedido"];
const STOP_WORDS = new Set([
  "a", "al", "algo", "agrega", "anade", "con", "cuanto", "cuantos", "cuesta", "cuestan",
  "dame", "de", "del", "deme", "deseo", "el", "en", "es", "esta", "estas", "este", "estos",
  "hay", "la", "las", "lo", "los", "me", "ofrecen", "para", "pedir", "pedido", "plato", "platos",
  "ponme", "por", "precio", "precios", "producto", "productos", "que", "quiero", "quisiera", "tiene",
  "tienen", "un", "una", "unas", "unos", "venden",
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeCommerceText(value: string): string {
  return value.toLocaleLowerCase("es").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ").trim();
}

function token(value: string): string {
  let result = normalizeCommerceText(value);
  if (result.length > 4 && result.endsWith("s")) result = result.slice(0, -1);
  return result;
}
function tokens(value: string): string[] {
  return normalizeCommerceText(value).split(" ").map(token).filter(Boolean);
}
function contains(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}
function visibleProducts(context: BusinessContext): BusinessProduct[] {
  return context.products.filter((product) =>
    Boolean(product.name.trim()) && Number.isFinite(product.price) && product.price > 0 &&
    (!product.trackInventory || product.stock > 0)
  );
}
function findByName(products: BusinessProduct[], name: string): BusinessProduct | null {
  const target = normalizeCommerceText(name);
  return products.find((product) => normalizeCommerceText(product.name) === target) || null;
}
function quantityFrom(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number.parseInt(String(value || ""), 10);
  return Number.isFinite(number) && number >= 1 ? Math.min(MAX_QTY, Math.trunc(number)) : null;
}
function extractQuantity(message: string): number | null {
  const text = normalizeCommerceText(message);
  const digits = text.match(/\b(\d{1,2})\b/);
  if (digits) return quantityFrom(digits[1]);
  for (const word of text.split(" ")) if (NUMBER_WORDS[word]) return NUMBER_WORDS[word];
  return null;
}
function extractQuery(message: string): string {
  return normalizeCommerceText(message).split(" ")
    .filter((word) => !STOP_WORDS.has(word) && !NUMBER_WORDS[word] && !/^\d+$/.test(word))
    .join(" ").trim();
}
function money(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}
function optionLine(product: BusinessProduct): string {
  return `• ${product.name} — ${money(product.price, product.currency)}`;
}

export function emptySimulatorConversationState(): SimulatorConversationState {
  return { version: 1, cart: [], lastShownProductNames: [], pending: null };
}

export function normalizeSimulatorConversationState(
  value: unknown,
  context: BusinessContext
): SimulatorConversationState {
  const products = visibleProducts(context);
  const input = record(value);
  const merged = new Map<string, SimulatorCartItemState>();
  const rawCart = Array.isArray(input.cart) ? input.cart : [];
  for (const raw of rawCart.slice(0, 50)) {
    const item = record(raw);
    const product = findByName(products, String(item.productName || ""));
    const quantity = quantityFrom(item.quantity);
    if (!product || !quantity) continue;
    const key = normalizeCommerceText(product.name);
    merged.set(key, {
      productName: product.name,
      quantity: Math.min(MAX_QTY, (merged.get(key)?.quantity || 0) + quantity),
    });
  }
  const rawShown = Array.isArray(input.lastShownProductNames) ? input.lastShownProductNames : [];
  const shown = Array.from(new Set(rawShown
    .map((name) => findByName(products, String(name || ""))?.name || "")
    .filter(Boolean))).slice(0, 20);
  const rawPending = record(input.pending);
  const candidates = Array.isArray(rawPending.candidateNames)
    ? Array.from(new Set(rawPending.candidateNames
        .map((name) => findByName(products, String(name || ""))?.name || "")
        .filter(Boolean))).slice(0, MAX_OPTIONS)
    : [];
  const kind = rawPending.kind === "quantity" || rawPending.kind === "product"
    ? rawPending.kind : null;
  const pending: SimulatorPendingAction | null = kind && candidates.length
    ? {
        kind,
        query: String(rawPending.query || "").slice(0, 160),
        quantity: kind === "product" ? quantityFrom(rawPending.quantity) : null,
        candidateNames: candidates,
      }
    : null;
  return { version: 1, cart: [...merged.values()], lastShownProductNames: shown, pending };
}

function scoreProduct(product: BusinessProduct, query: string): number {
  const normalizedQuery = normalizeCommerceText(query);
  const queryTokens = tokens(query);
  if (!normalizedQuery || !queryTokens.length) return 0;
  const normalizedName = normalizeCommerceText(product.name);
  const nameTokens = new Set(tokens(product.name));
  const categoryTokens = new Set(tokens(product.category || ""));
  let score = normalizedName === normalizedQuery ? 120 : 0;
  if (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)) score += 60;
  let matched = 0;
  for (const queryToken of queryTokens) {
    if (nameTokens.has(queryToken)) { score += 18; matched += 1; }
    else if (categoryTokens.has(queryToken)) { score += 12; matched += 1; }
  }
  if (matched === queryTokens.length) score += 25;
  return score;
}
function matchesFor(products: BusinessProduct[], query: string, allowed?: string[]): ScoredProduct[] {
  const allowedSet = allowed?.length ? new Set(allowed.map(normalizeCommerceText)) : null;
  return products
    .filter((product) => !allowedSet || allowedSet.has(normalizeCommerceText(product.name)))
    .map((product) => ({ product, score: scoreProduct(product, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name, "es"));
}
function uniqueMatch(matches: ScoredProduct[]): BusinessProduct | null {
  if (!matches.length) return null;
  if (matches.length === 1) return matches[0].product;
  return matches[0].score >= 100 || matches[0].score - matches[1].score >= 18
    ? matches[0].product : null;
}
function candidateQuestion(products: BusinessProduct[], quantity: number | null): string {
  return `${quantity ? `¿Cuál producto deseas agregar (${quantity})?` : "¿Cuál producto prefieres?"}\n${products.slice(0, MAX_OPTIONS).map(optionLine).join("\n")}`;
}

function addToCart(
  state: SimulatorConversationState,
  product: BusinessProduct,
  quantity: number
): SimulatorCommerceResult {
  const cart = [...state.cart];
  const index = cart.findIndex((item) =>
    normalizeCommerceText(item.productName) === normalizeCommerceText(product.name));
  const totalQuantity = index >= 0
    ? Math.min(MAX_QTY, cart[index].quantity + quantity) : quantity;
  if (index >= 0) cart[index] = { productName: product.name, quantity: totalQuantity };
  else cart.push({ productName: product.name, quantity });
  const prefix = index >= 0
    ? `Agregué ${quantity} ${product.name}. Ahora llevas ${totalQuantity}.`
    : `Agregué ${quantity} ${product.name}.`;
  return {
    intent: "add_to_cart",
    answer: `${prefix} Subtotal: ${money(totalQuantity * product.price, product.currency)}. ¿Deseas algo más?`,
    state: { version: 1, cart, lastShownProductNames: [product.name], pending: null },
    dataSource: "cart",
    matchedProductCount: 1,
  };
}

type DerivedItem = { product: BusinessProduct; quantity: number; subtotal: number };
function deriveCart(state: SimulatorConversationState, context: BusinessContext): DerivedItem[] {
  const products = visibleProducts(context);
  return state.cart.flatMap((item) => {
    const product = findByName(products, item.productName);
    return product ? [{ product, quantity: item.quantity, subtotal: item.quantity * product.price }] : [];
  });
}
function totals(derived: DerivedItem[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of derived) result.set(item.product.currency,
    (result.get(item.product.currency) || 0) + item.subtotal);
  return result;
}
function totalsText(value: Map<string, number>): string {
  return [...value].map(([currency, amount]) => money(amount, currency)).join(" + ");
}

export function getSimulatorCartMetrics(state: SimulatorConversationState, context: BusinessContext) {
  const derived = deriveCart(state, context);
  return {
    itemCount: derived.length,
    unitCount: derived.reduce((sum, item) => sum + item.quantity, 0),
    totals: Object.fromEntries(totals(derived)),
  };
}
export function formatSimulatorCartForInstructions(
  state: SimulatorConversationState,
  context: BusinessContext
): string {
  const derived = deriveCart(state, context);
  if (!derived.length) return "Pedido temporal vacío.";
  return `${derived.map((item) =>
    `- ${item.quantity} x ${item.product.name} = ${money(item.subtotal, item.product.currency)}`
  ).join("\n")}\nTotal temporal: ${totalsText(totals(derived))}\nNo confirma compra ni pago.`;
}

function totalResult(state: SimulatorConversationState, context: BusinessContext): SimulatorCommerceResult {
  const derived = deriveCart(state, context);
  return derived.length
    ? {
        intent: "cart_total",
        answer: `Tu total temporal es ${totalsText(totals(derived))}. ¿Deseas agregar algo más?`,
        state: { ...state, pending: null }, dataSource: "cart", matchedProductCount: derived.length,
      }
    : {
        intent: "cart_total", answer: "Tu pedido temporal está vacío. ¿Qué deseas agregar?",
        state: { ...state, pending: null }, dataSource: "cart", matchedProductCount: 0,
      };
}
function summaryResult(state: SimulatorConversationState, context: BusinessContext): SimulatorCommerceResult {
  const derived = deriveCart(state, context);
  if (!derived.length) return {
    intent: "cart_summary", answer: "Tu pedido temporal está vacío. ¿Qué deseas agregar?",
    state: { ...state, pending: null }, dataSource: "cart", matchedProductCount: 0,
  };
  const lines = derived.slice(0, MAX_OPTIONS).map((item) =>
    `• ${item.quantity} x ${item.product.name} — ${money(item.subtotal, item.product.currency)}`);
  return {
    intent: "cart_summary",
    answer: `Tu pedido temporal:\n${lines.join("\n")}\nTotal: ${totalsText(totals(derived))}. ¿Deseas cambiar o agregar algo?`,
    state: { ...state, pending: null }, dataSource: "cart", matchedProductCount: derived.length,
  };
}

function productQueryResult(
  message: string,
  state: SimulatorConversationState,
  query: string,
  matches: ScoredProduct[]
): SimulatorCommerceResult {
  const selected = matches.slice(0, MAX_OPTIONS).map((entry) => entry.product);
  if (!selected.length) return {
    intent: "product_query",
    answer: `No tenemos “${query || "ese producto"}” registrado. ¿Te muestro opciones disponibles?`,
    state: { ...state, lastShownProductNames: [], pending: null },
    dataSource: "catalog", matchedProductCount: 0,
  };
  if (selected.length === 1) {
    const product = selected[0];
    return {
      intent: "product_query",
      answer: `Sí, tenemos ${product.name} a ${money(product.price, product.currency)}. ¿Cuántas deseas?`,
      state: {
        ...state,
        lastShownProductNames: [product.name],
        pending: { kind: "quantity", query: message.slice(0, 160), quantity: null, candidateNames: [product.name] },
      },
      dataSource: "catalog", matchedProductCount: 1,
    };
  }
  return {
    intent: "product_query",
    answer: `Sí, tenemos estas opciones:\n${selected.map(optionLine).join("\n")}\n¿Cuál prefieres?`,
    state: {
      ...state,
      lastShownProductNames: selected.map((product) => product.name),
      pending: { kind: "product", query: message.slice(0, 160), quantity: null, candidateNames: selected.map((product) => product.name) },
    },
    dataSource: "catalog", matchedProductCount: selected.length,
  };
}

function resolvePending(
  message: string,
  state: SimulatorConversationState,
  products: BusinessProduct[]
): SimulatorCommerceResult | null {
  if (!state.pending) return null;
  const quantity = extractQuantity(message);
  if (state.pending.kind === "quantity") {
    const product = findByName(products, state.pending.candidateNames[0]);
    if (!product) return null;
    const alternative = matchesFor(products, extractQuery(message));
    const alternativeProduct = uniqueMatch(alternative);
    if (alternativeProduct && normalizeCommerceText(alternativeProduct.name) !== normalizeCommerceText(product.name))
      return null;
    if (quantity) return addToCart(state, product, quantity);
    if (alternative.length) return null;
    return normalizeCommerceText(message).split(" ").length <= 5
      ? {
          intent: "clarification", answer: `¿Cuántas ${product.name} deseas?`, state,
          dataSource: "cart", matchedProductCount: 1,
        }
      : null;
  }
  const pendingQuery = extractQuery(message);
  const matches = matchesFor(products, pendingQuery, state.pending.candidateNames);
  if (!matches.length && matchesFor(products, pendingQuery).length) return null;
  const selected = uniqueMatch(matches);
  if (selected) {
    const finalQuantity = quantity || state.pending.quantity;
    return finalQuantity ? addToCart(state, selected, finalQuantity) : {
      intent: "clarification", answer: `¿Cuántas ${selected.name} deseas?`,
      state: {
        ...state,
        lastShownProductNames: [selected.name],
        pending: { kind: "quantity", query: message.slice(0, 160), quantity: null, candidateNames: [selected.name] },
      },
      dataSource: "cart", matchedProductCount: 1,
    };
  }
  if (normalizeCommerceText(message).split(" ").length > 6) return null;
  const candidates = state.pending.candidateNames
    .map((name) => findByName(products, name))
    .filter((product): product is BusinessProduct => Boolean(product));
  return {
    intent: "clarification", answer: candidateQuestion(candidates, quantity || state.pending.quantity),
    state: { ...state, pending: { ...state.pending, quantity: quantity || state.pending.quantity } },
    dataSource: "cart", matchedProductCount: candidates.length,
  };
}

function addResult(
  message: string,
  state: SimulatorConversationState,
  context: BusinessContext,
  query: string,
  quantity: number | null,
  matches: ScoredProduct[]
): SimulatorCommerceResult {
  const products = visibleProducts(context);
  let selected = uniqueMatch(matches);
  if (!selected && !query && state.lastShownProductNames.length === 1)
    selected = findByName(products, state.lastShownProductNames[0]);
  if (!selected && !query && state.lastShownProductNames.length > 1) {
    const candidates = state.lastShownProductNames.map((name) => findByName(products, name))
      .filter((product): product is BusinessProduct => Boolean(product)).slice(0, MAX_OPTIONS);
    return {
      intent: "clarification", answer: candidateQuestion(candidates, quantity),
      state: { ...state, pending: { kind: "product", query: message.slice(0, 160), quantity, candidateNames: candidates.map((p) => p.name) } },
      dataSource: "cart", matchedProductCount: candidates.length,
    };
  }
  if (!selected && !matches.length) return {
    intent: "add_to_cart",
    answer: query ? `No encuentro “${query}” en nuestro catálogo. ¿Te muestro opciones?` : "¿Qué producto deseas agregar?",
    state: { ...state, pending: null }, dataSource: "cart", matchedProductCount: 0,
  };
  if (!selected) {
    const candidates = matches.slice(0, MAX_OPTIONS).map((entry) => entry.product);
    return {
      intent: "clarification", answer: candidateQuestion(candidates, quantity),
      state: {
        ...state, lastShownProductNames: candidates.map((p) => p.name),
        pending: { kind: "product", query: message.slice(0, 160), quantity, candidateNames: candidates.map((p) => p.name) },
      },
      dataSource: "cart", matchedProductCount: candidates.length,
    };
  }
  if (!quantity) return {
    intent: "clarification", answer: `¿Cuántas ${selected.name} deseas?`,
    state: {
      ...state, lastShownProductNames: [selected.name],
      pending: { kind: "quantity", query: message.slice(0, 160), quantity: null, candidateNames: [selected.name] },
    },
    dataSource: "cart", matchedProductCount: 1,
  };
  return addToCart(state, selected, quantity);
}

export function isPotentialCommerceMessage(message: string, stateValue: unknown): boolean {
  const text = normalizeCommerceText(message);
  return Boolean(record(stateValue).pending) || contains(text, CLEAR_TERMS) || contains(text, TOTAL_TERMS) ||
    contains(text, SUMMARY_TERMS) || contains(text, ADD_TERMS) || contains(text, QUESTION_TERMS) ||
    extractQuantity(message) !== null;
}

export function processSimulatorCommerceMessage(input: {
  message: string;
  context: BusinessContext;
  state: SimulatorConversationState;
}): SimulatorCommerceResult | null {
  const text = normalizeCommerceText(input.message);
  const products = visibleProducts(input.context);
  const state = normalizeSimulatorConversationState(input.state, input.context);
  if (contains(text, CLEAR_TERMS)) return {
    intent: "cart_clear", answer: "Listo, vacié el pedido temporal. ¿Qué deseas pedir ahora?",
    state: emptySimulatorConversationState(), dataSource: "cart", matchedProductCount: 0,
  };
  if (contains(text, TOTAL_TERMS)) return totalResult(state, input.context);
  if (contains(text, SUMMARY_TERMS)) return summaryResult(state, input.context);
  const pending = resolvePending(input.message, state, products);
  if (pending) return pending;
  const quantity = extractQuantity(input.message);
  const query = extractQuery(input.message);
  const matches = matchesFor(products, query);
  if (contains(text, ADD_TERMS) || Boolean(quantity && matches.length))
    return addResult(input.message, state, input.context, query, quantity, matches);
  if (contains(text, QUESTION_TERMS) || matches.length)
    return productQueryResult(input.message, state, query, matches);
  return null;
}
