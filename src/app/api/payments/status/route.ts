import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth/require-session";
import { GENERIC_ERROR } from "@/lib/security";
import { logAuditFromRequest } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const paymentId = searchParams.get("payment_id");
    const providerPaymentId = searchParams.get("provider_payment_id");

    if (!paymentId && !providerPaymentId) {
      return NextResponse.json(
        { error: "Se requiere payment_id o provider_payment_id." },
        { status: 400 }
      );
    }

    let tx:
      | {
          id: string;
          provider: string;
          providerPaymentId: string | null;
          orderId: string | null;
          amount: number;
          currency: string;
          status: string;
          paymentLink: string | null;
          providerMode: string | null;
          createdAt: Date;
          updatedAt: Date;
        }
      | null = null;

    if (paymentId) {
      tx = await db.paymentTransaction.findUnique({
        where: { id: paymentId },
        select: {
          id: true,
          provider: true,
          providerPaymentId: true,
          orderId: true,
          amount: true,
          currency: true,
          status: true,
          paymentLink: true,
          providerMode: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } else if (providerPaymentId) {
      tx = await db.paymentTransaction.findFirst({
        where: { providerPaymentId: String(providerPaymentId) },
        select: {
          id: true,
          provider: true,
          providerPaymentId: true,
          orderId: true,
          amount: true,
          currency: true,
          status: true,
          paymentLink: true,
          providerMode: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    }

    if (!tx) {
      return NextResponse.json(
        { error: "Transacción no encontrada." },
        { status: 404 }
      );
    }

    // Audit log: record that this user (or admin) checked the payment status.
    // We log the entity id from the request (payment_id || provider_payment_id)
    // for traceability, even when the lookup was performed by provider_payment_id.
    void logAuditFromRequest(req, {
      userId: session.userId,
      action: "payment_status_checked",
      entityType: "payment",
      entityId: paymentId || providerPaymentId || tx.id,
      metadata: {
        actor_role: session.role,
        payment_transaction_id: tx.id,
        audit_status: "success",
        provider: tx.provider,
        current_status: tx.status,
        looked_up_by: paymentId ? "payment_id" : "provider_payment_id",
      },
    });

    // Do NOT return raw_response — may contain provider secrets.
    return NextResponse.json({
      payment_id: tx.id,
      provider: tx.provider,
      provider_payment_id: tx.providerPaymentId,
      order_id: tx.orderId,
      amount: tx.amount,
      currency: tx.currency,
      status: tx.status,
      payment_link: tx.paymentLink,
      mode: tx.providerMode,
      created_at: tx.createdAt,
      updated_at: tx.updatedAt,
    });
  } catch (err) {
    console.error("[payments/status] error", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}
