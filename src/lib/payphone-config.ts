/**
 * PayFlow SMT — PayPhone configuration helper (legacy compatibility shim).
 *
 * This module is kept for backward compatibility with code that imports
 * from `@/lib/payphone-config`. The canonical source of truth is now
 * `@/lib/payphone/config.ts`.
 *
 * The legacy interface is preserved, but it now reads the new env vars:
 *   - PAYPHONE_TOKEN         (was: PAYPHONE_PRODUCTION_TOKEN / PAYPHONE_SANDBOX_TOKEN)
 *   - PAYPHONE_STORE_ID      (was: PAYPHONE_PRODUCTION_STORE_ID / PAYPHONE_SANDBOX_STORE_ID)
 *   - PAYPHONE_ENV           → "production" | "sandbox" | "disabled"
 *
 * Server-only. NEVER import this from a Client Component.
 */

import "server-only";
import {
  getPayphoneConfig,
  isDevOrPreview,
  type PayPhoneEnv,
} from "./payphone/config";

export type { PayPhoneEnv };

export interface PayPhoneConfig {
  configured: boolean;
  env: PayPhoneEnv;
  token: string | null;
  storeId: string | null;
  apiLinkEnabled: boolean;
  apiSaleEnabled: boolean;
  userCheckEnabled: boolean;
  webhookEnabled: boolean;
  missingVars: string[];
  error: "sandbox_inactive" | "production_not_configured" | "no_env" | "disabled" | null;
  mockMode: boolean;
  /** True when PayPhone is explicitly disabled — app should never call PayPhone. */
  disabled: boolean;
}

export { isDevOrPreview };

/**
 * Get the PayPhone configuration (legacy interface).
 * Reads the new PAYPHONE_TOKEN / PAYPHONE_STORE_ID env vars.
 */
export function getPayPhoneConfig(): PayPhoneConfig {
  const cfg = getPayphoneConfig();

  // Map canonical env → legacy error code
  let error: PayPhoneConfig["error"] = null;
  if (cfg.env === "disabled") {
    error = "disabled";
  } else if (!cfg.tokenConfigured || !cfg.storeIdConfigured) {
    if (cfg.env === "sandbox") error = "sandbox_inactive";
    else if (cfg.env === "production") error = "production_not_configured";
    else error = "no_env";
  }

  return {
    configured: cfg.configured,
    env: cfg.env,
    token: cfg.token,
    storeId: cfg.storeId,
    apiLinkEnabled: cfg.configured && cfg.mode === "link",
    apiSaleEnabled: false, // PayFlow SMT does not use API Sale
    userCheckEnabled: cfg.configured,
    webhookEnabled: cfg.configured && cfg.externalNotificationEnabled,
    missingVars: cfg.missingVars,
    error,
    mockMode: !cfg.configured && isDevOrPreview(),
    disabled: cfg.env === "disabled",
  };
}

export function getPayPhoneStatusMessage(config: PayPhoneConfig): string {
  if (config.disabled) {
    return "PayPhone está desactivado en este entorno. Configura credenciales reales en Vercel para probar pagos.";
  }
  if (config.configured) {
    return config.env === "production"
      ? "PayPhone está configurado en modo Producción."
      : "PayPhone está configurado en modo Sandbox.";
  }
  if (config.mockMode) {
    return "PayPhone no está disponible en este entorno. Puedes continuar usando el simulador.";
  }
  if (config.error === "sandbox_inactive") {
    return "Sandbox no configurado o inactivo.";
  }
  if (config.error === "production_not_configured") {
    return "Producción no configurada.";
  }
  return "PayPhone no está configurado.";
}
