import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  createPayphoneApiLink,
  generateClientTransactionId,
  payphoneLinkWhatsAppMessage,
  validatePayphoneConfig,
  type PayphoneLinkRequestInput,
} from "@/lib/payphone/api-link";
import { getPayphoneConfig } from "@/lib/payphone/config";
import { rateLimit, getClientIP, isValidAmount, RATE_LIMIT_ERROR, GENERIC_ERROR } from "@/lib/security";
import { logAudit } from "@/lib/audit";
import { classifyPayPhoneError, savePaymentError } from "@/lib/payphone-errors";

export const dynamic = "force-dynamic";

// Zod schema for the request body. Strict validation — no extra fields.
const CreateLinkSchema = z.object({
  amount: z.number().positive("El monto debe ser mayor a 0.").max(1000000),
  currency: z.string().default("USD"),
  reference: z.string().min(1, "La referencia es obligatoria.").max(100),
  clientId: z.string().max(100).optional(),
  workflowId: z.string().max(100).optional(),
  workflowRunId: z.string().max(100).optional(),
  amountWithoutTax: z.number().nonnegative().optional(),
  amountWithTax: z.number().nonnegative().optional(),
  tax: z.number().nonnegative().optional(),
  service: z.number().nonnegative().optional(),
  tip: z.number().nonnegative().optional(),
  oneTime: z.boolean().default(true),
  isAmountEditable: z.boolean().default(false),
  expireIn: z.number().int().min(0).max(720).default(0),
  language: z.enum(["es", "en"]).default("es"),
});

/**
 * POST /api/payphone/create-link
 *
 * Creates a PayPhone API Link using the admin's own Business account
 * (PAYPHONE_TOKEN + PAYPHONE_STORE_ID from server env).
 *
 * Requires an authenticated session (admin/internal/client_owner).
 * All token handling is backend-only — the response NEVER includes the token.
 *
 * Response (success):
 *   {
 *     ok: true,
 *     payment_status: "payment_pending",
 *     provider: "payphone",
 *     mode: "payphone_api_link",
 *     payment_link: "...",
 *     client_transaction_id: "...",
 *     payment_transaction_id: "...",
 *     whatsapp_message: "..."
 *   }
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIP(req);
  if (!rateLimit(`payphone:create-link:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }

  // Validate PayPhone config FIRST — fail fast if not configured.
  const cfgValidation = validatePayphoneConfig();
  if (!cfgValidation.ok) {
    return NextResponse.json(
      {
        error: cfgValidation.error || "PayPhone no está configurado.",
      },
      { status: 503 }
    );
  }

  const cfg = getPayphoneConfig();

  try {
    const rawBody = await req.json().catch(() => ({}));
    const parsed = CreateLinkSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || "Datos inválidos." },
        { status: 400 }
      );
    }
    const body = parsed.data;

    if (body.currency.toUpperCase() !== "USD") {
      return NextResponse.json({ error: "PayPhone solo soporta USD." }, { status: 400 });
    }

    // Double-check amount via security helper.
    if (!isValidAmount(body.amount)) {
      void logAudit({
        userId: session.userId,
        action: "validation_error",
        entityType: "payment",
        ipAddress: ip,
        metadata: { reason: "invalid_amount", provider: "payphone" },
      });
      return NextResponse.json({ error: "El monto debe ser mayor a 0." }, { status: 400 });
    }

    // Generate unique clientTransactionId on the SERVER (never trust client).
    const clientTransactionId = generateClientTransactionId();

    // Build the API Link request.
    const linkReq: PayphoneLinkRequestInput = {
      amount: body.amount,
      currency: "USD",
      reference: body.reference,
      amountWithoutTax: body.amountWithoutTax,
      amountWithTax: body.amountWithTax,
      tax: body.tax,
      service: body.service,
      tip: body.tip,
      oneTime: body.oneTime,
      isAmountEditable: body.isAmountEditable,
      expireIn: body.expireIn,
      language: body.language,
      storeId: cfg.storeId || undefined,
    };

    const result = await createPayphoneApiLink(linkReq, clientTransactionId);

    // Build the sanitized raw request for storage (NO token).
    const rawRequest: Record<string, unknown> = {
      amount: Math.round(body.amount * 100),
      amountWithoutTax: body.amountWithoutTax !== undefined ? Math.round(body.amountWithoutTax * 100) : Math.round(body.amount * 100),
      amountWithTax: body.amountWithTax ? Math.round(body.amountWithTax * 100) : 0,
      tax: body.tax ? Math.round(body.tax * 100) : 0,
      service: body.service ? Math.round(body.service * 100) : 0,
      tip: body.tip ? Math.round(body.tip * 100) : 0,
      currency: "USD",
      clientTransactionId,
      storeId: cfg.storeId,
      reference: body.reference,
      oneTime: body.oneTime,
      isAmountEditable: body.isAmountEditable,
      expireIn: body.expireIn,
      language: body.language,
      // NOTE: token is intentionally NOT included.
    };

    // Save the transaction (status = payment_pending when link created; "error" otherwise).
    const tx = await db.paymentTransaction.create({
      data: {
        userId: session.userId,
        clientId: body.clientId || null,
        workflowId: body.workflowId || null,
        workflowRunId: body.workflowRunId || null,
        provider: "payphone",
        providerMode: "link",
        integrationType: "API_LINK",
        credentialMode: "GLOBAL_ADMIN_ACCOUNT",
        clientTransactionId,
        storeId: cfg.storeId,
        orderId: clientTransactionId,
        amount: body.amount,
        amountWithoutTax: body.amountWithoutTax ?? body.amount,
        amountWithTax: body.amountWithTax ?? 0,
        tax: body.tax ?? 0,
        service: body.service ?? 0,
        tip: body.tip ?? 0,
        currency: "USD",
        reference: body.reference,
        paymentLink: result.payment_link || null,
        status: result.ok ? "payment_pending" : "error",
        rawRequest: JSON.stringify(rawRequest),
        rawResponse: JSON.stringify(result.raw_response),
      },
    });

    // Audit log (no tokens in metadata).
    void logAudit({
      userId: session.userId,
      clientId: body.clientId || null,
      action: "payphone_link_created",
      entityType: "payment",
      entityId: tx.id,
      ipAddress: ip,
      metadata: {
        provider: "payphone",
        integration_type: "API_LINK",
        credential_mode: "GLOBAL_ADMIN_ACCOUNT",
        env: cfg.env,
        amount: body.amount,
        currency: "USD",
        reference: body.reference,
        client_transaction_id: clientTransactionId,
        store_id_last_four: cfg.storeIdLastFour,
        link_created: result.ok,
      },
    });

    if (!result.ok) {
      // Classify and save the error using the PayPhone Error Handler.
      const httpStatus = result.http_status;
      const providerMsg = result.error || "";
      const errorInput = {
        paymentTransactionId: tx.id,
        statusCode: httpStatus,
        providerMessage: providerMsg,
        rawError: result.raw_response as Record<string, unknown>,
        error: result.error,
      };
      const errorResult = classifyPayPhoneError(errorInput);
      void savePaymentError(errorInput, errorResult);

      // Safe log (no tokens).
      console.error("[payphone/create-link] PayPhone API error:", {
        env: cfg.env,
        store_id_last_four: cfg.storeIdLastFour,
        token_configured: cfg.tokenConfigured,
        error_type: errorResult.errorType,
        error_code: errorResult.errorCode,
        status_code: errorResult.statusCode,
        admin_message: errorResult.adminMessage,
      });

      return NextResponse.json(
        {
          ok: false,
          error: errorResult.adminMessage,
          user_message: errorResult.userMessage,
          error_type: errorResult.errorType,
          error_code: errorResult.errorCode,
          retryable: errorResult.retryable,
          payment_transaction_id: tx.id,
          client_transaction_id: clientTransactionId,
        },
        { status: 502 }
      );
    }

    // Build WhatsApp message
    const whatsappMessage = payphoneLinkWhatsAppMessage(
      body.amount,
      "USD",
      body.reference,
      result.payment_link,
      body.language
    );

    return NextResponse.json({
      ok: true,
      payment_status: "payment_pending",
      provider: "payphone",
      mode: "payphone_api_link",
      payment_link: result.payment_link,
      client_transaction_id: clientTransactionId,
      payment_transaction_id: tx.id,
      store_id_last_four: cfg.storeIdLastFour,
      amount: body.amount,
      currency: "USD",
      reference: body.reference,
      whatsapp_message: whatsappMessage,
    });
  } catch (err) {
    console.error("[payphone/create-link] error:", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}
