import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { rateLimit, getClientIP, RATE_LIMIT_ERROR, GENERIC_ERROR } from "@/lib/security";

/**
 * GET /api/admin/subscriptions/[id]/history
 *
 * Returns the audit log history for a single subscription request.
 * Admin-only.
 *
 * Returns:
 *   {
 *     subscription: { id, fullName, email, status, ... },
 *     history: AuditLog[]
 *   }
 *
 * SECURITY: No secrets are returned. Metadata may contain masked fields.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== ROLES.ADMIN && session.role !== ROLES.SUPER_ADMIN) {
    return NextResponse.json({ error: "Se requiere rol de administrador." }, { status: 403 });
  }

  const ip = getClientIP(req);
  if (!rateLimit(`admin-history:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }

  try {
    const { id } = await params;
    const sub = await db.subscriptionRequest.findUnique({ where: { id } });
    if (!sub) {
      return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });
    }

    // Audit logs for this subscription request (entityId = sub.id).
    // Also include logs for the activated client (if any).
    const where: { OR: Array<Record<string, unknown>> } = {
      OR: [
        { entityType: "subscription_request", entityId: sub.id },
      ],
    };
    if (sub.activatedClientId) {
      where.OR.push({ clientId: sub.activatedClientId });
      where.OR.push({ entityType: "client", entityId: sub.activatedClientId });
    }

    const history = await db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({
      subscription: {
        id: sub.id,
        fullName: sub.fullName,
        email: sub.email,
        businessName: sub.businessName,
        subscriptionStatus: sub.subscriptionStatus,
        payphoneBusinessStatus: sub.payphoneBusinessStatus,
        payphonePreregistrationStatus: sub.payphonePreregistrationStatus,
        activatedClientId: sub.activatedClientId,
        createdAt: sub.createdAt,
      },
      history: history.map((h) => ({
        id: h.id,
        action: h.action,
        entityType: h.entityType,
        entityId: h.entityId,
        clientId: h.clientId,
        ipAddress: h.ipAddress,
        metadata: (() => {
          try {
            return JSON.parse(h.metadata);
          } catch {
            return {};
          }
        })(),
        createdAt: h.createdAt,
      })),
    });
  } catch (err) {
    console.error("[/api/admin/subscriptions/[id]/history] error:", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
