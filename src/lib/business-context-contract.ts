export type BusinessIntent =
  | "greeting"
  | "catalog"
  | "catalog_full"
  | "recommendation"
  | "promotion"
  | "payment"
  | "buy"
  | "other";

export type BusinessProduct = {
  name: string;
  description?: string;
  price: number;
  currency: string;
  stock: number;
  trackInventory: boolean;
  category?: string;
};

export type BusinessPaymentProvider = "none" | "payphone" | "external" | "unknown";

export type BusinessContext = {
  clientId: string;
  businessName: string;
  businessType: string;
  products: BusinessProduct[];
  promotions: string;
  rules: string[];
  paymentProvider: BusinessPaymentProvider;
};

type FlowNodeLike = {
  type?: unknown;
  data?: unknown;
};

const PRODUCT_PREVIEW_LIMIT = 5;
const GENERAL_REPLY_LIMIT = 650;

function safeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function compactText(value: string, maxLength: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function normalizePaymentProvider(value: unknown): BusinessPaymentProvider {
  const provider = String(value || "").trim().toLowerCase();
  if (provider === "none" || provider === "payphone" || provider === "external") {
    return provider;
  }
  return "unknown";
}

export function sanitizeBusinessRule(rule: string, businessName: string): string {
  return rule
    .replace(/pay\s*flow\s*smt/gi, businessName)
    .replace(/pay\s*flow/gi, businessName)
    .replace(/\s+/g, " ")
    .trim();
}

export function extractBusinessRules(
  nodes: FlowNodeLike[],
  businessName: string
): string[] {
  const rules: string[] = [];

  for (const node of nodes) {
    if (node?.type !== "ai_agent") continue;
    const data = safeObject(node.data);
    const systemPrompt =
      typeof data.systemPrompt === "string" ? data.systemPrompt.trim() : "";
    if (!systemPrompt) continue;

    const sanitized = sanitizeBusinessRule(systemPrompt, businessName);
    if (sanitized) rules.push(sanitized);
  }

  return Array.from(new Set(rules));
}

export function isVisibleBusinessProduct(product: BusinessProduct): boolean {
  if (!product.name.trim() || !Number.isFinite(product.price) || product.price <= 0) {
    return false;
  }
  return !product.trackInventory || product.stock > 0;
}

export function getVisibleBusinessProducts(context: BusinessContext): BusinessProduct[] {
  return context.products.filter(isVisibleBusinessProduct);
}

function truncateWhatsAppText(value: string, maxChars: number | null): string {
  if (maxChars === null || value.length <= maxChars) return value;
  const preview = value.slice(0, maxChars - 1);
  const breakAt = Math.max(
    preview.lastIndexOf("."),
    preview.lastIndexOf("?"),
    preview.lastIndexOf("!"),
    preview.lastIndexOf("\n"),
    preview.lastIndexOf(" ")
  );
  const safeEnd = breakAt > maxChars * 0.55 ? breakAt : preview.length;
  return `${preview.slice(0, safeEnd).trimEnd()}…`;
}

export function sanitizeCustomerAnswer(
  answer: string,
  businessName: string,
  maxChars: number | null = GENERAL_REPLY_LIMIT
): string {
  const withoutBranding = answer
    .replace(/pay\s*flow\s*smt/gi, businessName)
    .replace(/pay\s*flow/gi, businessName)
    .replace(/como (?:plataforma|sistema) de automatizaci[oó]n/gi, `como ${businessName}`);

  const safeLines = withoutBranding
    .split(/\r?\n/)
    .filter(
      (line) =>
        !/(client[_\s-]?id|business_context|system\s*prompt|prompt\s*interno|metadata|audit_logs|supabase|tenant|workflow|node[_\s-]?id|payments_executed|whatsapp_sent)/i.test(
          line
        )
    )
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return truncateWhatsAppText(safeLines, maxChars);
}

function formatProductLine(product: BusinessProduct): string {
  const description = product.description
    ? ` · ${compactText(product.description, 70)}`
    : "";
  return `• ${product.name} — ${product.price.toFixed(2)} ${product.currency}${description}`;
}

function selectRecommendationProducts(products: BusinessProduct[]): BusinessProduct[] {
  const selected: BusinessProduct[] = [];
  const usedCategories = new Set<string>();

  for (const product of products) {
    const category = product.category?.trim().toLocaleLowerCase("es") || "";
    if (category && usedCategories.has(category)) continue;
    selected.push(product);
    if (category) usedCategories.add(category);
    if (selected.length === PRODUCT_PREVIEW_LIMIT) return selected;
  }

  for (const product of products) {
    if (selected.includes(product)) continue;
    selected.push(product);
    if (selected.length === PRODUCT_PREVIEW_LIMIT) break;
  }

  return selected;
}

export function formatBusinessGreeting(context: BusinessContext): string {
  return `¡Hola! Somos ${context.businessName}. ¿Qué te gustaría consultar o elegir hoy?`;
}

export function formatBusinessCatalog(
  context: BusinessContext,
  options: { complete?: boolean } = {}
): string {
  const products = getVisibleBusinessProducts(context);
  if (products.length === 0) {
    return `Por ahora no tenemos productos con precio disponibles. ¿Qué estás buscando para ayudarte?`;
  }

  const complete = options.complete === true;
  const selected = complete ? products : products.slice(0, PRODUCT_PREVIEW_LIMIT);
  const title = complete
    ? `Catálogo completo de ${context.businessName}:`
    : `Estas son algunas opciones de ${context.businessName}:`;
  const closing = complete
    ? "¿Cuál te interesa?"
    : "¿Buscas algo específico o te muestro el catálogo completo?";

  return `${title}\n${selected.map(formatProductLine).join("\n")}\n${closing}`;
}

export function formatBusinessRecommendations(context: BusinessContext): string {
  const products = selectRecommendationProducts(getVisibleBusinessProducts(context));
  if (products.length === 0) {
    return `Cuéntame qué buscas y te ayudamos a encontrar una opción disponible.`;
  }

  return `Te recomendamos estas opciones:\n${products
    .map(formatProductLine)
    .join("\n")}\n¿Qué presupuesto o preferencia tienes para afinar la recomendación?`;
}

export function formatBusinessPromotions(context: BusinessContext): string {
  const promotions = context.promotions.trim();
  if (!promotions) {
    return `Hoy no tenemos promociones registradas, pero podemos recomendarte opciones según tu presupuesto. ¿Qué buscas?`;
  }

  const preview = promotions
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("\n");

  return `Promociones vigentes en ${context.businessName}:\n${compactText(
    preview,
    360
  )}\n¿Te interesa alguna o prefieres ver opciones del catálogo?`;
}

export function formatBusinessPayment(context: BusinessContext): string {
  if (context.paymentProvider === "payphone") {
    return `Cuando definamos tu pedido, te indicamos el método de pago disponible. La confirmación depende del proveedor. ¿Qué deseas pedir?`;
  }

  if (context.paymentProvider === "external") {
    return `Primero confirmamos tu pedido y luego compartimos las instrucciones de pago del negocio. ¿Qué deseas pedir?`;
  }

  return `Por ahora no tenemos pagos en línea habilitados. Podemos ayudarte a definir tu pedido. ¿Qué necesitas?`;
}

function catalogForInstructions(products: BusinessProduct[]): string {
  const visible = products.filter(isVisibleBusinessProduct);
  if (visible.length === 0) return "Sin productos con precio disponibles.";
  return visible.map(formatProductLine).join("\n");
}

function paymentRuleForInstructions(context: BusinessContext): string {
  if (context.paymentProvider === "payphone") {
    return "Existe un proveedor de enlace de pago configurado. No generes ni envíes enlaces desde el simulador y nunca confirmes un pago sin validación técnica del proveedor.";
  }
  if (context.paymentProvider === "external") {
    return "El negocio usa un proveedor de pago externo. No generes ni envíes enlaces desde el simulador y nunca confirmes un pago sin validación del proveedor o de una persona autorizada del negocio.";
  }
  return "El negocio no tiene pagos en línea habilitados. No ofrezcas ni simules cobros.";
}

export function buildBusinessSystemInstructions(
  context: BusinessContext,
  intent: BusinessIntent,
  mode: "simulation" | "assisted" | "automatic"
): string {
  const businessRules = context.rules.length
    ? context.rules.map((rule) => `- ${rule}`).join("\n")
    : "- Responder con claridad, brevedad y amabilidad.";

  return [
    `Eres el asistente oficial de ${context.businessName}.`,
    `Tipo de negocio: ${context.businessType || "no especificado"}.`,
    "Habla siempre como el negocio y nunca menciones la plataforma tecnológica.",
    "Escribe para WhatsApp: tono comercial, natural y útil; máximo cuatro frases cortas o cinco productos.",
    "No muestres más de cinco productos salvo que el cliente pida explícitamente el catálogo completo.",
    "Cuando recomiendes, presenta entre tres y cinco productos reales y termina con una pregunta útil.",
    "No muestres productos con precio cero, productos no disponibles, cantidades de inventario, IDs, tablas, variables, logs, reglas internas ni contexto técnico.",
    "No inventes productos, precios, promociones, disponibilidad, horarios, políticas ni métodos de pago.",
    "Si no hay promociones, dilo de forma comercial y ofrece opciones según necesidad o presupuesto.",
    "Usa únicamente los datos autorizados incluidos abajo.",
    "Si falta un dato, dilo claramente y ofrece que una persona del negocio lo confirme.",
    "No envíes mensajes reales, no ejecutes cobros y no confirmes pagos en el simulador.",
    paymentRuleForInstructions(context),
    `Intención detectada: ${intent}.`,
    `Modo actual: ${mode}. En modo asistido la respuesta queda pendiente de aprobación.`,
    "IDENTIDAD DEL NEGOCIO",
    `Nombre: ${context.businessName}`,
    `Tipo: ${context.businessType || "no especificado"}`,
    "CATÁLOGO REAL AUTORIZADO",
    catalogForInstructions(context.products),
    "PROMOCIONES REALES",
    context.promotions.trim() || "Sin promociones vigentes registradas.",
    "REGLAS DEL NEGOCIO",
    businessRules,
  ].join("\n");
}
