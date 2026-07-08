import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapPayphoneWebhookStatus } from "@/lib/payphone-link";
import { rateLimit, getClientIP, RATE_LIMIT_ERROR, GENERIC_ERROR } from "@/lib/security";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/payphone/webhook
 *
 * Recibe la Notificación Externa de PayPhone cuando el estado de una
 * transacción cambia (Approved, Canceled, etc.).
 *
 * PayPhone envía estos campos:
 *   - ClientTransactionId  (nuestro ID generado al crear el link)
 *   - TransactionId        (ID interno de PayPhone)
 *   - StatusCode           (1=Pending, 2=Canceled, 3=Approved)
 *   - TransactionStatus    ("Pending" | "Canceled" | "Approved")
 *   - StoreId
 *   - Amount               (en centavos)
 *   - Currency             ("USD")
 *   - AuthorizationCode
 *   - Reference
 *
 * Reglas:
 *   1. Buscar payment_transaction por client_transaction_id.
 *   2. Evitar duplicados por TransactionId (providerTransactionId).
 *   3. No duplicar mensajes WhatsApp.
 *   4. No cambiar payment_success a failed.
 *   5. Guardar raw_event.
 *   6. Registrar audit log.
 *   7. Responder JSON confirmando recepción.
 */
export async function POST(req: Request) {
  const ip = getClientIP(req);
  if (!rateLimit(`payphone-webhook:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }

  try {
    const body = await req.json().catch(() => ({}));

    // Extract PayPhone webhook fields
    const clientTransactionId = String(body.ClientTransactionId || body.clientTransactionId || "").trim();
    const providerTransactionId = String(body.TransactionId || body.transactionId || "").trim() || null;
    const statusCode = typeof body.StatusCode === "number"
      ? body.StatusCode
      : typeof body.statusCode === "number"
        ? body.statusCode
        : (typeof body.StatusCode === "string" ? parseInt(body.StatusCode, 10) : undefined);
    const transactionStatus = String(body.TransactionStatus || body.transactionStatus || "").trim() || null;
    const storeId = String(body.StoreId || body.storeId || "").trim() || null;
    const amountRaw = body.Amount ?? body.amount;
    const amount = typeof amountRaw === "number" ? amountRaw / 100 : null; // PayPhone sends cents
    const currency = String(body.Currency || body.currency || "USD").trim() || null;
    const authorizationCode = String(body.AuthorizationCode || body.authorizationCode || "").trim() || null;
    const reference = String(body.Reference || body.reference || "").trim() || null;

    // Map PayPhone status to normalized status
    const newStatus = mapPayphoneWebhookStatus(statusCode, transactionStatus || undefined);

    // Check for duplicates by providerTransactionId
    let isDuplicate = false;
    if (providerTransactionId) {
      const existing = await db.paymentWebhookEvent.findFirst({
        where: { providerTransactionId, provider: "PayPhone" },
        select: { id: true, processed: true },
      });
      if (existing) {
        isDuplicate = true;
        // Record the duplicate event but don't re-process
        await db.paymentWebhookEvent.create({
          data: {
            provider: "PayPhone",
            clientTransactionId: clientTransactionId || null,
            providerTransactionId,
            storeId,
            statusCode: !isNaN(statusCode as number) ? statusCode : null,
            transactionStatus,
            amount,
            currency,
            authorizationCode,
            reference,
            rawEvent: JSON.stringify(body),
            processed: existing.processed,
            duplicate: true,
            processedAt: new Date(),
          },
        });

        void logAudit({
          action: "payment_webhook_received",
          entityType: "payment",
          ipAddress: ip,
          metadata: {
            provider: "PayPhone",
            client_transaction_id: clientTransactionId || null,
            provider_transaction_id: providerTransactionId,
            duplicate: true,
            status: newStatus,
          },
        });

        return NextResponse.json({
          ok: true,
          duplicate: true,
          message: "Evento duplicado. Ya fue procesado anteriormente.",
          client_transaction_id: clientTransactionId || null,
          provider_transaction_id: providerTransactionId,
          status: newStatus,
        });
      }
    }

    // Find the payment transaction by clientTransactionId
    let tx: { id: string; status: string; clientTransactionId: string | null; reference: string | null } | null = null;
    if (clientTransactionId) {
      tx = await db.paymentTransaction.findFirst({
        where: { clientTransactionId },
        select: { id: true, status: true, clientTransactionId: true, reference: true },
      });
    }

    // Also try by orderId as fallback
    if (!tx && clientTransactionId) {
      tx = await db.paymentTransaction.findFirst({
        where: { orderId: clientTransactionId },
        select: { id: true, status: true, clientTransactionId: true, reference: true },
      });
    }

    const previousStatus = tx?.status || null;

    // Determine if we should update the transaction
    let shouldUpdate = false;
    if (tx && newStatus !== "error") {
      // Rule: No cambiar payment_success a failed
      if (tx.status === "payment_success" && newStatus === "payment_failed") {
        shouldUpdate = false;
      }
      // Rule: No cambiar si el estado es el mismo (idempotency)
      else if (tx.status === newStatus) {
        shouldUpdate = false;
      } else {
        shouldUpdate = true;
      }
    }

    // Update the transaction if needed
    if (shouldUpdate && tx) {
      await db.paymentTransaction.update({
        where: { id: tx.id },
        data: {
          status: newStatus,
          providerPaymentId: providerTransactionId || undefined,
          paidAt: newStatus === "payment_success" ? new Date() : undefined,
        },
      });

      void logAudit({
        action: "payment_status_changed",
        entityType: "payment",
        entityId: tx.id,
        ipAddress: ip,
        metadata: {
          provider: "PayPhone",
          previous_status: previousStatus,
          new_status: newStatus,
          client_transaction_id: clientTransactionId || null,
          provider_transaction_id: providerTransactionId,
          status_code: statusCode ?? null,
          transaction_status: transactionStatus,
          authorization_code: authorizationCode,
        },
      });
    }

    // Save the webhook event
    const webhookEvent = await db.paymentWebhookEvent.create({
      data: {
        provider: "PayPhone",
        paymentTransactionId: tx?.id || null,
        clientTransactionId: clientTransactionId || null,
        providerTransactionId,
        storeId,
        statusCode: !isNaN(statusCode as number) ? statusCode : null,
        transactionStatus,
        amount,
        currency,
        authorizationCode,
        reference,
        rawEvent: JSON.stringify(body),
        processed: true,
        duplicate: false,
        processedAt: new Date(),
      },
    });

    void logAudit({
      action: "payment_webhook_received",
      entityType: "payment",
      entityId: tx?.id || webhookEvent.id,
      ipAddress: ip,
      metadata: {
        provider: "PayPhone",
        client_transaction_id: clientTransactionId || null,
        provider_transaction_id: providerTransactionId,
        status_code: statusCode ?? null,
        transaction_status: transactionStatus,
        normalized_status: newStatus,
        transaction_found: !!tx,
        status_updated: shouldUpdate,
        duplicate: isDuplicate,
      },
    });

    return NextResponse.json({
      ok: true,
      received: true,
      client_transaction_id: clientTransactionId || null,
      provider_transaction_id: providerTransactionId,
      status_code: statusCode ?? null,
      transaction_status: transactionStatus,
      normalized_status: newStatus,
      transaction_found: !!tx,
      previous_status: previousStatus,
      status_updated: shouldUpdate,
      webhook_event_id: webhookEvent.id,
      message: "Notificación recibida y procesada correctamente.",
    });
  } catch (err) {
    console.error("[payphone/webhook] error:", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}
