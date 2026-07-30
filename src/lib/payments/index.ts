// Payment Provider Adapter — dispatcher.
//
// createPayment(provider, payload) is the single entry point used by the API
// routes and the workflow engine. It selects the right adapter and returns a
// NormalizedPaymentResult. Provider-specific fields are kept inside raw_response.

import {
  type CreatePaymentInput,
  type NormalizedPaymentResult,
  type PaymentProvider,
  type ProviderConfigStatus,
  isPaymentSupportedByProvider,
} from "./adapters/_shared";
import { mockProvider } from "./adapters/mock";
import { payphoneProvider } from "./adapters/payphone";
import { deunaProvider } from "./adapters/deuna";
import { stripeProvider } from "./adapters/stripe";
import { paypalProvider } from "./adapters/paypal";
import { mercadoPagoProvider } from "./adapters/mercadopago";
import { customApiProvider } from "./adapters/custom";

export async function createPayment(
  input: CreatePaymentInput
): Promise<NormalizedPaymentResult> {
  const orderId = input.orderId || `ord_${Date.now()}`;
  const currency = input.currency || "USD";
  const mode = input.mode || defaultModeForProvider(input.provider);

  // Currency × provider compatibility check.
  // If unsupported, fall back to Mock with a warning (do NOT crash).
  if (!isPaymentSupportedByProvider(currency, input.provider)) {
    const mock = mockProvider(
      { ...input, mode },
      { payment_amount: input.amount, payment_currency: currency, order_id: orderId }
    );
    return {
      ...mock,
      provider: input.provider,
      mode,
      currency_warning: `Moneda ${currency} no soportada por ${input.provider}; cayó a modo simulado.`,
      raw_response: {
        ...mock.raw_response,
        original_provider: input.provider,
        fell_back_to: "Mock",
        currency_warning: true,
      },
    };
  }

  const base = {
    payment_amount: input.amount,
    payment_currency: currency,
    order_id: orderId,
  };

  switch (input.provider) {
    case "Mock":
      return mockProvider({ ...input, mode }, base);
    case "PayPhone":
      return payphoneProvider({ ...input, mode, currency }, base);
    case "DEUNA":
      return deunaProvider({ ...input, mode, currency }, base);
    case "Stripe":
      return stripeProvider({ ...input, mode, currency }, base);
    case "PayPal":
      return paypalProvider({ ...input, mode, currency }, base);
    case "Mercado Pago":
      return mercadoPagoProvider({ ...input, mode, currency }, base);
    case "API personalizada":
      return customApiProvider({ ...input, mode, currency }, base);
    default:
      return mockProvider({ ...input, mode }, base);
  }
}

// Default payment mode per provider.
export function defaultModeForProvider(provider: PaymentProvider): "direct" | "link" | "checkout" {
  switch (provider) {
    case "Mock":
    case "PayPhone":
      return "direct";
    case "DEUNA":
    case "API personalizada":
      return "link";
    case "Stripe":
    case "PayPal":
    case "Mercado Pago":
      return "checkout";
    default:
      return "direct";
  }
}

// Inspect env vars to determine which providers are configured.
// NEVER returns the values — only booleans and missing-var names.
export function getProviderConfigStatus(provider: PaymentProvider): ProviderConfigStatus {
  const REQUIRED: Record<PaymentProvider, string[]> = {
    Mock: [],
    PayPhone: ["PAYPHONE_CREDENTIALS_MASTER_KEY"],
    DEUNA: ["DEUNA_API_KEY", "DEUNA_MERCHANT_ID"],
    Stripe: ["STRIPE_SECRET_KEY"],
    PayPal: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"],
    "Mercado Pago": ["MERCADOPAGO_ACCESS_TOKEN"],
    "API personalizada": [], // configured per-node
  };
  const required = REQUIRED[provider] || [];
  const missingVars = required.filter((v) => !process.env[v]);
  const configured = missingVars.length === 0;

  // Sandbox vs production detection
  let mode: "sandbox" | "production" = "sandbox";
  if (provider === "DEUNA" && process.env.DEUNA_ENV === "production") mode = "production";
  if (provider === "PayPal" && process.env.PAYPAL_ENV === "production") mode = "production";
  if (provider === "Stripe" && process.env.STRIPE_SECRET_KEY?.startsWith("sk_live")) mode = "production";
  if (provider === "Mercado Pago" && process.env.MERCADOPAGO_ACCESS_TOKEN?.startsWith("APP_USR")) mode = "production";
  if (provider === "PayPhone") mode = "sandbox"; // Environment is resolved per business.

  return { provider, configured, mode, missingVars };
}

export function getAllProviderStatuses(): ProviderConfigStatus[] {
  return ([
    "Mock",
    "PayPhone",
    "DEUNA",
    "Stripe",
    "PayPal",
    "Mercado Pago",
    "API personalizada",
  ] as PaymentProvider[]).map(getProviderConfigStatus);
}

// Re-export adapter functions for backward compatibility with old code that
// imported them directly from "@/lib/payments".
export { normalizeStatus } from "./types";
export type {
  PaymentProvider,
  PaymentStatus,
  PaymentMode,
  CreatePaymentInput,
  NormalizedPaymentResult,
  ProviderConfigStatus,
} from "./types";

// Re-export the old CreatePaymentResult type name for backward compat.
// Old code imported { CreatePaymentResult } from "@/lib/payments".
export type CreatePaymentResult = NormalizedPaymentResult;
