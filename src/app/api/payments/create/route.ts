import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth/require-session";
import { createPayment, type PaymentProvider, type PaymentStatus } from "@/lib/payments";
import { rateLimit, getClientIP, isValidAmount, isValidProvider, isValidCurrency, RATE_LIMIT_ERROR, GENERIC_ERROR } from "@/lib/security";
import { logAudit } from "@/lib/audit";
import { recordDurablePayment } from "@/lib/operational-telemetry";

export async function POST(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIP(req);
  if (!rateLimit(`payment:${ip}`, 20, 60_000)) return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });

  try {
    const body = await req.json();
    const { provider, amount, currency, description, customer, phoneNumber, orderId, workflowId, workflowRunId, customApiUrl, customApiHeaders, forceOutcome, payphoneIntegration, countryCode, customerDocument, reference } = body;

    if (!isValidAmount(amount)) return NextResponse.json({ error: "El monto debe ser mayor a 0." }, { status: 400 });
    if (!isValidProvider(provider)) return NextResponse.json({ error: "Proveedor de pago inválido." }, { status: 400 });
    if (currency && !isValidCurrency(currency)) return NextResponse.json({ error: "Moneda no permitida." }, { status: 400 });

    const result = await createPayment({
      provider: (provider as PaymentProvider) || "Mock", amount, currency: currency || "USD",
      description: description || "Pago", customer: customer || "", phoneNumber: phoneNumber || "",
      orderId: orderId || `ord_${Date.now()}`, userId: session.userId, workflowId, workflowRunId,
      customApiUrl, customApiHeaders, forceOutcome: forceOutcome as PaymentStatus | undefined,
      payphoneIntegration, countryCode, customerDocument, reference,
    });

    const tx = await db.paymentTransaction.create({
      data: {
        userId: session.userId, workflowId: workflowId || null, workflowRunId: workflowRunId || null,
        provider: result.payment_provider, providerPaymentId: result.provider_payment_id,
        orderId: result.order_id, amount: result.payment_amount, currency: result.payment_currency,
        status: result.payment_status, paymentLink: result.payment_link,
        rawResponse: JSON.stringify(result.raw_response),
      },
    });

    await recordDurablePayment({
      userId: session.userId,
      clientId: session.clientId,
      sourceKey: `payment:${tx.id}`,
      workflowId: workflowId || null,
      workflowRunId: workflowRunId || null,
      provider: result.payment_provider,
      providerPaymentId: result.provider_payment_id,
      orderId: result.order_id,
      amount: result.payment_amount,
      currency: result.payment_currency,
      status: result.payment_status,
      paymentLink: result.payment_link,
      rawResponse: result.raw_response,
    });

    void logAudit({ userId: session.userId, action: "payment_created", entityType: "payment", entityId: tx.id, ipAddress: ip, metadata: { provider: result.payment_provider, amount: result.payment_amount, status: result.payment_status } });

    return NextResponse.json({
      payment_id: tx.id, provider_payment_id: result.provider_payment_id,
      payment_provider: result.payment_provider, payment_status: result.payment_status,
      payment_link: result.payment_link, payment_amount: result.payment_amount,
      payment_currency: result.payment_currency, order_id: result.order_id,
      raw_response: result.raw_response,
      payphone_business_status: result.payphone_business_status,
      payphone_store_id: result.payphone_store_id, payphone_personal_status: result.payphone_personal_status,
      customer_phone: result.customer_phone, customer_document: result.customer_document,
      customer_name: result.customer_name, country_code: result.country_code,
      whatsapp_message: result.whatsapp_message,
    });
  } catch (err) {
    console.error("[payments/create] error", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
