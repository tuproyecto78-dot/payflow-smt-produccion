/**
 * PayFlow SMT — PayPhone legacy link helper (compatibility shim).
 *
 * Re-exports the canonical implementations from `@/lib/payphone/api-link`
 * and `@/lib/payphone/config`. Existing code that imports from
 * `@/lib/payphone-link` keeps working without changes.
 *
 * Server-only. NEVER import this from a Client Component.
 */

import "server-only";
import {
  createPayphoneApiLink,
  generateClientTransactionId,
  payphoneLinkWhatsAppMessage,
  mapPayphoneWebhookStatus,
  type PayphoneLinkRequestInput,
  type PayphoneLinkResult,
} from "./payphone/api-link";
import { getPayphoneConfig, getPayphoneBaseUrl } from "./payphone/config";

// Re-export types and functions used by existing routes.
export {
  generateClientTransactionId,
  payphoneLinkWhatsAppMessage,
  mapPayphoneWebhookStatus,
  type PayphoneLinkRequestInput,
  type PayphoneLinkResult,
};

// Legacy types (kept for backward compatibility).
export type PayPhoneEnv = "sandbox" | "production" | "disabled" | "not_configured";
export type PayPhoneIntegrationType = "API_LINK" | "API_SALE";
export type PayPhoneCredentialMode = "GLOBAL_ADMIN_ACCOUNT";

export interface PayPhoneConfig {
  env: PayPhoneEnv;
  token: string;
  storeId: string;
  apiLinkEnabled: boolean;
  apiSaleEnabled: boolean;
  userCheckEnabled: boolean;
  webhookEnabled: boolean;
  configured: boolean;
  missingVars: string[];
}

export interface PayPhoneLinkRequest {
  amount: number; // in dollars
  currency: string; // "USD"
  reference: string;
  clientTransactionId: string;
  storeId: string;
  amountWithoutTax?: number;
  amountWithTax?: number;
  tax?: number;
  service?: number;
  tip?: number;
  oneTime?: boolean;
  isAmountEditable?: boolean;
  expireIn?: number; // hours
  language?: "es" | "en";
}

export interface PayPhoneLinkResult {
  ok: boolean;
  payment_link: string;
  client_transaction_id: string;
  store_id: string;
  raw_response: Record<string, unknown>;
  error?: string;
}

// Map canonical config → legacy interface.
export function getPayPhoneConfig(): PayPhoneConfig {
  const cfg = getPayphoneConfig();
  return {
    env: cfg.env as PayPhoneEnv,
    token: cfg.token || "",
    storeId: cfg.storeId || "",
    apiLinkEnabled: cfg.configured && cfg.mode === "link",
    apiSaleEnabled: false,
    userCheckEnabled: cfg.configured,
    webhookEnabled: cfg.configured && cfg.externalNotificationEnabled,
    configured: cfg.configured,
    missingVars: cfg.missingVars,
  };
}

export function validateAmountBreakdown(req: PayPhoneLinkRequest): {
  ok: boolean;
  error?: string;
  breakdown: Required<
    Pick<PayPhoneLinkRequest, "amountWithoutTax" | "amountWithTax" | "tax" | "service" | "tip">
  >;
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

// Create a PayPhone payment link via the API Link endpoint (POST /api/Links).
// Backend-only. NEVER call from the frontend.
export async function createPayPhoneLink(
  req: PayPhoneLinkRequest
): Promise<PayPhoneLinkResult> {
  const result = await createPayphoneApiLink(
    {
      amount: req.amount,
      currency: req.currency,
      reference: req.reference,
      amountWithoutTax: req.amountWithoutTax,
      amountWithTax: req.amountWithTax,
      tax: req.tax,
      service: req.service,
      tip: req.tip,
      oneTime: req.oneTime,
      isAmountEditable: req.isAmountEditable,
      expireIn: req.expireIn,
      language: req.language,
      storeId: req.storeId,
    },
    req.clientTransactionId
  );

  return {
    ok: result.ok,
    payment_link: result.payment_link,
    client_transaction_id: result.client_transaction_id,
    store_id: result.store_id,
    raw_response: result.raw_response,
    error: result.error,
  };
}

// Normalize Ecuador phone numbers (kept for backward compatibility).
export function normalizeEcuadorPhone(phone: string): string {
  if (!phone) return "";
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("593")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

// Check if a phone number is registered in PayPhone (optional, informational only).
// Backend-only. Never blocks payment.
export async function checkPayPhoneUser(
  phoneNumber: string,
  countryCode: string = "593"
): Promise<{
  registered: boolean;
  status: "not_checked" | "registered" | "not_registered" | "check_error";
  httpStatus?: number;
  raw?: unknown;
}> {
  const cfg = getPayphoneConfig();
  if (!cfg.configured) {
    return { registered: false, status: "not_checked" };
  }
  const normalized = normalizeEcuadorPhone(phoneNumber);
  if (!normalized || normalized.length < 8) {
    return { registered: false, status: "not_checked" };
  }

  try {
    const res = await fetch(
      `${getPayphoneBaseUrl()}/Links/Users/check/${countryCode}${normalized}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${cfg.token}` },
        cache: "no-store",
      }
    );
    if (res.ok) return { registered: true, status: "registered", httpStatus: res.status };
    if (res.status === 404) return { registered: false, status: "not_registered", httpStatus: res.status };
    return { registered: false, status: "check_error", httpStatus: res.status, raw: { httpStatus: res.status } };
  } catch (err) {
    return {
      registered: false,
      status: "check_error",
      raw: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

export function payphoneUserCheckMessage(
  status: "registered" | "not_registered" | "check_error" | "not_checked"
): string {
  switch (status) {
    case "registered":
      return "✅ Tu número está registrado en PayPhone. Ahora generaré tu link seguro de pago PayPhone.";
    case "not_registered":
      return "No encontramos este número registrado en PayPhone, pero puedes continuar pagando con tarjeta desde el link seguro PayPhone.";
    case "check_error":
    case "not_checked":
    default:
      return "Continuaremos generando tu link seguro de pago PayPhone.";
  }
}

// Test credentials by making a simple API call.
// Backend-only. Returns a sanitized result (no tokens).
export async function testPayPhoneCredentials(): Promise<{
  ok: boolean;
  env: PayPhoneEnv;
  storeId: string;
  message: string;
}> {
  const cfg = getPayphoneConfig();
  if (!cfg.configured) {
    return {
      ok: false,
      env: cfg.env as PayPhoneEnv,
      storeId: "",
      message: `Credenciales no configuradas. Faltan: ${cfg.missingVars.join(", ")}`,
    };
  }
  try {
    const res = await fetch(`${getPayphoneBaseUrl()}/Links?limit=1`, {
      method: "GET",
      headers: { Authorization: `Bearer ${cfg.token}` },
      cache: "no-store",
    });
    if (res.ok) {
      return {
        ok: true,
        env: cfg.env as PayPhoneEnv,
        storeId: cfg.storeIdLastFour || "",
        message: `Conexión exitosa (${cfg.env}). StoreID: ****${cfg.storeIdLastFour}.`,
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        env: cfg.env as PayPhoneEnv,
        storeId: cfg.storeIdLastFour || "",
        message: `Token inválido o sin permisos (${res.status}).`,
      };
    }
    return {
      ok: true,
      env: cfg.env as PayPhoneEnv,
      storeId: cfg.storeIdLastFour || "",
      message: `Token válido (${res.status}). StoreID: ****${cfg.storeIdLastFour}.`,
    };
  } catch (err) {
    return {
      ok: false,
      env: cfg.env as PayPhoneEnv,
      storeId: cfg.storeIdLastFour || "",
      message: `Error de red: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
