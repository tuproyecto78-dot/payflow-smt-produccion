import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { rateLimit, getClientIP, RATE_LIMIT_ERROR, GENERIC_ERROR } from "@/lib/security";
import { logAudit } from "@/lib/audit";
import { getPayphoneConfig, maskStoreId } from "@/lib/payphone/config";

/**
 * POST /api/admin/subscriptions/[id]/activate
 *
 * Activates a subscription request:
 *   1. Creates a ClientAccount with the request data.
 *   2. Creates a PaymentAccount linked to the client (provider=payphone, link mode).
 *   3. Updates the SubscriptionRequest status to "activated" and links the client.
 *   4. Writes audit logs for "client_activated" and "subscription_request_reviewed".
 *
 * Admin-only.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== ROLES.ADMIN && session.role !== ROLES.SUPER_ADMIN) {
    return NextResponse.json({ error: "Se requiere rol de administrador." }, { status: 403 });
  }

  const ip = getClientIP(req);
  if (!rateLimit(`admin-activate:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }

  try {
    const { id } = await params;
    const sub = await db.subscriptionRequest.findUnique({ where: { id } });
    if (!sub) {
      return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });
    }
    if (sub.subscriptionStatus === "activated" && sub.activatedClientId) {
      return NextResponse.json({ error: "Esta solicitud ya está activada.", clientId: sub.activatedClientId }, { status: 400 });
    }

    // Read the current PayPhone config (server-only) to seed the PaymentAccount.
    const cfg = getPayphoneConfig();

    // Create the ClientAccount.
    const client = await db.clientAccount.create({
      data: {
        subscriptionRequestId: sub.id,
        businessName: sub.businessName || sub.fullName,
        businessType: sub.businessType,
        ownerEmail: sub.email,
        ownerPhone: `${sub.countryCode}${sub.phoneNumber}`,
        ownerDocument: sub.documentId,
        country: sub.country,
        city: sub.city,
        status: "active",
        paymentProvider: sub.paymentProvider || "payphone",
      },
    });

    // Create the PaymentAccount.
    const paymentAccount = await db.paymentAccount.create({
      data: {
        clientId: client.id,
        provider: "payphone",
        providerMode: "link",
        payphoneBusinessStatus: sub.payphoneBusinessStatus || "not_configured",
        payphonePreregistrationStatus: sub.payphonePreregistrationStatus || "not_requested",
        tokenConfigured: cfg.tokenConfigured,
        storeIdConfigured: cfg.storeIdConfigured,
        storeIdLastFour: cfg.storeIdLastFour,
        externalNotificationStatus: cfg.externalNotificationEnabled ? "active" : "not_active",
        testLinkStatus: "pending",
      },
    });

    // Update the subscription request.
    await db.subscriptionRequest.update({
      where: { id: sub.id },
      data: {
        subscriptionStatus: "activated",
        activatedClientId: client.id,
      },
    });

    void logAudit({
      userId: session.userId,
      clientId: client.id,
      action: "subscription_request_reviewed",
      entityType: "subscription_request",
      entityId: sub.id,
      ipAddress: ip,
      metadata: {
        previous_status: "pending_review",
        new_status: "activated",
        client_id: client.id,
      },
    });
    void logAudit({
      userId: session.userId,
      clientId: client.id,
      action: "client_activated",
      entityType: "client",
      entityId: client.id,
      ipAddress: ip,
      metadata: {
        business_name: client.businessName,
        owner_email: client.ownerEmail,
        payment_provider: client.paymentProvider,
        payment_account_id: paymentAccount.id,
        payphone_business_status: paymentAccount.payphoneBusinessStatus,
        payphone_token_configured: paymentAccount.tokenConfigured,
        payphone_store_id_masked: maskStoreId(cfg.storeId),
      },
    });

    return NextResponse.json({
      ok: true,
      clientId: client.id,
      paymentAccountId: paymentAccount.id,
      message: "Cliente activado correctamente. PayPhone quedará enlazado a las credenciales del servidor.",
    });
  } catch (err) {
    console.error("[/api/admin/subscriptions/[id]/activate] error:", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
