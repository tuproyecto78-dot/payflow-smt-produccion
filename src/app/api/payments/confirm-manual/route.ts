/**
 * POST /api/payments/confirm-manual
 *
 * Manual confirmation endpoint for payment intents created with the
 * "manual_link" route (external payment link like Stripe/PayPal/etc.).
 *
 * Flow:
 *   1. Business creates a payment_intent in "pending" status via
 *      /api/payments/sandbox-test (or the orchestrator) with route=manual_link.
 *   2. The customer pays through the external link.
 *   3. The business manually confirms the payment here (no webhook for
 *      external links — the business is responsible for verifying).
 *
 * PayFlow SMT is an ORCHESTRATOR, not a gateway. It does not process the
 * actual payment for manual links — it only tracks the intent status so the
 * workflow can branch on payment_success / payment_failed.
 *
 * Request body:
 *   { payment_transaction_id: string, status: "payment_success" | "payment_failed" }
 *
 * Response:
 *   { ok: boolean, payment_status: string, payment_transaction_id: string }
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth/require-session";
import { isInternalAccessRole } from "@/lib/auth/access-profile";
import { rateLimit, getClientIP, RATE_LIMIT_ERROR } from "@/lib/security";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await requireActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIP(req);
  if (!rateLimit(`payments:confirm-manual:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }

  // Sandbox guard: only allow in non-production OR when explicitly enabled.
  if (process.env.NODE_ENV === "production" && process.env.PAYMENTS_SANDBOX_ENABLED !== "true") {
    return NextResponse.json(
      { error: "La confirmación manual está desactivada en producción." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const paymentTransactionId = String(body.payment_transaction_id || "").trim();
    const newStatus = String(body.status || "").trim();

    if (!paymentTransactionId) {
      return NextResponse.json(
        { error: "payment_transaction_id es obligatorio." },
        { status: 400 }
      );
    }
    if (newStatus !== "payment_success" && newStatus !== "payment_failed") {
      return NextResponse.json(
        { error: "status debe ser 'payment_success' o 'payment_failed'." },
        { status: 400 }
      );
    }

    // Find the transaction.
    const tx = await db.paymentTransaction.findUnique({
      where: { id: paymentTransactionId },
      select: { id: true, status: true, provider: true, integrationType: true, clientId: true, amount: true, currency: true },
    });

    if (!tx) {
      return NextResponse.json({ error: "Transacción no encontrada." }, { status: 404 });
    }

    // Only manual_link transactions can be confirmed manually.
    if (tx.integrationType !== "MANUAL_LINK") {
      return NextResponse.json(
        { error: "Solo las transacciones de link externo manual pueden confirmarse manualmente." },
        { status: 400 }
      );
    }

    // Access control: admins can confirm any; clients only their own.
    if (!isInternalAccessRole(session.role)) {
      if (!tx.clientId || tx.clientId !== session.clientId) {
        return NextResponse.json({ error: "No tienes permiso para confirmar esta transacción." }, { status: 403 });
      }
    }

    // Idempotency: no cambiar payment_success a failed.
    if (tx.status === "payment_success" && newStatus !== "payment_success") {
      return NextResponse.json({
        ok: false,
        error: "La transacción ya fue confirmada como exitosa. No se puede cambiar a fallida.",
        payment_status: tx.status,
        payment_transaction_id: tx.id,
      }, { status: 409 });
    }

    // Idempotency: no cambiar si el estado es el mismo.
    if (tx.status === newStatus) {
      return NextResponse.json({
        ok: true,
        message: "La transacción ya tenía este estado.",
        payment_status: tx.status,
        payment_transaction_id: tx.id,
      });
    }

    // Update the transaction.
    await db.paymentTransaction.update({
      where: { id: tx.id },
      data: {
        status: newStatus,
        paidAt: newStatus === "payment_success" ? new Date() : null,
      },
    });

    void logAudit({
      userId: session.userId,
      clientId: tx.clientId,
      action: "manual_payment_confirmed",
      entityType: "payment",
      entityId: tx.id,
      ipAddress: ip,
      metadata: {
        provider: tx.provider,
        integration_type: tx.integrationType,
        previous_status: tx.status,
        new_status: newStatus,
        amount: tx.amount,
        currency: tx.currency,
      },
    });

    return NextResponse.json({
      ok: true,
      payment_status: newStatus,
      payment_transaction_id: tx.id,
    });
  } catch (err) {
    console.error("[payments/confirm-manual] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al confirmar el pago." },
      { status: 500 }
    );
  }
}
