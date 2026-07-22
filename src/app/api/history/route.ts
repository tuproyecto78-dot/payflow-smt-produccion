import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import { isInternalAccessRole } from "@/lib/auth/access-profile";
import { createServiceRoleClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const requestedClientId = url.searchParams.get("clientId")?.trim() || "";
  const clientId = isInternalAccessRole(session.role) ? requestedClientId : session.clientId || "";

  try {
    const supabase = createServiceRoleClient();
    let query = supabase
      .from("audit_logs")
      .select("id,user_id,client_id,action,entity_type,entity_id,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    if (clientId) query = query.eq("client_id", clientId);
    else if (!isInternalAccessRole(session.role)) query = query.eq("user_id", session.userId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      entries: (data || []).map((entry) => ({
        id: String(entry.id),
        userId: entry.user_id ? String(entry.user_id) : null,
        clientId: entry.client_id ? String(entry.client_id) : null,
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
