import "server-only";

import {
  normalizePaymentProvider,
  sanitizeBusinessRule,
} from "./business-context-contract";
import { createServiceRoleClient } from "./supabase";
import {
  createOfferingKey,
  type UniversalBusinessContext,
  type UniversalFaq,
  type UniversalOffering,
} from "./universal-agent-contract";
import type { FlowNode } from "./workflow-types";

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

function uniqueStrings(values: string[], maxItems = 100): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = compactText(value, 1000);
    const key = clean.toLocaleLowerCase("es");
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= maxItems) break;
  }
  return result;
}

function stringsFrom(value: unknown, maxItems = 100): string[] {
  if (typeof value === "string") {
    return uniqueStrings(
      value
        .split(/\r?\n|\|/)
        .map((item) => compactText(item, 1000))
        .filter(Boolean),
      maxItems
    );
  }
  if (!Array.isArray(value)) return [];
  return uniqueStrings(
    value
      .map((item) => {
        if (typeof item === "string") return item;
        const record = safeRecord(item);
        return (
          compactText(record.text, 1000) ||
          compactText(record.value, 1000) ||
          compactText(record.name, 1000) ||
          compactText(record.rule, 1000)
        );
      })
      .filter(Boolean),
    maxItems
  );
}

function hoursFrom(value: unknown): string[] {
  if (typeof value === "string") return stringsFrom(value, 50);
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const raw of value.slice(0, 100)) {
    if (typeof raw === "string") {
      result.push(raw);
      continue;
    }
    const item = safeRecord(raw);
    const day = compactText(item.day, 80);
    const open = compactText(item.open, 40);
    const close = compactText(item.close, 40);
    const text = compactText(item.text, 200);
    if (text) result.push(text);
    else if (day && (open || close)) {
      result.push(`${day}: ${open || "sin hora registrada"}${close ? ` - ${close}` : ""}`);
    }
  }
  return uniqueStrings(result, 50);
}

function faqsFrom(value: unknown): UniversalFaq[] {
  if (!Array.isArray(value)) return [];
  const result: UniversalFaq[] = [];
  const seen = new Set<string>();
  for (const raw of value.slice(0, 100)) {
    const item = safeRecord(raw);
    const question = compactText(item.question, 400);
    const answer = compactText(item.answer, 800);
    const key = question.toLocaleLowerCase("es");
    if (!question || !answer || seen.has(key)) continue;
    seen.add(key);
    result.push({ question, answer });
  }
  return result;
}

function finitePrice(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function nodeContext(nodes: FlowNode[], businessName: string) {
  const tones: string[] = [];
  const hours: string[] = [];
  const summaries: string[] = [];
  const rules: string[] = [];

  for (const node of nodes) {
    if (node.type !== "ai_agent") continue;
    const data = safeRecord(node.data);
    const tone =
      compactText(data.agentTone, 120) || compactText(data.tone, 120);
    const businessHours =
      compactText(data.businessHours, 300) || compactText(data.hours, 300);
    const summary = uniqueStrings(
      [
        compactText(data.productOrService, 400),
        compactText(data.knowledgeSummary, 1000),
      ].filter(Boolean),
      5
    );
    const systemPrompt = compactText(data.systemPrompt, 4000);

    if (tone) tones.push(tone);
    if (businessHours) hours.push(businessHours);
    summaries.push(...summary);
    if (systemPrompt) {
      rules.push(sanitizeBusinessRule(systemPrompt, businessName));
      const legacyTone = systemPrompt.match(/mant[eé]n un tono\s+([^.,;]+)/i)?.[1];
      const legacyHours = systemPrompt.match(/horario informado:\s*([^.;]+)/i)?.[1];
      if (legacyTone) tones.push(legacyTone);
      if (legacyHours) hours.push(legacyHours);
    }
  }

  return {
    tone: uniqueStrings(tones, 5)[0] || "",
    hours: uniqueStrings(hours, 30),
    summaries: uniqueStrings(summaries, 20),
    rules: uniqueStrings(rules, 30),
  };
}

function servicesFrom(value: unknown): Array<{
  name: string;
  description: string;
  price: number | null;
  currency: string;
  category: string;
}> {
  if (!Array.isArray(value)) return [];
  const result: Array<{
    name: string;
    description: string;
    price: number | null;
    currency: string;
    category: string;
  }> = [];
  for (const raw of value.slice(0, 300)) {
    const item = safeRecord(raw);
    const name = compactText(item.name, 180);
    if (!name) continue;
    const duration = Number(item.durationMinutes);
    const durationText = Number.isFinite(duration) && duration > 0
      ? `Duración aproximada: ${Math.trunc(duration)} minutos.`
      : "";
    result.push({
      name,
      description: uniqueStrings(
        [compactText(item.description, 700), durationText].filter(Boolean),
        3
      ).join(" "),
      price: finitePrice(item.price),
      currency: compactText(item.currency, 6).toUpperCase() || "USD",
      category: compactText(item.category, 120),
    });
  }
  return result;
}

function paymentSummary(provider: UniversalBusinessContext["payment"]["provider"]): string {
  if (provider === "payphone") return "Pago en línea configurado.";
  if (provider === "external") return "Método de pago externo configurado.";
  if (provider === "none") return "No hay una forma de pago registrada.";
  return "La forma de pago no está confirmada en la configuración.";
}

function makeUniqueOfferings(
  products: UniversalOffering[],
  services: UniversalOffering[]
): UniversalOffering[] {
  const usedKeys = new Set<string>();
  const usedNames = new Set<string>();
  const result: UniversalOffering[] = [];

  for (const offering of [...products, ...services]) {
    const normalizedName = offering.name.toLocaleLowerCase("es").trim();
    if (!normalizedName || usedNames.has(normalizedName)) continue;
    usedNames.add(normalizedName);
    let key = offering.key;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = createOfferingKey(offering.kind, offering.name, String(suffix));
      suffix += 1;
    }
    usedKeys.add(key);
    result.push({ ...offering, key });
  }

  return result.slice(0, 300);
}

export async function loadUniversalBusinessContext(input: {
  clientId: string;
  nodes: FlowNode[];
}): Promise<UniversalBusinessContext> {
  const supabase = createServiceRoleClient();
  const [
    businessResult,
    productsResult,
    catalogResult,
    onboardingResult,
    promotionsResult,
  ] = await Promise.all([
    supabase
      .from("client_accounts")
      .select("business_name,business_type,payment_provider")
      .eq("id", input.clientId)
      .maybeSingle(),
    supabase
      .from("catalog_products")
      .select("name,description,price,currency,stock,track_inventory,metadata")
      .eq("client_id", input.clientId)
      .eq("active", true)
      .order("name", { ascending: true })
      .limit(300),
    supabase
      .from("catalogs")
      .select("description")
      .eq("client_id", input.clientId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("audit_logs")
      .select("metadata")
      .eq("action", "onboarding_completed")
      .eq("entity_type", "client_account")
      .eq("entity_id", input.clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("audit_logs")
      .select("metadata")
      .eq("action", "catalog_promotions_updated")
      .contains("metadata", { client_id: input.clientId })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (businessResult.error) {
    throw new Error(
      `No se pudo cargar la identidad del negocio: ${businessResult.error.message}`
    );
  }
  const businessName = compactText(businessResult.data?.business_name, 200);
  if (!businessName) {
    throw new Error("No se encontró el negocio asociado a esta conversación.");
  }

  const warnings: string[] = [];
  if (productsResult.error) warnings.push("Catálogo no disponible temporalmente.");
  if (catalogResult.error) warnings.push("Resumen del catálogo no disponible.");
  if (onboardingResult.error) warnings.push("Configuración inicial no disponible.");
  if (promotionsResult.error) warnings.push("Promociones no disponibles temporalmente.");

  const onboarding = safeRecord(onboardingResult.data?.metadata);
  const updatedPromotions = safeRecord(promotionsResult.data?.metadata);
  const nodes = nodeContext(input.nodes, businessName);

  const productOfferings: UniversalOffering[] = (productsResult.data || [])
    .map((row) => {
      const metadata = safeRecord(row.metadata);
      const name = compactText(row.name, 180);
      const price = finitePrice(row.price);
      const stock = Number(row.stock || 0);
      const trackInventory = row.track_inventory !== false;
      return {
        key: createOfferingKey("product", name),
        kind: "product" as const,
        name,
        description: compactText(row.description, 800),
        price,
        currency: compactText(row.currency, 6).toUpperCase() || "USD",
        category: compactText(metadata.category, 120),
        available:
          Boolean(name) &&
          price !== null &&
          (!trackInventory || (Number.isFinite(stock) && stock > 0)),
      };
    })
    .filter((offering) => offering.name && offering.available);

  const serviceOfferings: UniversalOffering[] = servicesFrom(
    onboarding.services
  ).map((service) => ({
    key: createOfferingKey("service", service.name),
    kind: "service" as const,
    name: service.name,
    description: service.description,
    price: service.price,
    currency: service.currency,
    category: service.category,
    available: true,
  }));

  const paymentProvider = normalizePaymentProvider(
    businessResult.data?.payment_provider
  );
  const promotions = uniqueStrings(
    [
      ...stringsFrom(updatedPromotions.promotions, 50),
      ...stringsFrom(onboarding.promotions, 50),
    ],
    50
  );
  const hours = uniqueStrings(
    [
      ...hoursFrom(onboarding.business_hours),
      ...hoursFrom(onboarding.detected_business_hours),
      ...nodes.hours,
    ],
    50
  );
  const tone =
    compactText(onboarding.agent_tone, 120) ||
    nodes.tone ||
    "amable, claro y comercial";
  const summary = uniqueStrings(
    [
      compactText(catalogResult.data?.description, 1000),
      compactText(onboarding.knowledge_summary, 1000),
      compactText(onboarding.product_or_service, 500),
      ...nodes.summaries,
    ].filter(Boolean),
    20
  ).join(" ");

  return {
    clientId: input.clientId,
    businessName,
    businessType: compactText(businessResult.data?.business_type, 120),
    tone,
    hours,
    offerings: makeUniqueOfferings(productOfferings, serviceOfferings),
    promotions,
    payment: {
      provider: paymentProvider,
      summary: paymentSummary(paymentProvider),
      conditions: uniqueStrings(
        stringsFrom(onboarding.payment_conditions, 50),
        50
      ),
    },
    faqs: faqsFrom(onboarding.faqs),
    policies: uniqueStrings(stringsFrom(onboarding.policies, 80), 80),
    address: compactText(onboarding.address, 500),
    humanHandoffRules: uniqueStrings(
      stringsFrom(onboarding.human_handoff_rules, 50),
      50
    ),
    appointmentConditions: uniqueStrings(
      stringsFrom(onboarding.appointment_conditions, 50),
      50
    ),
    rules: uniqueStrings(
      [
        ...nodes.rules,
        ...stringsFrom(onboarding.agent_rules, 50),
      ],
      50
    ),
    summary,
    warnings,
  };
}
