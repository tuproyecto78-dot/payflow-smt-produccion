/**
 * PayFlow SMT — Canonical PayPhone configuration module.
 *
 * Legacy global PayPhone configuration compatibility layer.
 *
 * Server-only. NEVER import this from a Client Component.
 *
 * Global merchant credentials are deliberately unsupported. Active payment
 * paths resolve encrypted third-party credentials by client_id through
 * merchant-credentials.ts.
 */

import "server-only";

export type PayPhoneEnv = "production" | "sandbox" | "disabled" | "not_configured";
export type PayPhoneMode = "link" | "sale";

export interface PayPhoneRuntimeConfig {
  /** True when both PAYPHONE_TOKEN and PAYPHONE_STORE_ID are present and env is not disabled. */
  configured: boolean;
  /** Current environment. */
  env: PayPhoneEnv;
  /** Integration mode. We only support "link" (API Link). */
  mode: PayPhoneMode;
  /** True when PAYPHONE_TOKEN is set (does not expose the value). */
  tokenConfigured: boolean;
  /** True when PAYPHONE_STORE_ID is set (does not expose the value). */
  storeIdConfigured: boolean;
  /** Last 4 characters of the Store ID, for safe display. */
  storeIdLastFour: string | null;
  /** Full Store ID value — ONLY for backend use, NEVER send to frontend. */
  storeId: string | null;
  /** Full token value — ONLY for backend use, NEVER send to frontend. */
  token: string | null;
  /** True when PAYPHONE_EXTERNAL_NOTIFICATION_ENABLED is "true". */
  externalNotificationEnabled: boolean;
  /** True when PAYPHONE_PREREGISTRATION_ENABLED is "true". */
  preregistrationEnabled: boolean;
  /** List of missing environment variables (for admin diagnostics). */
  missingVars: string[];
}

/**
 * Returns true if running in dev/preview (used to decide whether to allow
 * mock mode when PayPhone is not configured).
 */
export function isDevOrPreview(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  if (process.env.PAYFLOW_PREVIEW_MODE === "true") return true;
  if (process.env.VERCEL_ENV === "preview") return true;
  return false;
}

/**
 * Get the canonical PayPhone configuration from environment variables.
 * NEVER throws — always returns a valid object.
 */
export function getPayphoneConfig(): PayPhoneRuntimeConfig {
  const externalNotificationEnabled =
    (process.env.PAYPHONE_EXTERNAL_NOTIFICATION_ENABLED || "").toLowerCase() === "true";
  const preregistrationEnabled =
    (process.env.PAYPHONE_PREREGISTRATION_ENABLED || "").toLowerCase() === "true";

  return {
    configured: false,
    env: "not_configured",
    mode: "link",
    tokenConfigured: false,
    storeIdConfigured: false,
    storeIdLastFour: null,
    storeId: null,
    token: null,
    externalNotificationEnabled,
    preregistrationEnabled,
    missingVars: ["PAYPHONE_CREDENTIALS_MASTER_KEY"],
  };
}

/**
 * Validate that PayPhone is ready to generate API Links.
 * Returns { ok, error? }.
 */
export function validatePayphoneConfig(): { ok: boolean; error?: string } {
  const cfg = getPayphoneConfig();
  if (cfg.env === "disabled") {
    return {
      ok: false,
      error: "PayPhone está desactivado en este entorno (PAYPHONE_ENV=disabled).",
    };
  }
  if (!cfg.tokenConfigured) {
    return {
      ok: false,
      error: "Las credenciales PayPhone se configuran por negocio.",
    };
  }
  if (cfg.mode !== "link") {
    return {
      ok: false,
      error: `Modo PayPhone no soportado: "${cfg.mode}". PayFlow SMT solo usa API Link.`,
    };
  }
  return { ok: true };
}

/**
 * True when PayPhone is fully configured and not disabled.
 */
export function isPayphoneConfigured(): boolean {
  return getPayphoneConfig().configured;
}

/**
 * Mask a Store ID for safe display: "****1234".
 * Never returns the full Store ID.
 */
export function maskStoreId(storeId: string | null): string {
  if (!storeId) return "—";
  if (storeId.length < 4) return "****";
  return "****" + storeId.slice(-4);
}

/**
 * Returns the base URL for PayPhone API calls.
 * Production: https://pay.payphonetodoesposible.com/api
 */
export function getPayphoneBaseUrl(): string {
  return "https://pay.payphonetodoesposible.com/api";
}

/**
 * Safe status object suitable for returning from a public/admin API endpoint.
 * NEVER includes the token or the full Store ID.
 */
export function getSafePayphoneStatus() {
  const cfg = getPayphoneConfig();
  return {
    configured: cfg.configured,
    env: cfg.env,
    mode: cfg.mode,
    tokenConfigured: cfg.tokenConfigured,
    storeIdConfigured: cfg.storeIdConfigured,
    storeIdLastFour: cfg.storeIdLastFour,
    storeIdMasked: maskStoreId(cfg.storeId),
    apiLinkEnabled: cfg.configured && cfg.mode === "link",
    apiSaleEnabled: false,
    externalNotificationEnabled: cfg.externalNotificationEnabled,
    preregistrationEnabled: cfg.preregistrationEnabled,
    missingVars: cfg.missingVars,
  };
}
