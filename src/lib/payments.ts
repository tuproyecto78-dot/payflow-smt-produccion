// Capa de proveedores de pago para PayFlow SMT.
import type { PaymentOutcome } from "./workflow-types";

export type PaymentProvider = "Mock" | "PayPhone" | "DEUNA" | "Stripe" | "API personalizada";
export type PaymentStatus = "payment_success" | "payment_failed" | "payment_pending" | "error";

export interface CreatePaymentInput {
  provider: PaymentProvider; amount: number; currency: string; description: string;
  customer: string; phoneNumber: string; orderId: string; userId: string;
  workflowId?: string; workflowRunId?: string;
  customApiUrl?: string; customApiHeaders?: Record<string, string>;
  forceOutcome?: PaymentStatus;
  payphoneIntegration?: "API Sale" | "API Link";
  countryCode?: string; customerDocument?: string; reference?: string;
}

export interface CreatePaymentResult {
  payment_id: string; provider_payment_id: string | null;
  payment_provider: PaymentProvider; payment_status: PaymentStatus;
  payment_link: string; payment_amount: number; payment_currency: string;
  raw_response: Record<string, unknown>; order_id: string;
  payphone_business_status?: string; payphone_store_id?: string | null;
  payphone_personal_status?: string; customer_phone?: string;
  customer_document?: string; customer_name?: string; country_code?: string;
  whatsapp_message?: string;
}

export function normalizeStatus(raw: unknown): PaymentStatus {
  if (typeof raw !== "string") return "payment_pending";
  const s = raw.toLowerCase();
  if (["payment_success","succeeded","approved","paid","completed","success"].includes(s)) return "payment_success";
  if (["payment_failed","failed","declined","rejected","canceled","cancelled"].includes(s)) return "payment_failed";
  if (s === "error") return "error";
  return "payment_pending";
}

const PAYPHONE_MSG = {
  business_not_configured: "El comercio aún no tiene PayPhone Business configurado.",
  customer_not_registered: "No encontramos este número registrado en PayPhone. Verifica el número o usa otro método de pago.",
  sale_created: "Te enviamos una solicitud de cobro a PayPhone. Confirma el pago desde tu app PayPhone y te avisaremos aquí cuando esté aprobado.",
  success: "✅ Tu pago fue confirmado correctamente. Gracias por tu compra.",
  failed: "❌ El pago fue rechazado o no pudo completarse.",
  pending: "⏳ Tu pago está pendiente de confirmación en PayPhone.",
  error: "⚠️ Ocurrió un error procesando el pago.",
};

export async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  const orderId = input.orderId || `ord_${Date.now()}`;
  const base = { payment_amount: input.amount, payment_currency: input.currency || "USD", order_id: orderId };
  switch (input.provider) {
    case "Mock": return mockProvider(input, base);
    case "PayPhone": return payphoneProvider(input, base);
    case "DEUNA": return deunaProvider(input, base);
    case "Stripe": return stripeProvider(input, base);
    case "API personalizada": return customApiProvider(input, base);
    default: return mockProvider(input, base);
  }
}

function mockProvider(input: CreatePaymentInput, base: any): CreatePaymentResult {
  const forced = input.forceOutcome;
  const outcome: PaymentStatus = forced ? forced : (() => { const r = Math.random(); if (r < 0.65) return "payment_success"; if (r < 0.8) return "payment_failed"; if (r < 0.93) return "payment_pending"; return "error"; })();
  const mockId = `mock_${Date.now()}`;
  const link = outcome === "error" ? "" : `https://pay.payflow.smt/mock/${base.order_id}`;
  return { payment_id: mockId, provider_payment_id: mockId, payment_provider: "Mock", payment_status: outcome, payment_link: link, ...base, raw_response: { provider: "Mock", outcome, simulated: true } };
}

async function payphoneProvider(input: CreatePaymentInput, base: any): Promise<CreatePaymentResult> {
  const token = process.env.PAYPHONE_TOKEN;
  const storeId = process.env.PAYPHONE_STORE_ID;
  const countryCode = input.countryCode || "593";
  if (!token || !storeId) {
    const mock = mockProvider(input, base);
    return { ...mock, payment_provider: "PayPhone", payment_link: "", payphone_business_status: "not_configured", payphone_store_id: null, payphone_personal_status: "skipped", customer_phone: input.phoneNumber, customer_document: input.customerDocument, customer_name: input.customer, country_code: countryCode, whatsapp_message: mock.payment_status === "payment_success" ? PAYPHONE_MSG.success : mock.payment_status === "payment_failed" ? PAYPHONE_MSG.failed : mock.payment_status === "payment_pending" ? PAYPHONE_MSG.pending : PAYPHONE_MSG.error, raw_response: { ...mock.raw_response, provider: "PayPhone", credentials_configured: false, note: "PAYPHONE_TOKEN/PAYPHONE_STORE_ID no configurados." } };
  }
  // API Users Check
  if (input.phoneNumber) {
    try {
      const checkRes = await fetch(`https://pay.payphonelab.com/api/v1/users/check/${countryCode}${input.phoneNumber}`, { method: "GET", headers: { Authorization: `Bearer ${token}` } });
      if (!checkRes.ok) {
        return { payment_id: `pp_nouser_${Date.now()}`, provider_payment_id: null, payment_provider: "PayPhone", payment_status: "payment_failed", payment_link: "", whatsapp_message: PAYPHONE_MSG.customer_not_registered, ...base, payphone_business_status: "configured", payphone_store_id: storeId, payphone_personal_status: "not_registered", customer_phone: input.phoneNumber, customer_document: input.customerDocument, customer_name: input.customer, country_code: countryCode, raw_response: { provider: "PayPhone", step: "users_check", registered: false } };
      }
    } catch { /* continue to sale */ }
  }
  // API Sale
  try {
    const amountCents = Math.round(input.amount * 100);
    const res = await fetch("https://pay.payphonelab.com/api/v1/sale", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ phoneNumber: input.phoneNumber, countryCode, amount: amountCents, amountWithoutTax: amountCents, currency: input.currency, clientTransactionId: base.order_id, storeId, reference: input.reference || input.description }) });
    const data = await res.json().catch(() => ({}));
    const status = normalizeStatus((data as any).status ?? (res.ok ? "payment_pending" : "error"));
    let msg = PAYPHONE_MSG.error;
    if (status === "payment_success") msg = PAYPHONE_MSG.success;
    else if (status === "payment_failed") msg = PAYPHONE_MSG.failed;
    else if (status === "payment_pending") msg = PAYPHONE_MSG.sale_created;
    return { payment_id: String((data as any).paymentId ?? `pp_${Date.now()}`), provider_payment_id: String((data as any).paymentId ?? null), payment_provider: "PayPhone", payment_status: status, payment_link: "", whatsapp_message: msg, ...base, payphone_business_status: "configured", payphone_store_id: storeId, payphone_personal_status: "registered", customer_phone: input.phoneNumber, customer_document: input.customerDocument, customer_name: input.customer, country_code: countryCode, raw_response: { provider: "PayPhone", step: "sale", httpStatus: res.status, ...data } };
  } catch (err) {
    return { payment_id: `pp_err_${Date.now()}`, provider_payment_id: null, payment_provider: "PayPhone", payment_status: "error", payment_link: "", whatsapp_message: PAYPHONE_MSG.error, ...base, payphone_business_status: "configured", payphone_store_id: storeId, payphone_personal_status: "registered", customer_phone: input.phoneNumber, customer_document: input.customerDocument, customer_name: input.customer, country_code: countryCode, raw_response: { provider: "PayPhone", step: "sale", error: err instanceof Error ? err.message : String(err) } };
  }
}

async function deunaProvider(input: CreatePaymentInput, base: any): Promise<CreatePaymentResult> {
  const apiKey = process.env.DEUNA_API_KEY;
  const merchantId = process.env.DEUNA_MERCHANT_ID;
  if (!apiKey || !merchantId) { const mock = mockProvider(input, base); return { ...mock, payment_provider: "DEUNA", payment_link: mock.payment_status === "error" ? "" : `https://pay.payflow.smt/deuna/${base.order_id}`, raw_response: { ...mock.raw_response, provider: "DEUNA", credentials_configured: false } }; }
  try {
    const res = await fetch("https://api.deuna.io/v1/payment-links", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Merchant-Id": merchantId }, body: JSON.stringify({ amount: input.amount, currency: input.currency, reference: base.order_id, description: input.description }) });
    const data = await res.json().catch(() => ({}));
    const status = normalizeStatus((data as any).status ?? (res.ok ? "payment_pending" : "error"));
    return { payment_id: String((data as any).id ?? `deuna_${Date.now()}`), provider_payment_id: String((data as any).id ?? null), payment_provider: "DEUNA", payment_status: status, payment_link: String((data as any).paymentLink ?? ""), ...base, raw_response: { provider: "DEUNA", httpStatus: res.status, ...data } };
  } catch (err) {
    return { payment_id: `deuna_err_${Date.now()}`, provider_payment_id: null, payment_provider: "DEUNA", payment_status: "error", payment_link: "", ...base, raw_response: { provider: "DEUNA", error: err instanceof Error ? err.message : String(err) } };
  }
}

async function stripeProvider(input: CreatePaymentInput, base: any): Promise<CreatePaymentResult> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) { const mock = mockProvider(input, base); return { ...mock, payment_provider: "Stripe", payment_link: mock.payment_status === "error" ? "" : `https://pay.payflow.smt/stripe/${base.order_id}`, raw_response: { ...mock.raw_response, provider: "Stripe", credentials_configured: false } }; }
  try {
    const res = await fetch("https://api.stripe.com/v1/payment_intents", { method: "POST", headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ amount: String(Math.round(input.amount * 100)), currency: (input.currency || "USD").toLowerCase(), description: input.description }).toString() });
    const data = await res.json().catch(() => ({}));
    const status = normalizeStatus((data as any).status ?? (res.ok ? "payment_pending" : "error"));
    return { payment_id: String((data as any).id ?? `stripe_${Date.now()}`), provider_payment_id: String((data as any).id ?? null), payment_provider: "Stripe", payment_status: status, payment_link: String((data as any).next_action?.redirect_to_url?.url ?? ""), ...base, raw_response: { provider: "Stripe", httpStatus: res.status, ...data } };
  } catch (err) {
    return { payment_id: `stripe_err_${Date.now()}`, provider_payment_id: null, payment_provider: "Stripe", payment_status: "error", payment_link: "", ...base, raw_response: { provider: "Stripe", error: err instanceof Error ? err.message : String(err) } };
  }
}

async function customApiProvider(input: CreatePaymentInput, base: any): Promise<CreatePaymentResult> {
  const url = input.customApiUrl;
  if (!url) { return { payment_id: `api_err_${Date.now()}`, provider_payment_id: null, payment_provider: "API personalizada", payment_status: "error", payment_link: "", ...base, raw_response: { provider: "API personalizada", error: "No se configuró customApiUrl" } }; }
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(input.customApiHeaders || {}) }, body: JSON.stringify({ amount: input.amount, currency: input.currency, description: input.description, customer: input.customer, phoneNumber: input.phoneNumber, orderId: base.order_id }) });
    const data = await res.json().catch(() => ({}));
    const status = normalizeStatus((data as any).status ?? (data as any).payment_status ?? (res.ok ? "payment_pending" : "error"));
    return { payment_id: String((data as any).payment_id ?? (data as any).id ?? `api_${Date.now()}`), provider_payment_id: String((data as any).provider_payment_id ?? (data as any).id ?? null), payment_provider: "API personalizada", payment_status: status, payment_link: String((data as any).payment_link ?? (data as any).link ?? ""), ...base, raw_response: { provider: "API personalizada", httpStatus: res.status, ...data } };
  } catch (err) {
    return { payment_id: `api_err_${Date.now()}`, provider_payment_id: null, payment_provider: "API personalizada", payment_status: "error", payment_link: "", ...base, raw_response: { provider: "API personalizada", error: err instanceof Error ? err.message : String(err) } };
  }
}
