import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const tx = await db.paymentTransaction.findUnique({ where: { id } });
  if (!tx || tx.userId !== session.userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ transaction: { id: tx.id, provider: tx.provider, provider_payment_id: tx.providerPaymentId, order_id: tx.orderId, amount: tx.amount, currency: tx.currency, status: tx.status, payment_link: tx.paymentLink, raw_response: JSON.parse(tx.rawResponse || "{}"), workflow_id: tx.workflowId, workflow_run_id: tx.workflowRunId, created_at: tx.createdAt, updated_at: tx.updatedAt } });
}

export const dynamic = "force-dynamic";
