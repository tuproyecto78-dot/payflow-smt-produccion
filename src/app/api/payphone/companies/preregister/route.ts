import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { submitPreregistration, type PreregistrationInput } from "@/lib/payphone/preregistration";
import { rateLimit, getClientIP, sanitizeText, sanitizeName, isValidEmail, maskDocument, RATE_LIMIT_ERROR, GENERIC_ERROR } from "@/lib/security";
import { logAudit, maskPhone } from "@/lib/audit";
import { ROLES } from "@/lib/roles";

/**
 * POST /api/payphone/companies/preregister
 *
 * Submits a pre-registration to PayPhone.
 * Admin-only. Gated by PAYPHONE_PREREGISTRATION_ENABLED.
 *
 * Body:
 *   ruc: string
 *   tradeName: string
 *   adminEmail: string
 *   adminPhone: string
 *   city: string
 *   category: string
 *   adminFirstName: string
 *   adminLastName: string
 *   adminDocument: string
 *
 * Returns:
 *   {
 *     enabled: boolean,
 *     ok: boolean,
 *     status: "ok" | "error" | "not_enabled" | "not_configured",
 *     error?: string
 *   }
 *
 * SECURITY: Never returns the raw_response. Never returns the full RUC/document/phone.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== ROLES.ADMIN && session.role !== ROLES.SUPER_ADMIN) {
    return NextResponse.json({ error: "Se requiere rol de administrador." }, { status: 403 });
  }

  const ip = getClientIP(req);
  if (!rateLimit(`payphone-preregister:${ip}`, 5, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const input: PreregistrationInput = {
      ruc: sanitizeText(body.ruc || "").slice(0, 13),
      tradeName: sanitizeText(body.tradeName || "").slice(0, 100),
      adminEmail: sanitizeText(body.adminEmail || body.email || "").slice(0, 120),
      adminPhone: sanitizeText(body.adminPhone || body.phone || "").slice(0, 15),
      city: sanitizeText(body.city || "").slice(0, 60),
      category: sanitizeText(body.category || "").slice(0, 60),
      adminFirstName: sanitizeName(body.adminFirstName || body.firstName || "").slice(0, 60),
      adminLastName: sanitizeName(body.adminLastName || body.lastName || "").slice(0, 60),
      adminDocument: sanitizeText(body.adminDocument || body.document || "").slice(0, 13),
    };

    if (!input.ruc || !input.tradeName || !input.adminEmail) {
      return NextResponse.json({ error: "RUC, nombre comercial y email administrador son obligatorios." }, { status: 400 });
    }
    if (!isValidEmail(input.adminEmail)) {
      return NextResponse.json({ error: "Email administrador inválido." }, { status: 400 });
    }

    const result = await submitPreregistration(input);

    // Audit log — all sensitive fields masked
    void logAudit({
      userId: session.userId,
      action: "payphone_preregistration_sent",
      entityType: "company",
      ipAddress: ip,
      metadata: {
        ruc_masked: maskDocument(input.ruc),
        trade_name: input.tradeName,
        admin_email: input.adminEmail,
        admin_phone_masked: maskPhone(input.adminPhone),
        admin_document_masked: maskDocument(input.adminDocument),
        category: input.category,
        city: input.city,
        ok: result.ok,
        status: result.status,
        http_status: result.http_status || null,
      },
    });

    if (result.status === "not_enabled") {
      return NextResponse.json({
        enabled: false,
        ok: false,
        status: "not_enabled",
        message:
          "Pre-registro PayPhone no habilitado. El cliente puede registrarse en PayFlow SMT y el admin puede continuar la configuración manual.",
      });
    }

    return NextResponse.json({
      enabled: true,
      ok: result.ok,
      status: result.status,
      http_status: result.http_status || null,
      error: result.error,
    });
  } catch (err) {
    console.error("[/api/payphone/companies/preregister] error:", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
