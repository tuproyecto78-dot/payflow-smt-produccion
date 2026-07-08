import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { rateLimit, getClientIP, RATE_LIMIT_ERROR, GENERIC_ERROR } from "@/lib/security";
import { logAudit } from "@/lib/audit";
import { getPayphoneConfig, maskStoreId } from "@/lib/payphone/config";

/**
 * GET /api/admin/clients
 *
 * Returns all ClientAccounts with their PaymentAccount.
 * Admin-only.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== ROLES.ADMIN && session.role !== ROLES.SUPER_ADMIN) {
    return NextResponse.json({ error: "Se requiere rol de administrador." }, { status: 403 });
  }

  const ip = getClientIP(req);
  if (!rateLimit(`admin-clients-list:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }

  try {
    const clients = await db.clientAccount.findMany({
      include: {
        paymentAccounts: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({
      clients: clients.map((c) => ({
        id: c.id,
        businessName: c.businessName,
        businessType: c.businessType,
        ownerEmail: c.ownerEmail,
        ownerPhone: c.ownerPhone,
        ownerDocument: c.ownerDocument,
        country: c.country,
        city: c.city,
        status: c.status,
        paymentProvider: c.paymentProvider,
        createdAt: c.createdAt,
        paymentAccounts: c.paymentAccounts.map((pa) => ({
          id: pa.id,
          provider: pa.provider,
          providerMode: pa.providerMode,
          payphoneBusinessStatus: pa.payphoneBusinessStatus,
          payphonePreregistrationStatus: pa.payphonePreregistrationStatus,
          tokenConfigured: pa.tokenConfigured,
          storeIdConfigured: pa.storeIdConfigured,
          storeIdLastFour: pa.storeIdLastFour,
          externalNotificationStatus: pa.externalNotificationStatus,
          testLinkStatus: pa.testLinkStatus,
          updatedAt: pa.updatedAt,
        })),
      })),
    });
  } catch (err) {
    console.error("[/api/admin/clients] error:", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
