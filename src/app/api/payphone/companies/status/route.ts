import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { checkCompanyStatus } from "@/lib/payphone/preregistration";
import { rateLimit, getClientIP, sanitizeText, maskDocument, RATE_LIMIT_ERROR, GENERIC_ERROR } from "@/lib/security";
import { logAudit, maskPhone } from "@/lib/audit";
import { ROLES } from "@/lib/roles";

/**
 * GET /api/payphone/companies/status?ruc={ruc}
 *
 * Checks if a company/RUC exists in PayPhone.
 * Admin-only. Gated by PAYPHONE_PREREGISTRATION_ENABLED.
 *
 * Returns:
 *   {
 *     enabled: boolean,        // whether pre-registration is enabled
 *     exists: boolean,
 *     status: "ok" | "error" | "not_enabled" | "not_configured",
 *     error?: string
 *   }
 *
 * SECURITY: Never returns the raw_response. Never returns the full RUC.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== ROLES.ADMIN && session.role !== ROLES.SUPER_ADMIN) {
    return NextResponse.json({ error: "Se requiere rol de administrador." }, { status: 403 });
  }

  const ip = getClientIP(req);
  if (!rateLimit(`payphone-companies-status:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }

  try {
    const url = new URL(req.url);
    const rucRaw = sanitizeText(url.searchParams.get("ruc") || "").slice(0, 13);
    if (!rucRaw) {
      return NextResponse.json({ error: "El parámetro 'ruc' es obligatorio." }, { status: 400 });
    }

    const result = await checkCompanyStatus(rucRaw);

    // Audit log — RUC is masked
    void logAudit({
      userId: session.userId,
      action: "payphone_preregistration_checked",
      entityType: "company",
      ipAddress: ip,
      metadata: {
        ruc_masked: maskDocument(rucRaw),
        exists: result.exists,
        status: result.status,
        http_status: result.http_status || null,
      },
    });

    if (result.status === "not_enabled") {
      return NextResponse.json({
        enabled: false,
        exists: false,
        status: "not_enabled",
        message:
          "Pre-registro PayPhone no habilitado. El cliente puede registrarse en PayFlow SMT y el admin puede continuar la configuración manual.",
      });
    }
    if (result.status === "not_configured") {
      return NextResponse.json({
        enabled: true,
        exists: false,
        status: "not_configured",
        error: result.error,
      });
    }

    return NextResponse.json({
      enabled: true,
      exists: result.exists,
      status: result.status,
      http_status: result.http_status || null,
      error: result.error,
    });
  } catch (err) {
    console.error("[/api/payphone/companies/status] error:", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
