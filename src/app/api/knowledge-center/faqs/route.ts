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

/** POST /api/knowledge-center/faqs — create a FAQ */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const businessId = session.clientId || DEFAULT_BUSINESS_ID;
  const body = await req.json().catch(() => ({}));
  const { question, answer, category } = body;
  if (!question || !answer) {
    return NextResponse.json({ error: "Pregunta y respuesta son obligatorias." }, { status: 400 });
  }
  try {
    const base = await ensureBase(businessId);
    const faq = await db.knowledgeFaq.create({
      data: {
        knowledgeBaseId: base.id,
        question: String(question).trim(),
        answer: String(answer).trim(),
        category: String(category || "general").trim(),
      },
    });
    return NextResponse.json({ ok: true, faq });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al crear FAQ.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE /api/knowledge-center/faqs?id=... — delete a FAQ */
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id." }, { status: 400 });
  try {
    await db.knowledgeFaq.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al eliminar FAQ.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** PATCH /api/knowledge-center/faqs?id=... — update a FAQ (toggle active, edit) */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id." }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  try {
    const faq = await db.knowledgeFaq.update({
      where: { id },
      data: {
        ...(body.question !== undefined && { question: String(body.question).trim() }),
        ...(body.answer !== undefined && { answer: String(body.answer).trim() }),
        ...(body.category !== undefined && { category: String(body.category).trim() }),
        ...(body.active !== undefined && { active: Boolean(body.active) }),
      },
    });
    return NextResponse.json({ ok: true, faq });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al actualizar FAQ.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
