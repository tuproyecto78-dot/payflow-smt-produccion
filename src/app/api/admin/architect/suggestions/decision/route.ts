import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/clickup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const suggestionId = String(body.suggestionId || "").trim();
    const decision = String(body.decision || "").trim();
    if (!suggestionId || !["approved", "rejected"].includes(decision)) {
      return NextResponse.json({ error: "Decisión inválida." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const update = decision === "approved"
      ? { approval_status: "approved", approved_at: new Date().toISOString() }
      : { approval_status: "rejected", approved_at: null };
    const { data, error } = await supabase
      .from("architecture_suggestions")
      .update(update)
      .eq("id", suggestionId)
      .select("id, approval_status")
      .single();
    if (error) throw error;

    await supabase.from("audit_logs").insert({
      entity_type: "architecture_suggestion",
      entity_id: suggestionId,
      action: decision === "approved" ? "suggestion_approved" : "suggestion_rejected",
      metadata: { actor_user_id: admin.userId, source: "architect_chat" },
    });

    return NextResponse.json({ ok: true, suggestion: data });
  } catch (error) {
    console.error("[architect/suggestions/decision]", error);
    return NextResponse.json({ error: "No se pudo registrar la decisión." }, { status: 500 });
  }
}
