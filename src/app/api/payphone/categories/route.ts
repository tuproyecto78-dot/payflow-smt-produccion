import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listCategories } from "@/lib/payphone/preregistration";
import { rateLimit, getClientIP, RATE_LIMIT_ERROR, GENERIC_ERROR } from "@/lib/security";
import { logAudit } from "@/lib/audit";
import { ROLES } from "@/lib/roles";

/**
 * GET /api/payphone/categories
 *
 * Lists the business categories from PayPhone.
 * Admin-only. Gated by PAYPHONE_PREREGISTRATION_ENABLED.
 *
 * Returns:
 *   {
 *     enabled: boolean,
 *     status: "ok" | "error" | "not_enabled" | "not_configured",
 *     categories: Array<{ id?: string, name?: string }>,
 *     error?: string
 *   }
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== ROLES.ADMIN && session.role !== ROLES.SUPER_ADMIN) {
    return NextResponse.json({ error: "Se requiere rol de administrador." }, { status: 403 });
  }

  const ip = getClientIP(req);
  if (!rateLimit(`payphone-categories:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }

  try {
    const result = await listCategories();

    void logAudit({
      userId: session.userId,
      action: "payphone_categories_listed",
      entityType: "company",
      ipAddress: ip,
      metadata: {
        status: result.status,
        count: result.categories.length,
      },
    });

    if (result.status === "not_enabled") {
      return NextResponse.json({
        enabled: false,
        status: "not_enabled",
        categories: [],
        message:
          "Pre-registro PayPhone no habilitado. El cliente puede registrarse en PayFlow SMT y el admin puede continuar la configuración manual.",
      });
    }

    return NextResponse.json({
      enabled: true,
      status: result.status,
      categories: result.categories,
      error: result.error,
    });
  } catch (err) {
    console.error("[/api/payphone/categories] error:", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
