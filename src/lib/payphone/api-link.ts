/**
 * PayFlow SMT — PayPhone API Link integration.
 *
 * Implements the PayPhone API Link endpoint:
 *   POST https://pay.payphonetodoesposible.com/api/Links
 *
 * Server-only. NEVER import from a Client Component.
 * The PAYPHONE_TOKEN is used here as a Bearer token and is NEVER logged
 * or returned to the caller.
 *
 * Docs: https://docs.payphone.app/api-link
 */

import "server-only";
import { getPayphoneConfig, getPayphoneBaseUrl, validatePayphoneConfig } from "./config";

// Re-export validatePayphoneConfig so callers can import it from this module.
export { validatePayphoneConfig };

export interface PayphoneLinkRequestInput {
  /** Amount in DOLLARS (e.g. 25.00). Will be converted to cents. */
  amount: number;
  /** Currency. Only "USD" is supported by PayPhone. */
  currency: string;
  /** Human-readable reference (order id, invoice, etc.). */
  reference: string;
  /** Optional: amount breakdown in dollars. If omitted, the full amount goes to amountWithoutTax. */
  amountWithoutTax?: number;
  amountWithTax?: number;
  tax?: number;
  service?: number;
  tip?: number;
  /** One-time link (default true). */
  oneTime?: boolean;
  /** Allow the customer to edit the amount (default false). */
  isAmountEditable?: boolean;
  /** Expiration in hours. 0 = does not expire. */
  expireIn?: number;
  /** Language: "es" or "en". */
  language?: "es" | "en";
  /** Optional storeId override (defaults to PAYPHONE_STORE_ID from env). */
  storeId?: string;
}

export interface PayphoneLinkResult {
  ok: boolean;
  /** The secure payment link URL returned by PayPhone. */
  payment_link: string;
  /** The unique client transaction id (max 15 chars). */
  client_transaction_id: string;
  /** Store ID used (masked-safe to log). */
  store_id: string;
  /** Sanitized raw response from PayPhone (no token). */
  raw_response: Record<string, unknown>;
  /** HTTP status code from PayPhone. */
  http_status?: number;
  /** Error message (sanitized) when ok=false. */
  error?: string;
}

/**
 * Generate a short, unique clientTransactionId (max 15 chars).
 * Format: "pf" + base36 timestamp (6) + base36 random (5)  → 13 chars total.
 */
export function generateClientTransactionId(): string {
  const ts = Date.now().toString(36).slice(-6).padStart(6, "0");
  const rand = Math.random().toString(36).slice(2, 7).padEnd(5, "0");
  return `pf${ts}${rand}`.slice(0, 15);
}

/**
 * Validate that amount equals the sum of breakdown components.
 * If no breakdown is provided, the full amount goes to amountWithoutTax.
 */
function validateAmountBreakdown(req: PayphoneLinkRequestInput): {
  ok: boolean;
  error?: string;
  breakdown: {
    amountWithoutTax: number;
    amountWithTax: number;
    tax: number;
    service: number;
    tip: number;
  };
} {
  const { amount, amountWithoutTax, amountWithTax, tax, service, tip } = req;

  if (
    amountWithoutTax === undefined &&
    amountWithTax === undefined &&
    tax === undefined &&
    service === undefined &&
    tip === undefined
  ) {
    return {
      ok: true,
      breakdown: {
        amountWithoutTax: Math.round(amount * 100),
        amountWithTax: 0,
        tax: 0,
        service: 0,
        tip: 0,
      },
    };
  }

  const awt = Math.round((amountWithoutTax ?? 0) * 100);
  const awTax = Math.round((amountWithTax ?? 0) * 100);
  const t = Math.round((tax ?? 0) * 100);
  const s = Math.round((service ?? 0) * 100);
  const tp = Math.round((tip ?? 0) * 100);
  const total = Math.round(amount * 100);

  if (awt + awTax + t + s + tp !== total) {
    return {
      ok: false,
      error: `El monto (${total} centavos) no coincide con la suma de los componentes (${awt + awTax + t + s + tp} centavos).`,
      breakdown: { amountWithoutTax: awt, amountWithTax: awTax, tax: t, service: s, tip: tp },
    };
  }

  return {
    ok: true,
    breakdown: { amountWithoutTax: awt, amountWithTax: awTax, tax: t, service: s, tip: tp },
  };
}

/**
 * Create a PayPhone payment link via the API Link endpoint.
 *
 * Backend-only. NEVER call this from the frontend.
 */
export async function createPayphoneApiLink(
  req: PayphoneLinkRequestInput,
  clientTransactionId: string
): Promise<PayphoneLinkResult> {
  const validation = validatePayphoneConfig();
  if (!validation.ok) {
    return {
      ok: false,
      payment_link: "",
      client_transaction_id: clientTransactionId,
      store_id: req.storeId || "",
      raw_response: { error: validation.error },
      error: validation.error,
    };
  }

  const cfg = getPayphoneConfig();
  const storeId = (req.storeId || cfg.storeId || "").toString();

  if (!storeId) {
    return {
      ok: false,
      payment_link: "",
      client_transaction_id: clientTransactionId,
      store_id: "",
      raw_response: { error: "Store ID no configurado." },
      error: "Store ID no configurado.",
    };
  }

  // Validate amount breakdown
  const breakdown = validateAmountBreakdown(req);
  if (!breakdown.ok) {
    return {
      ok: false,
      payment_link: "",
      client_transaction_id: clientTransactionId,
      store_id: storeId,
      raw_response: { error: breakdown.error },
      error: breakdown.error,
    };
  }

  // Build the API Link request body.
  // PayPhone API Link expects amounts in CENTS.
  const body: Record<string, unknown> = {
    amount: Math.round(req.amount * 100),
    amountWithoutTax: breakdown.breakdown.amountWithoutTax,
    amountWithTax: breakdown.breakdown.amountWithTax,
    tax: breakdown.breakdown.tax,
    service: breakdown.breakdown.service,
    tip: breakdown.breakdown.tip,
    currency: (req.currency || "USD").toUpperCase(),
    clientTransactionId,
    storeId,
    reference: String(req.reference || "").slice(0, 100),
    oneTime: req.oneTime ?? true,
    isAmountEditable: req.isAmountEditable ?? false,
    expireIn: req.expireIn ?? 0,
    language: req.language === "en" ? "en" : "es",
  };

  const url = `${getPayphoneBaseUrl()}/Links`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const providerMsg =
        (data as { message?: string; Message?: string }).message ||
        (data as { Message?: string }).Message ||
        `PayPhone devolvió HTTP ${res.status}`;
      return {
        ok: false,
        payment_link: "",
        client_transaction_id: clientTransactionId,
        store_id: storeId,
        http_status: res.status,
        raw_response: { httpStatus: res.status, ...data },
        error: providerMsg,
      };
    }

    // PayPhone returns the link in one of these fields depending on API version.
    const link = String(
      (data as { paymentLink?: string }).paymentLink ||
        (data as { link?: string }).link ||
        (data as { paymentUrl?: string }).paymentUrl ||
        (data as { url?: string }).url ||
        (data as { payment_link?: string }).payment_link ||
        (data as { hostUrl?: string; path?: string }).hostUrl +
          (data as { path?: string }).path ||
        ""
    );

    return {
      ok: true,
      payment_link: link,
      client_transaction_id: clientTransactionId,
      store_id: storeId,
      http_status: res.status,
      raw_response: { httpStatus: res.status, ...data },
    };
  } catch (err) {
    return {
      ok: false,
      payment_link: "",
      client_transaction_id: clientTransactionId,
      store_id: storeId,
      raw_response: { error: err instanceof Error ? err.message : String(err) },
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * WhatsApp message sent when a PayPhone link is created.
 */
export function payphoneLinkWhatsAppMessage(
  amount: number,
  currency: string,
  reference: string,
  paymentLink: string,
  lang: "es" | "en" = "es"
): string {
  if (lang === "en") {
    return `Te comparto tu link seguro de pago PayPhone. Cuando completes el pago, confirmaremos tu transacción.

Puedes pagar aquí: ${paymentLink}`;
  }
  return `Te comparto tu link seguro de pago PayPhone. Cuando completes el pago, confirmaremos tu transacción.

Puedes pagar aquí: ${paymentLink}`;
}

/**
 * WhatsApp message for payment status updates from PayPhone.
 */
export function payphoneStatusWhatsAppMessage(
  status: "payment_pending" | "payment_success" | "payment_failed",
  lang: "es" | "en" = "es"
): string {
  if (lang === "en") {
    if (status === "payment_success") return "¡Pago confirmado! Gracias, tu transacción fue aprobada correctamente.";
    if (status === "payment_failed") return "Tu pago no pudo ser procesado. Intenta nuevamente con un nuevo link seguro PayPhone.";
    return "Your payment is pending. We will notify you when PayPhone confirms the transaction.";
  }
  if (status === "payment_success") return "¡Pago confirmado! Gracias, tu transacción fue aprobada correctamente.";
  if (status === "payment_failed") return "Tu pago no pudo ser procesado. Intenta nuevamente con un nuevo link seguro PayPhone.";
  return "Tu pago está pendiente. Cuando PayPhone confirme la transacción, te avisaremos.";
}

/**
 * Map PayPhone webhook status fields to normalized payment status.
 * PayPhone Notificación Externa sends:
 *   StatusCode: 1=Pending, 2=Canceled, 3=Approved
 *   TransactionStatus: "Pending" | "Canceled" | "Approved"
 */
export function mapPayphoneWebhookStatus(
  statusCode?: number,
  transactionStatus?: string
): "payment_success" | "payment_failed" | "payment_pending" | "error" {
  if (statusCode === 3) return "payment_success";
  if (statusCode === 2) return "payment_failed";
  if (statusCode === 1) return "payment_pending";

  if (transactionStatus) {
    const ts = transactionStatus.toLowerCase().trim();
    if (ts === "approved") return "payment_success";
    if (ts === "canceled" || ts === "cancelled") return "payment_failed";
    if (ts === "pending") return "payment_pending";
  }

  return "error";
}
