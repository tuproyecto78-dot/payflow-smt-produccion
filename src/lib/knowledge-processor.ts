/**
 * PayFlow SMT — Knowledge Source Processor
 *
 * Takes raw knowledge sources (PDF text, Excel rows, CSV rows, TXT, manual
 * text) and classifies them into structured categories that feed the AI
 * system prompt, catalog, agenda, and FAQ.
 *
 * The classification is rule-based (no external API calls) so it works in
 * the Z.ai preview without network access.
 */

// ─── Types ───────────────────────────────────────────────────────────

export type KnowledgeSourceType =
  | "pdf"
  | "excel"
  | "csv"
  | "txt"
  | "image"
  | "manual"
  | "faq";

export interface KnowledgeSource {
  source_id: string;
  type: KnowledgeSourceType;
  name: string;
  /** Raw text content extracted from the file, or the manual text. */
  rawText?: string;
  /** Parsed rows for Excel/CSV (array of objects with header keys). */
  rows?: Record<string, string>[];
  /** Column headers for Excel/CSV. */
  headers?: string[];
}

export interface DetectedProduct {
  name: string;
  price?: number;
  currency?: string;
  stock?: number;
  sku?: string;
  category?: string;
  description?: string;
}

export interface DetectedService {
  name: string;
  durationMinutes?: number;
  price?: number;
  currency?: string;
  category?: string;
}

export interface DetectedFaq {
  question: string;
  answer: string;
}

export interface DetectedBusinessHour {
  day: string;
  open: string;
  close: string;
}

export interface DetectedKnowledge {
  products: DetectedProduct[];
  services: DetectedService[];
  faqs: DetectedFaq[];
  business_hours: DetectedBusinessHour[];
  policies: string[];
  promotions: string[];
  notes: string[];
  prices: Array<{ item: string; price: number; currency?: string }>;
  stock_items: Array<{ name: string; stock: number }>;
  address: string;
  human_handoff_rules: string[];
  payment_conditions: string[];
  appointment_conditions: string[];
  /** Items that couldn't be classified — shown as "datos ambiguos". */
  unknown: string[];
}

export interface ProcessResult {
  source_id: string;
  source_type: KnowledgeSourceType;
  detected: DetectedKnowledge;
  stats: {
    total_lines: number;
    classified: number;
    ambiguous: number;
  };
}

// ─── Main entry point ────────────────────────────────────────────────

export function processKnowledgeSource(source: KnowledgeSource): ProcessResult {
  const detected: DetectedKnowledge = {
    products: [],
    services: [],
    faqs: [],
    business_hours: [],
    policies: [],
    promotions: [],
    notes: [],
    prices: [],
    stock_items: [],
    address: "",
    human_handoff_rules: [],
    payment_conditions: [],
    appointment_conditions: [],
    unknown: [],
  };

  // ─── Excel/CSV: try to detect structured products/services ────────
  if (
    (source.type === "excel" || source.type === "csv") &&
    source.rows &&
    source.rows.length > 0
  ) {
    classifyRows(source.rows, source.headers || [], detected);
  }

  // ─── Text-based: classify line by line ────────────────────────────
  const text = source.rawText || "";
  if (text.trim()) {
    classifyText(text, detected);
  }

  // ─── FAQ type: parse Q/A pairs ────────────────────────────────────
  if (source.type === "faq" || source.type === "manual") {
    parseFaqPairs(text, detected);
  }

  // Stats
  const lines = text.split("\n").filter((l) => l.trim());
  const classifiedCount =
    detected.products.length +
    detected.services.length +
    detected.faqs.length +
    detected.business_hours.length +
    detected.policies.length +
    detected.promotions.length +
    detected.notes.length +
    detected.prices.length +
    detected.stock_items.length +
    (detected.address ? 1 : 0) +
    detected.human_handoff_rules.length +
    detected.payment_conditions.length +
    detected.appointment_conditions.length;

  return {
    source_id: source.source_id,
    source_type: source.type,
    detected,
    stats: {
      total_lines: lines.length,
      classified: classifiedCount,
      ambiguous: detected.unknown.length,
    },
  };
}

// ─── Row classifier (Excel/CSV) ──────────────────────────────────────

function classifyRows(
  rows: Record<string, string>[],
  headers: string[],
  detected: DetectedKnowledge
) {
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  // Detect if this looks like a product catalog
  const hasProductName = lowerHeaders.some((h) =>
    /product|nombre|artículo|articulo|item/.test(h)
  );
  const hasPrice = lowerHeaders.some((h) => /precio|price|monto|costo/.test(h));
  const hasStock = lowerHeaders.some((h) => /stock|cantidad|inventario/.test(h));
  const hasServiceName = lowerHeaders.some((h) =>
    /servicio|service|cita|appointment/.test(h)
  );

  if (hasProductName || hasPrice || hasStock) {
    // Treat as product catalog
    rows.forEach((row) => {
      const product = extractProductFromRow(row, lowerHeaders, headers);
      if (product.name) {
        detected.products.push(product);
        if (product.price !== undefined) {
          detected.prices.push({
            item: product.name,
            price: product.price,
            currency: product.currency,
          });
        }
        if (product.stock !== undefined) {
          detected.stock_items.push({
            name: product.name,
            stock: product.stock,
          });
        }
      }
    });
    return;
  }

  if (hasServiceName) {
    rows.forEach((row) => {
      const service = extractServiceFromRow(row, lowerHeaders, headers);
      if (service.name) detected.services.push(service);
    });
    return;
  }

  // Otherwise treat rows as text lines and classify generically
  rows.forEach((row) => {
    const line = headers.map((h) => `${h}: ${row[h] || ""}`).join(" | ");
    classifyLine(line, detected);
  });
}

function extractProductFromRow(
  row: Record<string, string>,
  lowerHeaders: string[],
  headers: string[]
): DetectedProduct {
  const product: DetectedProduct = { name: "" }

  for (let i = 0; i < headers.length; i++) {
    const val = row[headers[i]] || "";
    const lh = lowerHeaders[i];
    if (/product|nombre|artículo|articulo|item/.test(lh)) {
      product.name = val.trim();
    } else if (/precio|price|monto|costo/.test(lh)) {
      product.price = parseFloat(val.replace(/[^0-9.,]/g, "").replace(",", ".")) || undefined;
    } else if (/stock|cantidad|inventario/.test(lh)) {
      product.stock = parseInt(val.replace(/[^0-9]/g, ""), 10) || undefined;
    } else if (/sku|código|codigo|code/.test(lh)) {
      product.sku = val.trim();
    } else if (/categor|categoría|category|tipo/.test(lh)) {
      product.category = val.trim();
    } else if (/descrip|detalle/.test(lh)) {
      product.description = val.trim();
    } else if (/moneda|currency/.test(lh)) {
      product.currency = val.trim();
    }
  }
  return product;
}

function extractServiceFromRow(
  row: Record<string, string>,
  lowerHeaders: string[],
  headers: string[]
): DetectedService {
  const service: DetectedService = { name: "" }
  for (let i = 0; i < headers.length; i++) {
    const val = row[headers[i]] || "";
    const lh = lowerHeaders[i];
    if (/servicio|service|nombre/.test(lh)) {
      service.name = val.trim();
    } else if (/duracion|duración|duration|minutos/.test(lh)) {
      service.durationMinutes = parseInt(val.replace(/[^0-9]/g, ""), 10) || undefined;
    } else if (/precio|price|costo/.test(lh)) {
      service.price = parseFloat(val.replace(/[^0-9.,]/g, "").replace(",", ".")) || undefined;
    } else if (/categor|tipo/.test(lh)) {
      service.category = val.trim();
    }
  }
  return service;
}

// ─── Text classifier ─────────────────────────────────────────────────

function classifyText(text: string, detected: DetectedKnowledge) {
  const lines = text.split("\n");
  for (const line of lines) {
    classifyLine(line, detected);
  }
}

function classifyLine(line: string, detected: DetectedKnowledge) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 2) return;

  const lower = trimmed.toLowerCase();

  // ─── Address ──────────────────────────────────────────────────────
  if (
    /direcci[óo]n|address|ubicaci[óo]n|av\.?|calle|avenida|sector/.test(lower) &&
    detected.address === ""
  ) {
    const addr = trimmed.replace(/^.*?:\s*/, "");
    if (addr.length > 5) {
      detected.address = addr;
      return;
    }
  }

  // ─── Business hours ───────────────────────────────────────────────
  if (/horario|lun|mar|mi[ée]|jue|vie|s[áa]b|dom|mon|tue|wed|thu|fri|sat|sun/.test(lower)) {
    const hour = parseBusinessHour(trimmed);
    if (hour) {
      detected.business_hours.push(hour);
      return;
    }
  }

  // ─── Human handoff rules ──────────────────────────────────────────
  if (/derivar|humano|operador|agente humano|transferir|reclamo|queja/.test(lower)) {
    detected.human_handoff_rules.push(trimmed.replace(/^.*?:\s*/, ""));
    return;
  }

  // ─── Promotions ───────────────────────────────────────────────────
  if (/promoci[oó]n|descuento|oferta|\b2x1\b|happy hour|cup[oó]n/.test(lower)) {
    detected.promotions.push(trimmed.replace(/^.*?:\s*/, ""));
    return;
  }

  // ─── Notes ────────────────────────────────────────────────────────
  if (/^(?:nota|observaci[oó]n|informaci[oó]n adicional)\s*[:\-]/.test(lower)) {
    detected.notes.push(trimmed.replace(/^.*?[:\-]\s*/, ""));
    return;
  }

  // ─── Payment conditions ───────────────────────────────────────────
  if (/pago|tarjeta|efectivo|transferencia|payphone|m[ée]todo de pago|condiciones de pago/.test(lower)) {
    detected.payment_conditions.push(trimmed.replace(/^.*?:\s*/, ""));
    return;
  }

  // ─── Appointment conditions ───────────────────────────────────────
  if (/cita|agendar|reserva|anticipo|cancelaci[óo]n|appointment/.test(lower)) {
    detected.appointment_conditions.push(trimmed.replace(/^.*?:\s*/, ""));
    return;
  }

  // ─── Policies ─────────────────────────────────────────────────────
  if (/pol[íi]tica|garant|devoluci[óo]n|reembolso|retracto/.test(lower)) {
    detected.policies.push(trimmed.replace(/^.*?:\s*/, ""));
    return;
  }

  // ─── Products with price (e.g. "Camiseta $15.99" or "Camiseta: 15.99") ─
  const productPriceMatch = trimmed.match(
    /^(.+?)[\s\-:]*\$?\s*(\d+[.,]?\d*)\s*(usd|d[óo]lar|eur|€)?$/i
  );
  if (productPriceMatch && productPriceMatch[1].length > 2) {
    const name = productPriceMatch[1].trim();
    const price = parseFloat(productPriceMatch[2].replace(",", ".")) || undefined;
    const currency = productPriceMatch[3]?.toUpperCase().includes("EUR")
      ? "EUR"
      : "USD";
    // Avoid duplicates
    if (!detected.products.some((p) => p.name === name)) {
      detected.products.push({ name, price, currency });
      if (price !== undefined) {
        detected.prices.push({ item: name, price, currency });
      }
      return;
    }
  }

  // ─── FAQ pairs (P: ... R: ... or Q: ... A: ...) ───────────────────
  const faqMatch = trimmed.match(
    /^(?:p|q|pregunta|question)[:.]\s*(.+?)\s*(?:r|a|respuesta|answer)[:.]\s*(.+)$/i
  );
  if (faqMatch) {
    detected.faqs.push({
      question: faqMatch[1].trim(),
      answer: faqMatch[2].trim(),
    });
    return;
  }

  // ─── Services ─────────────────────────────────────────────────────
  if (/servicio|service|consulta|sesi[óo]n|tratamiento|clase|taller/.test(lower)) {
    detected.services.push({ name: trimmed.replace(/^.*?:\s*/, "") });
    return;
  }

  // ─── Stock items ──────────────────────────────────────────────────
  const stockMatch = trimmed.match(
    /^(.+?)\s*[:\-]\s*(\d+)\s*(unidades?|u\.?|stock|inv)?$/i
  );
  if (stockMatch && stockMatch[1].length > 2) {
    detected.stock_items.push({
      name: stockMatch[1].trim(),
      stock: parseInt(stockMatch[2], 10),
    });
    return;
  }

  // ─── Unknown / ambiguous ──────────────────────────────────────────
  detected.unknown.push(trimmed);
}

// ─── FAQ parser ──────────────────────────────────────────────────────

function parseFaqPairs(text: string, detected: DetectedKnowledge) {
  if (!text.trim()) return;
  // Match patterns like "P: question\nR: answer" or "Q: ... A: ..."
  const regex =
    /(?:p|q|pregunta|question)[:.]\s*(.+?)\s*\n?\s*(?:r|a|respuesta|answer)[:.]\s*(.+?)(?=\n\s*(?:p|q|pregunta|question)[:.]|$)/gis;
  let match;
  while ((match = regex.exec(text)) !== null) {
    detected.faqs.push({
      question: match[1].trim(),
      answer: match[2].trim(),
    });
  }
}

// ─── Business hour parser ────────────────────────────────────────────

function parseBusinessHour(line: string): DetectedBusinessHour | null {
  const lower = line.toLowerCase();
  // Days mapping
  const days = [
    { es: "lunes|lun", en: "monday|mon" },
    { es: "martes|mar", en: "tuesday|tue" },
    { es: "mi[ée]rcoles|mi[ée]", en: "wednesday|wed" },
    { es: "jueves|jue", en: "thursday|thu" },
    { es: "viernes|vie", en: "friday|fri" },
    { es: "s[áa]bado|s[áa]b", en: "saturday|sat" },
    { es: "domingo|dom", en: "sunday|sun" },
  ];
  for (let i = 0; i < days.length; i++) {
    const re = new RegExp(`(${days[i].es}|${days[i].en})`, "i");
    if (re.test(lower)) {
      // Extract times like "9-18" or "09:00 - 18:00" or "9:00 a 18:00"
      const timeMatch = line.match(
        /(\d{1,2}(?::\d{2})?)\s*(?:a|to|-|–|hasta)\s*(\d{1,2}(?::\d{2})?)/i
      );
      if (timeMatch) {
        return {
          day: days[i].es.split("|")[0], // "lunes"
          open: timeMatch[1],
          close: timeMatch[2],
        };
      }
    }
  }
  return null;
}

// ─── Merge multiple sources ──────────────────────────────────────────

export function mergeDetectedKnowledge(
  results: ProcessResult[]
): DetectedKnowledge {
  const merged: DetectedKnowledge = {
    products: [],
    services: [],
    faqs: [],
    business_hours: [],
    policies: [],
    promotions: [],
    notes: [],
    prices: [],
    stock_items: [],
    address: "",
    human_handoff_rules: [],
    payment_conditions: [],
    appointment_conditions: [],
    unknown: [],
  };

  for (const r of results) {
    const d = r.detected;
    merged.products.push(...d.products);
    merged.services.push(...d.services);
    merged.faqs.push(...d.faqs);
    merged.business_hours.push(...d.business_hours);
    merged.policies.push(...d.policies);
    merged.promotions.push(...d.promotions);
    merged.notes.push(...d.notes);
    merged.prices.push(...d.prices);
    merged.stock_items.push(...d.stock_items);
    if (!merged.address && d.address) merged.address = d.address;
    merged.human_handoff_rules.push(...d.human_handoff_rules);
    merged.payment_conditions.push(...d.payment_conditions);
    merged.appointment_conditions.push(...d.appointment_conditions);
    merged.unknown.push(...d.unknown);
  }

  // Deduplicate products by name
  merged.products = dedupeByName(merged.products);
  merged.services = dedupeByName(merged.services);
  merged.policies = dedupeStrings(merged.policies);
  merged.promotions = dedupeStrings(merged.promotions);
  merged.notes = dedupeStrings(merged.notes);

  return merged;
}

function dedupeByName<T extends { name: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    const key = item.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Format detected knowledge for AI system prompt ──────────────────

export function formatDetectedKnowledgeForPrompt(
  detected: DetectedKnowledge
): string {
  const parts: string[] = [];

  if (detected.products.length > 0) {
    parts.push(
      `PRODUCTOS DEL CATÁLOGO:\n${detected.products
        .map(
          (p) =>
            `- ${p.name}${p.price !== undefined ? ` ($${p.price}${p.currency ? ` ${p.currency}` : ""})` : ""}${p.stock !== undefined ? ` [stock: ${p.stock}]` : ""}${p.sku ? ` [SKU: ${p.sku}]` : ""}`
        )
        .join("\n")}`
    );
  }

  if (detected.services.length > 0) {
    parts.push(
      `SERVICIOS:\n${detected.services
        .map(
          (s) =>
            `- ${s.name}${s.durationMinutes ? ` (${s.durationMinutes} min)` : ""}${s.price !== undefined ? ` ($${s.price})` : ""}`
        )
        .join("\n")}`
    );
  }

  if (detected.faqs.length > 0) {
    parts.push(
      `PREGUNTAS FRECUENTES:\n${detected.faqs
        .map((f) => `P: ${f.question}\nR: ${f.answer}`)
        .join("\n")}`
    );
  }

  if (detected.business_hours.length > 0) {
    parts.push(
      `HORARIOS DE ATENCIÓN:\n${detected.business_hours
        .map((h) => `${h.day}: ${h.open} - ${h.close}`)
        .join("\n")}`
    );
  }

  if (detected.policies.length > 0) {
    parts.push(`POLÍTICAS:\n${detected.policies.map((p) => `- ${p}`).join("\n")}`);
  }

  if (detected.promotions.length > 0) {
    parts.push(`PROMOCIONES:\n${detected.promotions.map((p) => `- ${p}`).join("\n")}`);
  }

  if (detected.notes.length > 0) {
    parts.push(`NOTAS:\n${detected.notes.map((p) => `- ${p}`).join("\n")}`);
  }

  if (detected.payment_conditions.length > 0) {
    parts.push(
      `CONDICIONES DE PAGO:\n${detected.payment_conditions.map((p) => `- ${p}`).join("\n")}`
    );
  }

  if (detected.appointment_conditions.length > 0) {
    parts.push(
      `CONDICIONES DE AGENDA:\n${detected.appointment_conditions.map((p) => `- ${p}`).join("\n")}`
    );
  }

  if (detected.human_handoff_rules.length > 0) {
    parts.push(
      `REGLAS PARA DERIVAR A HUMANO:\n${detected.human_handoff_rules.map((p) => `- ${p}`).join("\n")}`
    );
  }

  if (detected.address) {
    parts.push(`DIRECCIÓN: ${detected.address}`);
  }

  return parts.length > 0 ? parts.join("\n\n") : "";
}
