import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeStatus } from "@/lib/payments";
import { rateLimit, getClientIP, RATE_LIMIT_ERROR, GENERIC_ERROR } from "@/lib/security";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const ip = getClientIP(req);
    if (!rateLimit(`webhook:${ip}`, 60, 60_000)) return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });

    const body = await req.json().catch(() => ({}));
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
