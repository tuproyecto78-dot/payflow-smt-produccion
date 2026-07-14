import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeStatus } from "@/lib/payments";
import { rateLimit, getClientIP, RATE_LIMIT_ERROR, GENERIC_ERROR } from "@/lib/security";
import { logAudit } from "@/lib/audit";
import { verifySha256Signature } from "@/lib/webhook-signature";

export async function POST(req: Request) {
  try {
    const ip = getClientIP(req);
    if (!rateLimit(`webhook:${ip}`, 60, 60_000)) return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });

    const rawBody = await req.text();
    const secret = process.env.PAYMENT_WEBHOOK_SECRET || "";
    const signature = req.headers.get("x-payflow-signature");
    const allowUnsignedDevelopment = process.env.NODE_ENV !== "production" && process.env.ALLOW_UNSIGNED_PAYMENT_WEBHOOKS === "true";
    if (!verifySha256Signature(rawBody, signature, secret) && !allowUnsignedDevelopment) {
      return NextResponse.json({ error: "Firma de webhook inválida." }, { status: 401 });
    }
    const body = JSON.parse(rawBody || "{}");
    const headerPaymentId = req.headers.get("x-payflow-payment-id");
    const orderId = body.order_id || body.clientTransactionId || body.reference || null;
    const providerPaymentId = body.provider_payment_id || body.paymentId || body.id || body.payment_id || null;
    const internalId = body.payment_id || headerPaymentId || null;
    const rawStatus = body.status || body.payment_status || body.transactionStatus || "payment_pending";
    const provider = body.provider || body.provider_name || "Desconocido";

    let tx = null as null | { id: string; status: string };
    if (internalId) tx = await db.paymentTransaction.findUnique({ where: { id: internalId } });
    if (!tx && providerPaymentId) tx = await db.paymentTransaction.findFirst({ where: { providerPaymentId: String(providerPaymentId) } });
    if (!tx && orderId) tx = await db.paymentTransaction.findFirst({ where: { orderId: String(orderId) } });

    if (!tx) return NextResponse.json({ error: "Transacción no encontrada." }, { status: 404 });

    const newStatus = normalizeStatus(rawStatus);
    const previousStatus = tx.status;

    if (previousStatus === newStatus) return NextResponse.json({ ok: true, payment_id: tx.id, previous_status: previousStatus, new_status: newStatus, idempotent: true, message: "Evento ya procesado." });
    if (newStatus === "payment_success" && !providerPaymentId) return NextResponse.json({ error: "No se puede confirmar payment_success sin provider_payment_id." }, { status: 400 });
    if (previousStatus === "payment_success" && newStatus !== "payment_success") {
      return NextResponse.json({
        ok: true,
        payment_id: tx.id,
        previous_status: previousStatus,
        new_status: previousStatus,
        idempotent: true,
        message: "El pago aprobado conserva su estado final.",
      });
    }

    const updated = await db.paymentTransaction.update({
      where: { id: tx.id },
      data: { status: newStatus, rawResponse: JSON.stringify({ ...(typeof body.raw === "object" ? body.raw : {}), webhook: body, webhookReceivedAt: new Date().toISOString(), provider }) },
    });

    void logAudit({ action: "payment_status_changed", entityType: "payment", entityId: tx.id, ipAddress: ip, metadata: { previous: previousStatus, new: newStatus, provider } });

    return NextResponse.json({ ok: true, payment_id: updated.id, previous_status: previousStatus, new_status: newStatus, provider, received_at: updated.updatedAt });
  } catch (err) {
    console.error("[payments/webhook] error", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
