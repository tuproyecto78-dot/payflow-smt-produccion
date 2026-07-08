import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { rateLimit, getClientIP, RATE_LIMIT_ERROR, GENERIC_ERROR } from "@/lib/security";
import { logAudit } from "@/lib/audit";
import { getPayphoneConfig, maskStoreId } from "@/lib/payphone/config";

/**
 * GET /api/admin/clients/[id]/payphone
 *
 * Returns the PayPhone configuration status for a specific client.
 * Includes both the server-wide config (masked) and the client-specific
 * PaymentAccount row.
 *
 * Admin-only. NEVER returns the token.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== ROLES.ADMIN && session.role !== ROLES.SUPER_ADMIN) {
    return NextResponse.json({ error: "Se requiere rol de administrador." }, { status: 403 });
  }

  const ip = getClientIP(req);
  if (!rateLimit(`admin-client-payphone:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }

  try {
    const { id } = await params;
    const client = await db.clientAccount.findUnique({
      where: { id },
      include: { paymentAccounts: true },
    });
    if (!client) {
      return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
    }

    const cfg = getPayphoneConfig();
    const pa = client.paymentAccounts.find((p) => p.provider === "payphone") || null;

    return NextResponse.json({
      client: {
        id: client.id,
        businessName: client.businessName,
        status: client.status,
      },
      // Server-wide config (masked, safe for display)
      server: {
        configured: cfg.configured,
        env: cfg.env,
        mode: cfg.mode,
        tokenConfigured: cfg.tokenConfigured,
        storeIdConfigured: cfg.storeIdConfigured,
        storeIdLastFour: cfg.storeIdLastFour,
        storeIdMasked: maskStoreId(cfg.storeId),
        externalNotificationEnabled: cfg.externalNotificationEnabled,
        preregistrationEnabled: cfg.preregistrationEnabled,
      },
      // Client-specific payment account
      paymentAccount: pa
        ? {
            id: pa.id,
            payphoneBusinessStatus: pa.payphoneBusinessStatus,
            payphonePreregistrationStatus: pa.payphonePreregistrationStatus,
            tokenConfigured: pa.tokenConfigured,
            storeIdConfigured: pa.storeIdConfigured,
            storeIdLastFour: pa.storeIdLastFour,
            externalNotificationStatus: pa.externalNotificationStatus,
            testLinkStatus: pa.testLinkStatus,
            updatedAt: pa.updatedAt,
          }
        : null,
    });
  } catch (err) {
    console.error("[/api/admin/clients/[id]/payphone] error:", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/clients/[id]/payphone
 *
 * Updates client-specific PayPhone status fields.
 * Body: { payphoneBusinessStatus?, testLinkStatus?, markActive? }
 *
 * Admin-only.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== ROLES.ADMIN && session.role !== ROLES.SUPER_ADMIN) {
    return NextResponse.json({ error: "Se requiere rol de administrador." }, { status: 403 });
  }

  const ip = getClientIP(req);
  if (!rateLimit(`admin-client-payphone-update:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const client = await db.clientAccount.findUnique({
      where: { id },
      include: { paymentAccounts: true },
    });
    if (!client) {
      return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
    }

    // Find or create the payphone PaymentAccount.
    let pa = client.paymentAccounts.find((p) => p.provider === "payphone") || null;
    if (!pa) {
      pa = await db.paymentAccount.create({
        data: {
          clientId: client.id,
          provider: "payphone",
          providerMode: "link",
          payphoneBusinessStatus: "not_configured",
          payphonePreregistrationStatus: "not_requested",
          tokenConfigured: false,
          storeIdConfigured: false,
          externalNotificationStatus: "not_active",
          testLinkStatus: "pending",
        },
      });
    }

    const updates: Record<string, unknown> = {};
    if (typeof body.payphoneBusinessStatus === "string") {
      updates.payphoneBusinessStatus = body.payphoneBusinessStatus;
    }
    if (typeof body.testLinkStatus === "string") {
      updates.testLinkStatus = body.testLinkStatus;
    }
    if (body.markActive === true) {
      updates.payphoneBusinessStatus = "active";
    }
    // Sync with current server config
    const cfg = getPayphoneConfig();
    updates.tokenConfigured = cfg.tokenConfigured;
    updates.storeIdConfigured = cfg.storeIdConfigured;
    updates.storeIdLastFour = cfg.storeIdLastFour;
    updates.externalNotificationStatus = cfg.externalNotificationEnabled ? "active" : "not_active";

    if (Object.keys(updates).length > 0) {
      await db.paymentAccount.update({ where: { id: pa.id }, data: updates });
    }

    void logAudit({
      userId: session.userId,
      clientId: client.id,
      action: "payphone_config_checked",
      entityType: "payment_account",
      entityId: pa.id,
      ipAddress: ip,
      metadata: {
        client_id: client.id,
        updates,
        store_id_masked: maskStoreId(cfg.storeId),
      },
    });

    return NextResponse.json({ ok: true, paymentAccountId: pa.id });
  } catch (err) {
    console.error("[/api/admin/clients/[id]/payphone PATCH] error:", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
