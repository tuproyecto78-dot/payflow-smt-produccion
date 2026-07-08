/**
 * PayFlow SMT — PayPhone pre-registration module.
 *
 * Implements the PayPhone pre-registro de comercios endpoints:
 *   - GET  /api/Links/DicomStatus?ruc={ruc}  → check if a company exists
 *   - GET  /api/Categories                   → list business categories
 *   - POST /api/Links/preregistro            → submit pre-registration
 *
 * Server-only. NEVER import from a Client Component.
 *
 * Gated by PAYPHONE_PREREGISTRATION_ENABLED. When false, all functions
 * return a "not_enabled" result without calling PayPhone.
 *
 * Docs: https://docs.payphone.app/preregistro-de-comercios
 */

import "server-only";
import { getPayphoneConfig, getPayphoneBaseUrl } from "./config";

export type PreregistrationStatus = "not_enabled" | "not_configured" | "ok" | "error";

export interface CompanyStatusResult {
  status: PreregistrationStatus;
  exists: boolean;
  http_status?: number;
  raw_response: Record<string, unknown>;
  error?: string;
}

/**
 * Check if a company/RUC exists in PayPhone.
 * Backend-only. Admin-only. Gated by PAYPHONE_PREREGISTRATION_ENABLED.
 */
export async function checkCompanyStatus(ruc: string): Promise<CompanyStatusResult> {
  const cfg = getPayphoneConfig();
  if (!cfg.preregistrationEnabled) {
    return {
      status: "not_enabled",
      exists: false,
      raw_response: {},
      error: "Pre-registro PayPhone no habilitado.",
    };
  }
  if (!cfg.configured) {
    return {
      status: "not_configured",
      exists: false,
      raw_response: {},
      error: `PayPhone no está configurado. Faltan: ${cfg.missingVars.join(", ")}`,
    };
  }

  const cleanRuc = String(ruc || "").replace(/\D/g, "").slice(0, 13);
  if (!cleanRuc) {
    return {
      status: "error",
      exists: false,
      raw_response: {},
      error: "RUC inválido.",
    };
  }

  const url = `${getPayphoneBaseUrl()}/Links/DicomStatus?ruc=${encodeURIComponent(cleanRuc)}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return {
        status: "ok",
        exists: true,
        http_status: res.status,
        raw_response: { httpStatus: res.status, ...data },
      };
    }
    if (res.status === 404) {
      return {
        status: "ok",
        exists: false,
        http_status: res.status,
        raw_response: { httpStatus: res.status, ...data },
      };
    }
    return {
      status: "error",
      exists: false,
      http_status: res.status,
      raw_response: { httpStatus: res.status, ...data },
      error: `PayPhone devolvió HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      status: "error",
      exists: false,
      raw_response: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface CategoryResult {
  status: PreregistrationStatus;
  categories: Array<{ id?: string | number; name?: string }>;
  raw_response: Record<string, unknown>;
  error?: string;
}

/**
 * Load the list of business categories from PayPhone.
 * Backend-only. Admin-only. Gated by PAYPHONE_PREREGISTRATION_ENABLED.
 */
export async function listCategories(): Promise<CategoryResult> {
  const cfg = getPayphoneConfig();
  if (!cfg.preregistrationEnabled) {
    return { status: "not_enabled", categories: [], raw_response: {}, error: "Pre-registro PayPhone no habilitado." };
  }
  if (!cfg.configured) {
    return { status: "not_configured", categories: [], raw_response: {}, error: `PayPhone no está configurado. Faltan: ${cfg.missingVars.join(", ")}` };
  }

  const url = `${getPayphoneBaseUrl()}/Categories`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        status: "error",
        categories: [],
        raw_response: { httpStatus: res.status, ...data },
        error: `PayPhone devolvió HTTP ${res.status}`,
      };
    }
    const arr = Array.isArray(data) ? data : (data as { categories?: unknown[] }).categories || [];
    const categories = (arr as Array<Record<string, unknown>>).map((c) => ({
      id: c.id as string | number | undefined,
      name: (c.name as string) || (c.description as string) || (c.nombre as string),
    }));
    return { status: "ok", categories, raw_response: { httpStatus: res.status, count: categories.length } };
  } catch (err) {
    return {
      status: "error",
      categories: [],
      raw_response: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface PreregistrationInput {
  ruc: string;
  tradeName: string;
  adminEmail: string;
  adminPhone: string;
  city: string;
  category: string;
  adminFirstName: string;
  adminLastName: string;
  adminDocument: string;
}

export interface PreregistrationResult {
  status: PreregistrationStatus;
  ok: boolean;
  http_status?: number;
  raw_response: Record<string, unknown>;
  error?: string;
}

/**
 * Submit a pre-registration to PayPhone.
 * Backend-only. Admin-only. Gated by PAYPHONE_PREREGISTRATION_ENABLED.
 *
 * The raw_response is sanitized — no token is ever included.
 */
export async function submitPreregistration(
  input: PreregistrationInput
): Promise<PreregistrationResult> {
  const cfg = getPayphoneConfig();
  if (!cfg.preregistrationEnabled) {
    return { status: "not_enabled", ok: false, raw_response: {}, error: "Pre-registro PayPhone no habilitado." };
  }
  if (!cfg.configured) {
    return { status: "not_configured", ok: false, raw_response: {}, error: `PayPhone no está configurado. Faltan: ${cfg.missingVars.join(", ")}` };
  }

  const body: Record<string, unknown> = {
    ruc: String(input.ruc || "").replace(/\D/g, "").slice(0, 13),
    tradeName: String(input.tradeName || "").slice(0, 100),
    email: String(input.adminEmail || "").slice(0, 120),
    phone: String(input.adminPhone || "").replace(/\D/g, "").slice(0, 15),
    city: String(input.city || "").slice(0, 60),
    category: String(input.category || "").slice(0, 60),
    firstName: String(input.adminFirstName || "").slice(0, 60),
    lastName: String(input.adminLastName || "").slice(0, 60),
    document: String(input.adminDocument || "").replace(/\D/g, "").slice(0, 13),
    storeId: cfg.storeId,
  };

  const url = `${getPayphoneBaseUrl()}/Links/preregistro`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const providerMsg =
        (data as { message?: string }).message || `PayPhone devolvió HTTP ${res.status}`;
      return {
        status: "error",
        ok: false,
        http_status: res.status,
        raw_response: { httpStatus: res.status, ...data },
        error: providerMsg,
      };
    }
    return {
      status: "ok",
      ok: true,
      http_status: res.status,
      raw_response: { httpStatus: res.status, ...data },
    };
  } catch (err) {
    return {
      status: "error",
      ok: false,
      raw_response: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
