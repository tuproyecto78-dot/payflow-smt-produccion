import "server-only";

import { db } from "./db";
import {
  createOfferingKey,
  type UniversalFaq,
  type UniversalKnowledgeEntry,
  type UniversalOffering,
} from "./universal-agent-contract";

export type UniversalKnowledgeCenterSnapshot = {
  offerings: UniversalOffering[];
  faqs: UniversalFaq[];
  documents: UniversalKnowledgeEntry[];
  hours: string[];
  policies: string[];
  warnings: string[];
};

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return safeRecord(value);
  try {
    return safeRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

function compact(value: unknown, maxLength: number): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function stringsFrom(value: unknown, maxItems = 50): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const clean = compact(raw, 1000);
    const key = clean.toLocaleLowerCase("es");
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= maxItems) break;
  }
  return result;
}

function extractedProducts(value: unknown): UniversalOffering[] {
  const record = parseRecord(value);
  if (!Array.isArray(record.products)) return [];
  return record.products
    .slice(0, 100)
    .map((raw) => {
      const product = safeRecord(raw);
      const name = compact(product.name, 180);
      const price = Number(product.price);
      return {
        key: createOfferingKey("product", name, "knowledge"),
        kind: "product" as const,
        name,
        description: compact(product.description, 800),
        price: Number.isFinite(price) && price > 0 ? price : null,
        currency: compact(product.currency, 6).toUpperCase() || "USD",
        category: compact(product.category, 120) || "general",
        available: Boolean(name) && Number.isFinite(price) && price > 0,
        source: "knowledge_center" as const,
      };
    })
    .filter((offering) => offering.available);
}

/**
 * Loads only the active knowledge base belonging to the current client.
 * There is intentionally no demo fallback: tenant data can never bleed into
 * another business when its center is empty or unavailable.
 */
export async function loadUniversalKnowledgeCenter(
  clientId: string
): Promise<UniversalKnowledgeCenterSnapshot> {
  try {
    const base = await db.knowledgeBase.findUnique({
      where: { businessId: clientId },
      include: {
        products: {
          where: { active: true },
          orderBy: [{ category: "asc" }, { name: "asc" }],
          take: 300,
        },
        faqs: {
          where: { active: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          take: 100,
        },
        documents: {
          where: { active: true },
          orderBy: { updatedAt: "desc" },
          take: 50,
        },
      },
    });

    if (!base) {
      return {
        offerings: [],
        faqs: [],
        documents: [],
        hours: [],
        policies: [],
        warnings: [],
      };
    }

    const offerings: UniversalOffering[] = base.products
      .map((product) => ({
        key: createOfferingKey("product", product.name, "knowledge"),
        kind: "product" as const,
        name: compact(product.name, 180),
        description: compact(product.description, 800),
        price:
          Number.isFinite(product.price) && product.price > 0
            ? product.price
            : null,
        currency: compact(product.currency, 6).toUpperCase() || "USD",
        category: compact(product.category, 120),
        available:
          Boolean(compact(product.name, 180)) &&
          Number.isFinite(product.price) &&
          product.price > 0,
        source: "knowledge_center" as const,
      }))
      .filter((offering) => offering.available);

    const faqs: UniversalFaq[] = base.faqs
      .map((faq) => ({
        question: compact(faq.question, 400),
        answer: compact(faq.answer, 1000),
      }))
      .filter((faq) => faq.question && faq.answer);

    const documents: UniversalKnowledgeEntry[] = [];
    const hours: string[] = [];
    const policies: string[] = [];
    for (const document of base.documents) {
      const structured = parseRecord(document.structuredData);
      hours.push(...stringsFrom(structured.hours, 20));
      policies.push(...stringsFrom(structured.policies, 40));
      offerings.push(...extractedProducts(structured));

      const content = compact(document.content, 4000);
      if (content) {
        documents.push({
          key: `knowledge-document:${document.id}`,
          title: compact(document.name, 240) || "Información del negocio",
          content,
          category: compact(document.type, 80) || "document",
        });
      }
    }

    return {
      offerings,
      faqs,
      documents,
      hours: stringsFrom(hours, 50),
      policies: stringsFrom(policies, 80),
      warnings: [],
    };
  } catch (error) {
    console.error("[universal-context] knowledge center unavailable", error);
    return {
      offerings: [],
      faqs: [],
      documents: [],
      hours: [],
      policies: [],
      warnings: ["Centro de conocimiento no disponible temporalmente."],
    };
  }
}
