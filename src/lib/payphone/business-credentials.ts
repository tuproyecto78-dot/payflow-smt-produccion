/**
 * PayFlow SMT — Per-business payment credentials resolver.
 *
 * Resolves which payment route a business uses and returns the appropriate
 * credentials WITHOUT exposing secrets to the frontend.
 *
 * Three routes per business (stored in PaymentAccount):
 *   1. "manual_link"    → negocio pega su propio link de pago externo.
 *   2. "payphone_token" → usa token+storeId de PayPhone guardados por negocio.
 *   3. "global"         → usa PAYPHONE_TOKEN + PAYPHONE_STORE_ID del env (default).
 *
 * Server-only. NEVER import from a Client Component.
 */
import "server-only";
import { db } from "@/lib/db";
import { getPayphoneConfig, maskStoreId, type PayPhoneRuntimeConfig } from "./config";

export type PaymentRoute = "global" | "manual_link" | "payphone_token";

export interface ResolvedPaymentCredentials {
  route: PaymentRoute;
  /** True when the route has everything needed to attempt a payment. */
  ready: boolean;
  /** Human-readable reason when not ready. */
  notReadyReason?: string;
  /** Ruta 1: manual external link (Stripe, PayPal, etc.) — the full URL. */
  manualPaymentLink: string | null;
  /** Ruta 2: PayPhone token per business (server-only, NEVER exposed). */
  payphoneToken: string | null;
  payphoneStoreId: string | null;
  storeIdLastFour: string | null;
  /** Ruta 3: global env credentials (masked, for display only). */
  globalConfig: PayPhoneRuntimeConfig;
}

/**
 * Get or create a PaymentAccount for a client (lazy create).
 */
export async function ensurePaymentAccount(
  clientId: string
): Promise<{ id: string; paymentRoute: PaymentRoute; manualPaymentLink: string | null; payphoneToken: string | null; payphoneStoreId: string | null }> {
  const existing = await db.paymentAccount.findFirst({
    where: { clientId },
  });
  if (existing) {
    return {
      id: existing.id,
      paymentRoute: (existing.paymentRoute as PaymentRoute) || "global",
      manualPaymentLink: existing.manualPaymentLink,
      payphoneToken: existing.payphoneToken,
      payphoneStoreId: existing.payphoneStoreId,
    };
  }
  const created = await db.paymentAccount.create({
    data: { clientId, paymentRoute: "global" },
  });
  return {
    id: created.id,
    paymentRoute: "global",
    manualPaymentLink: null,
    payphoneToken: null,
    payphoneStoreId: null,
  };
}

/**
 * Resolve the payment credentials for a business.
 * Returns the route + secrets (server-only).
 */
export async function resolvePaymentCredentials(
  clientId: string | null | undefined
): Promise<ResolvedPaymentCredentials> {
  const globalConfig = getPayphoneConfig();

  if (!clientId) {
    // No client → only global route is available.
    return {
      route: "global",
      ready: globalConfig.configured,
      notReadyReason: globalConfig.configured ? undefined : "PayPhone global no configurado.",
      manualPaymentLink: null,
      payphoneToken: null,
      payphoneStoreId: null,
      storeIdLastFour: globalConfig.storeIdLastFour,
      globalConfig,
    };
  }

  const account = await ensurePaymentAccount(clientId);

  // Ruta 1: manual external link
  if (account.paymentRoute === "manual_link") {
    const link = account.manualPaymentLink?.trim() || null;
    return {
      route: "manual_link",
      ready: !!link,
      notReadyReason: link ? undefined : "El negocio no ha cargado un link de pago manual.",
      manualPaymentLink: link,
      payphoneToken: null,
      payphoneStoreId: null,
      storeIdLastFour: null,
      globalConfig,
    };
  }

  // Ruta 2: PayPhone token per business
  if (account.paymentRoute === "payphone_token") {
    const token = account.payphoneToken?.trim() || null;
    const storeId = account.payphoneStoreId?.trim() || null;
    const ready = !!(token && storeId);
    return {
      route: "payphone_token",
      ready,
      notReadyReason: ready
        ? undefined
        : "Falta token o storeId de PayPhone para este negocio.",
      manualPaymentLink: null,
      payphoneToken: token,
      payphoneStoreId: storeId,
      storeIdLastFour: storeId ? maskStoreId(storeId) : null,
      globalConfig,
    };
  }

  // Ruta 3: global env (default, retrocompatible)
  return {
    route: "global",
    ready: globalConfig.configured,
    notReadyReason: globalConfig.configured ? undefined : "PayPhone global no configurado.",
    manualPaymentLink: null,
    payphoneToken: null,
    payphoneStoreId: null,
    storeIdLastFour: globalConfig.storeIdLastFour,
    globalConfig,
  };
}

/**
 * Safe status object for the frontend (NO tokens, NO full storeId).
 */
export function safeCredentialsStatus(creds: ResolvedPaymentCredentials) {
  return {
    route: creds.route,
    ready: creds.ready,
    notReadyReason: creds.notReadyReason || null,
    hasManualLink: !!creds.manualPaymentLink,
    manualLinkHost: creds.manualPaymentLink ? safeHost(creds.manualPaymentLink) : null,
    payphoneTokenConfigured: !!creds.payphoneToken,
    payphoneStoreIdConfigured: !!creds.payphoneStoreId,
    storeIdLastFour: creds.storeIdLastFour,
    globalConfigured: creds.globalConfig.configured,
  };
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
