import { z } from "zod";

import { requireActiveSession } from "@/lib/auth/require-session";
import { assertPaymentClientAccess } from "@/lib/external-integrations/payments/access";
import {
  createPayphoneApiLink,
  generateClientTransactionId,
  payphoneLinkWhatsAppMessage,
} from "@/lib/payphone/api-link";
import {
  getPayphoneMerchantCredentials,
  PayphoneMerchantError,
} from "@/lib/payphone/merchant-credentials";
import {
  completePartnerTransaction,
  publicPartnerTransaction,
  reservePartnerTransaction,
} from "@/lib/payphone/partner-transactions";
import {
  getClientIP,
  isValidAmount,
  rateLimit,
  RATE_LIMIT_ERROR,
} from "@/lib/security";

export const dynamic = "force-dynamic";

const CreateLinkSchema = z
  .object({
    amount: z.number().positive().max(999_999.99),
    currency: z.string().default("USD"),
    reference: z.string().min(1).max(100),
    clientId: z.string().uuid().optional(),
    client_id: z.string().uuid().optional(),
    idempotencyKey: z.string().min(8).max(120).optional(),
    idempotency_key: z.string().min(8).max(120).optional(),
    amountWithoutTax: z.number().nonnegative().optional(),
    amountWithTax: z.number().nonnegative().optional(),
    tax: z.number().nonnegative().optional(),
    service: z.number().nonnegative().optional(),
    tip: z.number().nonnegative().optional(),
    oneTime: z.boolean().default(true),
    isAmountEditable: z.boolean().default(false),
    expireIn: z.number().int().min(0).max(720).default(0),
    language: z.enum(["es", "en"]).default("es"),
  })
  .strict();

function errorResponse(error: unknown) {
  if (error instanceof PayphoneMerchantError) {
    return Response.json(
      { ok: false, code: error.code, error: error.message },
      { status: error.httpStatus }
    );
  }
  const code = error instanceof Error ? error.message : "";
  if (code === "PAYPHONE_IDEMPOTENCY_CONFLICT") {
    return Response.json(
      {
        ok: false,
        code,
        error: "La clave de idempotencia ya pertenece a otro pago.",
      },
      { status: 409 }
    );
  }
  return Response.json(
    {
      ok: false,
      code: "PAYPHONE_CREATE_LINK_FAILED",
      error: "No se pudo crear la solicitud de pago.",
    },
    { status: 500 }
  );
}

export async function POST(request: Request) {
  const session = await requireActiveSession();
  if (!session) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  const ip = getClientIP(request);
  if (!rateLimit(`payphone-partner-create:${ip}`, 20, 60_000)) {
    return Response.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }
  try {
    const parsed = CreateLinkSchema.safeParse(
      await request.json().catch(() => ({}))
    );
    if (!parsed.success) {
      return Response.json(
        {
          ok: false,
          code: "INVALID_INPUT",
          error: parsed.error.issues[0]?.message || "Datos inválidos.",
        },
        { status: 400 }
      );
    }
    const body = parsed.data;
    const requestedClientId = body.client_id || body.clientId;
    const clientId = assertPaymentClientAccess({
      session,
      requestedClientId,
      permission: "create",
    });
    if (!isValidAmount(body.amount) || body.currency.toUpperCase() !== "USD") {
      return Response.json(
        {
          ok: false,
          code: "INVALID_PAYMENT_AMOUNT",
          error: "El monto debe ser válido y la moneda debe ser USD.",
        },
        { status: 400 }
      );
    }
    const idempotencyKey =
      body.idempotency_key ||
      body.idempotencyKey ||
      request.headers.get("idempotency-key")?.trim() ||
      "";
    if (!/^[A-Za-z0-9._:-]{8,120}$/.test(idempotencyKey)) {
      return Response.json(
        {
          ok: false,
          code: "INVALID_IDEMPOTENCY_KEY",
          error: "Idempotency-Key es obligatorio.",
        },
        { status: 400 }
      );
    }

    const credentials = await getPayphoneMerchantCredentials(clientId);
    const realCharge =
      credentials.environment === "production" &&
      process.env.PAYPHONE_REAL_CHARGES_ENABLED === "true";
    if (
      credentials.environment === "production" &&
      !realCharge &&
      !credentials.fallbackUrl
    ) {
      return Response.json(
        {
          ok: false,
          code: "PAYPHONE_REAL_CHARGES_DISABLED",
          error:
            "Los cobros reales están desactivados y no existe enlace externo de respaldo.",
        },
        { status: 409 }
      );
    }

    const clientTransactionId = generateClientTransactionId();
    const reservation = await reservePartnerTransaction({
      clientId,
      accountId: credentials.accountId,
      createdBy: session.userId,
      clientTransactionId,
      idempotencyKey,
      amountCents: Math.round(body.amount * 100),
      currency: "USD",
      reference: body.reference,
      realCharge,
    });
    if (reservation.reused) {
      if (reservation.transaction.status === "creating") {
        return Response.json(
          {
            ok: false,
            reused: true,
            code: "PAYPHONE_REQUEST_IN_PROGRESS",
            payment: publicPartnerTransaction(reservation.transaction),
          },
          { status: 202 }
        );
      }
      return Response.json({
        ok: reservation.transaction.status !== "error",
        reused: true,
        provider: "payphone",
        mode: reservation.transaction.fallbackUsed
          ? "external_link_fallback"
          : "payphone_api_link",
        payment: publicPartnerTransaction(reservation.transaction),
      });
    }

    const shouldUseProvider =
      credentials.environment === "sandbox" || realCharge;
    const result = shouldUseProvider
      ? await createPayphoneApiLink(
          {
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
            storeId: credentials.storeId,
          },
          reservation.transaction.clientTransactionId,
          {
            token: credentials.token,
            storeId: credentials.storeId,
          }
        )
      : {
          ok: false,
          payment_link: "",
          raw_response: { error: "PAYPHONE_REAL_CHARGES_DISABLED" },
        };

    const fallbackUsed = !result.ok && Boolean(credentials.fallbackUrl);
    const paymentLink = result.ok
      ? result.payment_link
      : credentials.fallbackUrl;
    const completed = await completePartnerTransaction({
      id: reservation.transaction.id,
      clientId,
      status: paymentLink ? "pending" : "error",
      paymentLink,
      fallbackUsed,
      providerResponse: result.raw_response,
    });

    if (!paymentLink) {
      return Response.json(
        {
          ok: false,
          code: "PAYPHONE_PROVIDER_UNAVAILABLE",
          error: "PayPhone no respondió y el negocio no tiene fallback.",
          payment: publicPartnerTransaction(completed),
        },
        { status: 502 }
      );
    }

    return Response.json({
      ok: true,
      reused: false,
      provider: "payphone",
      mode: fallbackUsed
        ? "external_link_fallback"
        : "payphone_api_link",
      payment_status: "payment_pending",
      payment: publicPartnerTransaction(completed),
      payment_link: paymentLink,
      client_transaction_id: completed.clientTransactionId,
      store_id_last_four: credentials.storeId.slice(-4),
      real_charge: realCharge,
      whatsapp_message: payphoneLinkWhatsAppMessage(
        body.amount,
        "USD",
        body.reference,
        paymentLink,
        body.language
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
