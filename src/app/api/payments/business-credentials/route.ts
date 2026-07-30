/**
 * GET/PUT /api/payments/business-credentials
 *
 * Per-business payment route configuration.
 *   - GET: returns the current route + sanitized status (NO tokens).
 *   - PUT: admin sets the route + credentials for a business.
 *
 * Routes:
 *   "manual_link"    → { manualPaymentLink: "https://..." }
 *   "payphone_token" → { payphoneToken: "...", payphoneStoreId: "..." }
 *   "global"         → uses PAYPHONE_TOKEN + PAYPHONE_STORE_ID from env
 *
 * Server-only. NEVER returns the token value.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth/require-session";
import { isInternalAccessRole } from "@/lib/auth/access-profile";
import {
  resolvePaymentCredentials,
  safeCredentialsStatus,
  ensurePaymentAccount,
  type PaymentRoute,
} from "@/lib/payphone/business-credentials";
import { maskStoreId } from "@/lib/payphone/config";
import { rateLimit, getClientIP, RATE_LIMIT_ERROR } from "@/lib/security";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** GET — returns the current route + sanitized status (no secrets). */
export async function GET(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = isInternalAccessRole(session.role)
    ? searchParams.get("clientId") || session.clientId || null
    : session.clientId || null;

  if (!clientId) {
    return NextResponse.json({ error: "Se requiere clientId." }, { status: 400 });
  }

  const creds = await resolvePaymentCredentials(clientId);
  return NextResponse.json({
    clientId,
    ...safeCredentialsStatus(creds),
  });
}

/** PUT — admin sets the route + credentials for a business. */
export async function PUT(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isInternalAccessRole(session.role)) {
    return NextResponse.json({ error: "Solo administradores pueden cambiar las credenciales." }, { status: 403 });
  }

  const ip = getClientIP(req);
  if (!rateLimit(`payments:business-creds:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const clientId = String(body.clientId || "").trim();
    const route = String(body.route || "global") as PaymentRoute;

    if (!clientId) {
      return NextResponse.json({ error: "Se requiere clientId." }, { status: 400 });
    }
    if (!["global", "manual_link", "payphone_token"].includes(route)) {
      return NextResponse.json({ error: "Ruta inválida. Debe ser: global, manual_link o payphone_token." }, { status: 400 });
    }

    const account = await ensurePaymentAccount(clientId);

    const updateData: Record<string, unknown> = {
      paymentRoute: route,
      // Clear all per-business secrets when switching routes.
      manualPaymentLink: null,
      payphoneToken: null,
      payphoneStoreId: null,
      tokenConfigured: false,
      storeIdConfigured: false,
      storeIdLastFour: null,
    };

    if (route === "manual_link") {
      const link = String(body.manualPaymentLink || "").trim();
      if (!link || !/^https?:\/\//i.test(link)) {
        return NextResponse.json({ error: "manualPaymentLink debe ser una URL válida (http/https)." }, { status: 400 });
      }
      updateData.manualPaymentLink = link;
    } else if (route === "payphone_token") {
      const token = String(body.payphoneToken || "").trim();
      const storeId = String(body.payphoneStoreId || "").trim();
      if (!token || !storeId) {
        return NextResponse.json({ error: "payphoneToken y payphoneStoreId son obligatorios para la ruta payphone_token." }, { status: 400 });
      }
      updateData.payphoneToken = token;
      updateData.payphoneStoreId = storeId;
      updateData.tokenConfigured = true;
      updateData.storeIdConfigured = true;
      updateData.storeIdLastFour = maskStoreId(storeId);
    }

    await db.paymentAccount.update({ where: { id: account.id }, data: updateData });

    void logAudit({
      userId: session.userId,
      clientId,
      action: "business_payment_route_changed",
      entityType: "payment_account",
      entityId: account.id,
      ipAddress: ip,
      metadata: {
        route,
        has_manual_link: route === "manual_link",
        has_payphone_token: route === "payphone_token",
        store_id_last_four: route === "payphone_token" ? maskStoreId(String(body.payphoneStoreId || "")) : null,
      },
    });

    // Return sanitized status (NO token value).
    const creds = await resolvePaymentCredentials(clientId);
    return NextResponse.json({
      ok: true,
      clientId,
      ...safeCredentialsStatus(creds),
    });
  } catch (err) {
    console.error("[payments/business-credentials] PUT error:", err);
    return NextResponse.json({ error: "Error al guardar credenciales." }, { status: 500 });
  }
}
