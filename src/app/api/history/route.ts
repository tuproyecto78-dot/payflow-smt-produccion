import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import { isInternalAccessRole } from "@/lib/auth/access-profile";
import { createServiceRoleClient } from "@/lib/supabase";
import { getAuditClientId } from "@/lib/audit-metadata";

export async function GET(request: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const requestedClientId = url.searchParams.get("clientId")?.trim() || "";
  const clientId = isInternalAccessRole(session.role) ? requestedClientId : session.clientId || "";

  try {
    const supabase = createServiceRoleClient();
    const columns = "id,user_id,action,entity_type,entity_id,metadata,created_at";
    let entries: Array<Record<string, unknown>> = [];

    if (clientId) {
      const [metadataResult, entityResult] = await Promise.all([
        supabase
          .from("audit_logs")
          .select(columns)
          .contains("metadata", { client_id: clientId })
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("audit_logs")
          .select(columns)
          .eq("entity_type", "client_account")
          .eq("entity_id", clientId)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      if (metadataResult.error) throw metadataResult.error;
      if (entityResult.error) throw entityResult.error;
      const byId = new Map(
        [...(metadataResult.data || []), ...(entityResult.data || [])]
          .map((entry) => [String(entry.id), entry] as const)
      );
      entries = [...byId.values()]
        .sort((left, right) =>
          String(right.created_at || "").localeCompare(String(left.created_at || ""))
        )
        .slice(0, 500);
    } else {
      let query = supabase
        .from("audit_logs")
        .select(columns)
        .order("created_at", { ascending: false })
        .limit(500);
      if (!isInternalAccessRole(session.role)) {
        query = query.eq("user_id", session.userId);
      }
      const result = await query;
      if (result.error) throw result.error;
      entries = result.data || [];
    }

    return NextResponse.json({
      entries: entries.map((entry) => ({
        id: String(entry.id),
        userId: entry.user_id ? String(entry.user_id) : null,
        clientId: getAuditClientId(entry),
        action: String(entry.action || ""),
        entityType: entry.entity_type ? String(entry.entity_type) : null,
        entityId: entry.entity_id ? String(entry.entity_id) : null,
        metadata: entry.metadata && typeof entry.metadata === "object" ? entry.metadata : {},
        createdAt: String(entry.created_at || ""),
      })),
    });
  } catch (error) {
    console.error("[/api/history]", error);
    return NextResponse.json({ error: "No se pudo cargar el historial persistente." }, { status: 503 });
  }
}

export const dynamic = "force-dynamic";
