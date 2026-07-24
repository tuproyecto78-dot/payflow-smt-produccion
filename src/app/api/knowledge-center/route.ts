import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { getKnowledgeContext } from "@/lib/knowledge-center";

export const dynamic = "force-dynamic";

const DEFAULT_BUSINESS_ID = "demo-business";

/** Ensure a KnowledgeBase row exists for the business (lazy create). */
async function ensureBase(businessId: string) {
  const existing = await db.knowledgeBase.findUnique({ where: { businessId } });
  if (existing) return existing;
  return db.knowledgeBase.create({
    data: { businessId, name: "Base de conocimiento" },
  });
}

/**
 * GET /api/knowledge-center
 * Returns the full knowledge base for the current business:
 *   { businessId, businessName, products, faqs, documents }
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const businessId = session.clientId || DEFAULT_BUSINESS_ID;
  // Ensure base exists (lazy create) so the UI can start adding content.
  try {
    await ensureBase(businessId);
  } catch {
    // DB unavailable — fall through to demo context.
  }
  const ctx = await getKnowledgeContext(businessId);
  return NextResponse.json(ctx);
}
