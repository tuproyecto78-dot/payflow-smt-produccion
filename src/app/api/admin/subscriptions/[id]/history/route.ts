import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, getClientIP, RATE_LIMIT_ERROR, GENERIC_ERROR } from "@/lib/security";
import { requireAdmin } from "@/lib/auth/require-session";
import { createServiceRoleClient, isSupabaseConfigured } from "@/lib/supabase";

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
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Se requiere rol de administrador." }, { status: 403 });

  const ip = getClientIP(req);
  if (!rateLimit(`admin-history:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }

  try {
    const { id } = await params;

    if (isSupabaseConfigured) {
      const supabase = createServiceRoleClient();
      const { data: sub, error: subError } = await supabase
        .from("subscription_requests")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (subError) throw subError;
      if (!sub) return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });

      const entityIds = [String(sub.id), sub.activated_client_id ? String(sub.activated_client_id) : null]
        .filter((value): value is string => Boolean(value));
      const { data: history, error: historyError } = await supabase
        .from("audit_logs")
        .select("id, user_id, action, entity_type, entity_id, ip_address, metadata, created_at")
        .in("entity_id", entityIds)
        .order("created_at", { ascending: false })
        .limit(200);
      if (historyError) throw historyError;

      return NextResponse.json({
        subscription: {
          id: String(sub.id),
          fullName: String(sub.full_name || ""),
          email: String(sub.email || ""),
          businessName: String(sub.business_name || ""),
          subscriptionStatus: String(sub.subscription_status || "pending_review"),
          payphoneBusinessStatus: String(sub.payphone_business_status || "not_configured"),
          payphonePreregistrationStatus: String(sub.payphone_preregistration_status || "not_requested"),
          activatedClientId: sub.activated_client_id ? String(sub.activated_client_id) : null,
          createdAt: String(sub.created_at || ""),
        },
        history: (history || []).map((entry) => ({
          id: String(entry.id),
          action: String(entry.action),
          entityType: entry.entity_type ? String(entry.entity_type) : null,
          entityId: entry.entity_id ? String(entry.entity_id) : null,
          clientId: (entry.metadata as Record<string, unknown> | null)?.client_id
            ? String((entry.metadata as Record<string, unknown>).client_id)
            : null,
          ipAddress: entry.ip_address ? String(entry.ip_address) : null,
          metadata: entry.metadata || {},
          createdAt: String(entry.created_at),
        })),
      });
    }

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
