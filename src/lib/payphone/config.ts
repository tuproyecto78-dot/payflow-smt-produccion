/**
 * PayFlow SMT — Canonical PayPhone configuration module.
 *
 * Single source of truth for PayPhone credentials and feature flags.
 *
 * Server-only. NEVER import this from a Client Component.
 *
 * Environment variables (configured in Vercel):
 *   - PAYPHONE_ENV                              → "production" | "sandbox" | "disabled"
 *   - PAYPHONE_MODE                             → "link" | "sale"  (we only support "link")
 *   - PAYPHONE_TOKEN                            → Bearer token (server only)
 *   - PAYPHONE_STORE_ID                         → Store ID (server only)
 *   - PAYPHONE_EXTERNAL_NOTIFICATION_ENABLED    → "true" | "false"
 *   - PAYPHONE_PREREGISTRATION_ENABLED          → "true" | "false"
 *
 * SECURITY RULES:
 *   1. PAYPHONE_TOKEN is NEVER exposed to the frontend.
 *   2. PAYPHONE_STORE_ID is NEVER exposed in full — only the last 4 digits.
 *   3. No NEXT_PUBLIC_PAYPHONE_* variables are used.
 *   4. The token is never printed to logs.
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
  const rawEnv = (process.env.PAYPHONE_ENV || "").toLowerCase().trim();
  const rawMode = (process.env.PAYPHONE_MODE || "link").toLowerCase().trim();
  const token = process.env.PAYPHONE_TOKEN?.trim() || null;
  const storeId = process.env.PAYPHONE_STORE_ID?.trim() || null;
  const externalNotificationEnabled =
    (process.env.PAYPHONE_EXTERNAL_NOTIFICATION_ENABLED || "").toLowerCase() === "true";
  const preregistrationEnabled =
    (process.env.PAYPHONE_PREREGISTRATION_ENABLED || "").toLowerCase() === "true";

  // Resolve environment
  let env: PayPhoneEnv;
  if (rawEnv === "disabled") {
    env = "disabled";
  } else if (rawEnv === "production" || rawEnv === "sandbox") {
    env = rawEnv;
  } else if (!rawEnv) {
    env = "not_configured";
  } else {
    env = "not_configured";
  }

  const mode: PayPhoneMode = rawMode === "sale" ? "sale" : "link";

  const tokenConfigured = !!token;
  const storeIdConfigured = !!storeId;
  const storeIdLastFour = storeId && storeId.length >= 4 ? storeId.slice(-4) : storeId ? storeId : null;

  const missingVars: string[] = [];
  if (env === "disabled") {
    // Disabled — no validation required
  } else {
    if (!token) missingVars.push("PAYPHONE_TOKEN");
    if (!storeId) missingVars.push("PAYPHONE_STORE_ID");
    if (env === "not_configured") missingVars.push("PAYPHONE_ENV");
  }

  const configured =
    env !== "disabled" &&
    env !== "not_configured" &&
    tokenConfigured &&
    storeIdConfigured;

  return {
    configured,
    env,
    mode,
    tokenConfigured,
    storeIdConfigured,
    storeIdLastFour,
    storeId,
    token,
    externalNotificationEnabled,
    preregistrationEnabled,
    missingVars,
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
      error: "Falta la variable de servidor PAYPHONE_TOKEN.",
    };
  }
  if (!cfg.storeIdConfigured) {
    return {
      ok: false,
      error: "Falta la variable de servidor PAYPHONE_STORE_ID.",
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
    externalNotificationEnabled: cfg.externalNotificationEnabled,
    preregistrationEnabled: cfg.preregistrationEnabled,
    missingVars: cfg.missingVars,
  };
}
