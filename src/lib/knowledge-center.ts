/**
 * PayFlow SMT — Knowledge Center (por negocio)
 *
 * Arquitectura unificada del Agente IA Universal:
 *   - Cada negocio tiene una KnowledgeBase (FAQs + Documentos + Productos).
 *   - El Agente IA consulta este módulo para responder con datos REALES.
 *   - Prioridad: Productos (estructurado) > FAQs (estructurado) > Documentos (texto).
 *   - NUNCA inventa: si no hay conocimiento, responde que no tiene la info.
 *
 * Modo demo (sin DB): usa un catálogo embebido en código.
 * Modo producción (con DB): lee de Prisma filtrando por businessId.
 */
import { db } from "@/lib/db";

export interface KnowledgeContext {
  businessId: string;
  businessName?: string;
  products: KnowledgeProductItem[];
  faqs: KnowledgeFaqItem[];
  documents: KnowledgeDocumentItem[];
  /** Texto plano listo para inyectar en el system prompt del Agente IA. */
  systemPromptSection: string;
}

export interface KnowledgeProductItem {
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
}

export interface KnowledgeFaqItem {
  question: string;
  answer: string;
  category: string;
}

export interface KnowledgeDocumentItem {
  name: string;
  content: string;
  structuredData: Record<string, unknown>;
}

/**
 * Obtiene el contexto de conocimiento de un negocio.
 * Prioriza datos estructurados (productos, FAQs) sobre documentos.
 *
 * @param businessId ID del negocio. Default: "demo-business".
 */
export async function getKnowledgeContext(
  businessId: string = "demo-business"
): Promise<KnowledgeContext> {
  // Try DB first (production). Falls back to demo catalog if DB unavailable.
  try {
    const base = await db.knowledgeBase.findUnique({
      where: { businessId },
      include: {
        products: { where: { active: true }, orderBy: { category: "asc" } },
        faqs: { where: { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        documents: { where: { active: true } },
      },
    });

    if (base) {
      const products: KnowledgeProductItem[] = base.products.map((p) => ({
        name: p.name,
        description: p.description,
        price: p.price,
        currency: p.currency,
        category: p.category,
      }));
      const faqs: KnowledgeFaqItem[] = base.faqs.map((f) => ({
        question: f.question,
        answer: f.answer,
        category: f.category,
      }));
      const documents: KnowledgeDocumentItem[] = base.documents.map((d) => ({
        name: d.name,
        content: d.content,
        structuredData: safeJsonParse(d.structuredData, {}),
      }));
      return {
        businessId,
        businessName: base.name,
        products,
        faqs,
        documents,
        systemPromptSection: buildSystemPromptSection(base.name, products, faqs, documents),
      };
    }
  } catch {
    // DB unavailable — fall through to demo catalog.
  }

  // ─── Demo / fallback (no DB) ───────────────────────────────────────
  return getDemoKnowledgeContext();
}

/**
 * Catálogo demo embebido para cuando no hay DB configurada.
 */
export function getDemoKnowledgeContext(): KnowledgeContext {
  const products: KnowledgeProductItem[] = [
    { name: "Almuerzo del día", description: "Sopa, segundo y jugo natural.", price: 3.5, currency: "USD", category: "Almuerzos" },
    { name: "Hamburguesa clásica", description: "Carne 150g, queso, lechuga, tomate y papas.", price: 5.0, currency: "USD", category: "Hamburguesas" },
    { name: "Pollo a la plancha", description: "Pechuga a la plancha con ensalada y arroz.", price: 6.5, currency: "USD", category: "Platos fuertes" },
    { name: "Ensalada César", description: "Lechuga, pollo, crutones, parmesano y aderezo César.", price: 4.5, currency: "USD", category: "Ensaladas" },
    { name: "Lasaña de carne", description: "Capas de pasta, carne boloñesa y queso gratinado.", price: 5.5, currency: "USD", category: "Platos fuertes" },
    { name: "Jugo natural", description: "Naranja, maracuyá o mora. 350ml.", price: 1.5, currency: "USD", category: "Bebidas" },
  ];
  const faqs: KnowledgeFaqItem[] = [
    { question: "¿Cuál es el horario de atención?", answer: "Atendemos de lunes a sábado de 9:00 a 18:00. Domingo cerrado.", category: "general" },
    { question: "¿Hacen entregas a domicilio?", answer: "Sí, hacemos entregas a domicilio dentro de la ciudad por un adicional de $1.00.", category: "general" },
    { question: "¿Qué métodos de pago aceptan?", answer: "Aceptamos tarjetas de crédito/débito y transferencias a través de nuestro link de pago.", category: "pagos" },
  ];
  const documents: KnowledgeDocumentItem[] = [];

  return {
    businessId: "demo-business",
    businessName: "Restaurante Demo",
    products,
    faqs,
    documents,
    systemPromptSection: buildSystemPromptSection("Restaurante Demo", products, faqs, documents),
  };
}

/**
 * Construye la sección del system prompt con el conocimiento del negocio.
 * PRIORIZA datos estructurados (productos y FAQs) sobre documentos.
 */
function buildSystemPromptSection(
  businessName: string,
  products: KnowledgeProductItem[],
  faqs: KnowledgeFaqItem[],
  documents: KnowledgeDocumentItem[]
): string {
  const lines: string[] = [];
  lines.push(`Eres el asistente virtual de "${businessName}". Responde SIEMPRE como este negocio.`);
  lines.push("REGLAS: respuestas cortas y comerciales. NUNCA inventes información. Si no sabes algo, di que no tienes esa información.");
  lines.push("");
  lines.push("=== PRODUCTOS / CATÁLOGO (datos estructurados — prioridad máxima) ===");
  if (products.length === 0) {
    lines.push("(Sin productos cargados)");
  } else {
    // Group by category
    const byCategory = new Map<string, KnowledgeProductItem[]>();
    for (const p of products) {
      if (!byCategory.has(p.category)) byCategory.set(p.category, []);
      byCategory.get(p.category)!.push(p);
    }
    for (const [cat, items] of byCategory) {
      lines.push(`[${cat}]`);
      for (const p of items) {
        lines.push(`- ${p.name} — ${p.price.toFixed(2)} ${p.currency} (${p.description})`);
      }
    }
  }
  lines.push("");
  lines.push("=== PREGUNTAS FRECUENTES (FAQs — datos estructurados) ===");
  if (faqs.length === 0) {
    lines.push("(Sin FAQs cargadas)");
  } else {
    for (const f of faqs) {
      lines.push(`P: ${f.question}`);
      lines.push(`R: ${f.answer}`);
    }
  }
  if (documents.length > 0) {
    lines.push("");
    lines.push("=== DOCUMENTOS DEL NEGOCIO (texto de referencia) ===");
    for (const d of documents) {
      lines.push(`--- ${d.name} ---`);
      lines.push(d.content.slice(0, 800));
      if (d.content.length > 800) lines.push("...(truncado)");
    }
  }
  return lines.join("\n");
}

/**
 * Busca la mejor respuesta del knowledge base para un mensaje del cliente.
 * Prioridad: match exacto de FAQ > match por keywords en productos > documentos.
 * Retorna null si no encuentra nada relevante.
 */
export function findRelevantKnowledge(
  ctx: KnowledgeContext,
  clientMessage: string
): { type: "faq" | "catalog" | "none"; content: string } | null {
  const msg = clientMessage.toLowerCase().trim();
  if (!msg) return null;

  // 1. Buscar FAQ que coincida (match por keywords de la pregunta)
  for (const faq of ctx.faqs) {
    const q = faq.question.toLowerCase();
    // Si el mensaje contiene >= 2 palabras clave de la pregunta
    const qWords = q.split(/\s+/).filter((w) => w.length > 3);
    const matches = qWords.filter((w) => msg.includes(w)).length;
    if (matches >= 2 || (qWords.length > 0 && msg.includes(q))) {
      return { type: "faq", content: faq.answer };
    }
  }

  // 2. Si pregunta por productos/precios/menú → devolver catálogo
  const catalogKeywords = ["plato", "precio", "menú", "menu", "carta", "tienen", "producto", "comida", "platos", "cuánto", "cuanto", "ver", "lista", "opciones", "catálogo", "catalogo"];
  if (catalogKeywords.some((k) => msg.includes(k)) && ctx.products.length > 0) {
    const byCategory = new Map<string, KnowledgeProductItem[]>();
    for (const p of ctx.products) {
      if (!byCategory.has(p.category)) byCategory.set(p.category, []);
      byCategory.get(p.category)!.push(p);
    }
    const lines: string[] = ["📋 *Nuestro menú:*"];
    for (const [cat, items] of byCategory) {
      lines.push(`\n*${cat}*`);
      for (const p of items) {
        lines.push(`• ${p.name} — ${p.price.toFixed(2)} ${p.currency}`);
      }
    }
    lines.push("\n¿Te gustaría realizar un pedido? Dime el nombre del plato. 🛒");
    return { type: "catalog", content: lines.join("\n") };
  }

  return null;
}

function safeJsonParse(s: string, fallback: Record<string, unknown>): Record<string, unknown> {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}
