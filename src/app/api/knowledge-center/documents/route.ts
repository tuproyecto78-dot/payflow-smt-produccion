import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const DEFAULT_BUSINESS_ID = "demo-business";

async function ensureBase(businessId: string) {
  const existing = await db.knowledgeBase.findUnique({ where: { businessId } });
  if (existing) return existing;
  return db.knowledgeBase.create({ data: { businessId, name: "Base de conocimiento" } });
}

/**
 * Extracción estructurada simple de un texto.
 * Detecta productos con precios, horarios y políticas comunes.
 */
function extractStructured(text: string): {
  products: { name: string; price: number; currency: string }[];
  hours: string | null;
  policies: string[];
} {
  const products: { name: string; price: number; currency: string }[] = [];
  const lines = text.split(/\n+/);
  // Regex: "Nombre ... $3.50" o "Nombre ... 3.50 USD" o "Nombre: 3.50"
  const priceRegex = /(.*?)[:\s]+\$?(\d+[.,]?\d*)\s*(USD|usd|\$)?/i;
  for (const line of lines) {
    const m = line.match(priceRegex);
    if (m && m[1] && m[2]) {
      const name = m[1].trim().replace(/^[-•*\d.\s]+/, "").trim();
      const price = parseFloat(m[2].replace(",", "."));
      if (name.length > 2 && name.length < 80 && !isNaN(price) && price > 0) {
        products.push({ name, price, currency: "USD" });
      }
    }
  }
  // Horarios
  let hours: string | null = null;
  const hoursMatch = text.match(/(horario[s]?:?\s*.+?|lunes[\s\S]{0,60}domingo)/i);
  if (hoursMatch) hours = hoursMatch[0].slice(0, 120);
  // Políticas (devoluciones, garantía, envíos)
  const policies: string[] = [];
  const policyKeywords = ["devoluc", "garantía", "garantia", "envío", "envio", "cancelación", "cancelacion", "política", "politica"];
  for (const line of lines) {
    if (policyKeywords.some((k) => line.toLowerCase().includes(k)) && line.trim().length > 10) {
      policies.push(line.trim().slice(0, 200));
    }
  }
  return { products, hours, policies };
}

/** POST /api/knowledge-center/documents — create a document (text/manual) */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const businessId = session.clientId || DEFAULT_BUSINESS_ID;
  const body = await req.json().catch(() => ({}));
  const { name, content, type } = body;
  if (!name || !content) {
    return NextResponse.json({ error: "Nombre y contenido son obligatorios." }, { status: 400 });
  }
  try {
    const base = await ensureBase(businessId);
    const text = String(content);
    const extraction = extractStructured(text);
    const doc = await db.knowledgeDocument.create({
      data: {
        knowledgeBaseId: base.id,
        name: String(name).trim(),
        type: String(type || "text"),
        content: text,
        structuredData: JSON.stringify(extraction),
        extractionStatus: "extracted",
      },
    });
    return NextResponse.json({ ok: true, document: doc, extraction });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al crear documento.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE /api/knowledge-center/documents?id=... */
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id." }, { status: 400 });
  try {
    await db.knowledgeDocument.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al eliminar documento.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
