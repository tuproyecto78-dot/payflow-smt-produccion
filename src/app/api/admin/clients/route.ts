import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { rateLimit, getClientIP, RATE_LIMIT_ERROR } from "@/lib/security";
import { getPayphoneConfig, maskStoreId } from "@/lib/payphone/config";

/**
 * Fictitious demo client used when the database is not available.
 * This prevents the /dashboard/clientes page from showing an error.
 */
const DEMO_CLIENTS = [
  {
    id: "demo-client-1",
    businessName: "Negocio Demo PayFlow",
    businessType: "comercio",
    ownerEmail: "demo@payflow.smt",
    ownerPhone: "+593987654321",
    ownerDocument: "1712345678",
    country: "Ecuador",
    city: "Guayaquil",
    status: "active",
    paymentProvider: "payphone",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    paymentAccounts: [
      {
        id: "demo-pa-1",
        provider: "payphone",
        providerMode: "link",
        payphoneBusinessStatus: "configured",
        payphonePreregistrationStatus: "not_requested",
        tokenConfigured: true,
        storeIdConfigured: true,
        storeIdLastFour: "1234",
        externalNotificationStatus: "active",
        testLinkStatus: "generated",
        updatedAt: new Date(),
      },
    ],
  },
];

/**
 * GET /api/admin/clients
 *
 * Returns all ClientAccounts with their PaymentAccount.
 * Admin-only.
 *
 * When the database is not available (Vercel without DATABASE_URL),
 * returns demo clients so the UI doesn't show an error.
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
    // DB not available (Vercel without DATABASE_URL) — return demo clients.
    console.warn("[/api/admin/clients] DB error, returning demo clients:", err instanceof Error ? err.message : String(err));

    // Read current PayPhone config for the demo client's payment account.
    const cfg = getPayphoneConfig();

    const demoClients = DEMO_CLIENTS.map((c) => ({
      ...c,
      paymentAccounts: c.paymentAccounts.map((pa) => ({
        ...pa,
        tokenConfigured: cfg.tokenConfigured,
        storeIdConfigured: cfg.storeIdConfigured,
        storeIdLastFour: cfg.storeIdLastFour,
        externalNotificationStatus: cfg.externalNotificationEnabled ? "active" : "not_active",
      })),
    }));

    return NextResponse.json({ clients: demoClients });
  }
}

export const dynamic = "force-dynamic";
