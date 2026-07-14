import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth/require-session";

export async function GET(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || 50), 100);
  const provider = searchParams.get("provider");
  const status = searchParams.get("status");
  const where: Record<string, unknown> = { userId: session.userId };
  if (provider) where.provider = provider;
  if (status) where.status = status;
  const txs = await db.paymentTransaction.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, select: { id: true, provider: true, providerPaymentId: true, orderId: true, amount: true, currency: true, status: true, paymentLink: true, createdAt: true, updatedAt: true } });
  return NextResponse.json({ transactions: txs });
}

export const dynamic = "force-dynamic";
