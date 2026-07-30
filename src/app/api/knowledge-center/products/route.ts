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

/** POST /api/knowledge-center/products — create a product */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const businessId = session.clientId || DEFAULT_BUSINESS_ID;
  const body = await req.json().catch(() => ({}));
  const { name, description, price, currency, category } = body;
  if (!name) return NextResponse.json({ error: "Nombre es obligatorio." }, { status: 400 });
  try {
    const base = await ensureBase(businessId);
    const product = await db.knowledgeProduct.create({
      data: {
        knowledgeBaseId: base.id,
        name: String(name).trim(),
        description: String(description || "").trim(),
        price: Number(price) || 0,
        currency: String(currency || "USD").trim(),
        category: String(category || "general").trim(),
      },
    });
    return NextResponse.json({ ok: true, product });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al crear producto.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE /api/knowledge-center/products?id=... */
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id." }, { status: 400 });
  try {
    await db.knowledgeProduct.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al eliminar producto.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** PATCH /api/knowledge-center/products?id=... */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id." }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  try {
    const product = await db.knowledgeProduct.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: String(body.name).trim() }),
        ...(body.description !== undefined && { description: String(body.description).trim() }),
        ...(body.price !== undefined && { price: Number(body.price) || 0 }),
        ...(body.currency !== undefined && { currency: String(body.currency).trim() }),
        ...(body.category !== undefined && { category: String(body.category).trim() }),
        ...(body.active !== undefined && { active: Boolean(body.active) }),
      },
    });
    return NextResponse.json({ ok: true, product });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al actualizar producto.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
