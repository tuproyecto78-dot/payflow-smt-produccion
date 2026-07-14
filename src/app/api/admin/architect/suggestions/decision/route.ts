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
      .select("id, approval_status, proposed_actions")
      .single();
    if (error) throw error;

    let execution = { status: "not_executed", message: "El plan quedó registrado sin realizar cambios." };
    if (decision === "approved") {
      const proposed = data.proposed_actions as { execution_action?: string; change_scope?: string } | unknown[] | null;
      const action = proposed && !Array.isArray(proposed) ? proposed.execution_action : "none";
      const changeScope = proposed && !Array.isArray(proposed) ? proposed.change_scope : "configuration";

      if (action === "retry_clickup_events") {
        const { data: events, error: executeError } = await supabase
          .from("clickup_events")
          .update({ processing_status: "pending_analysis", processed_at: null, error_message: null })
          .eq("processing_status", "failed")
          .select("id");
        if (executeError) throw executeError;
        execution = { status: "executed", message: `${events?.length || 0} eventos fallidos fueron enviados nuevamente a análisis.` };
      } else if (action === "queue_clickup_analysis") {
        const { data: events, error: executeError } = await supabase
          .from("clickup_events")
          .update({ processing_status: "pending_analysis" })
          .eq("processing_status", "detected")
          .select("id");
        if (executeError) throw executeError;
        execution = { status: "executed", message: `${events?.length || 0} eventos detectados fueron enviados a análisis.` };
      } else {
        execution = {
          status: "approval_recorded",
          message: `Autorización registrada para el cambio de ${changeScope || "configuración"}. El plan quedó listo para implementación segura; todavía no se modificó código ni configuración.`,
        };
      }

      if (execution.status === "executed") {
        await supabase
          .from("architecture_suggestions")
          .update({ approval_status: "executed" })
          .eq("id", suggestionId);
        data.approval_status = "executed";
      }
    }

    await supabase.from("audit_logs").insert({
      entity_type: "architecture_suggestion",
      entity_id: suggestionId,
      action: decision === "approved" ? "suggestion_approved" : "suggestion_rejected",
      metadata: { actor_user_id: admin.userId, source: "architect_chat", execution },
    });

    return NextResponse.json({ ok: true, suggestion: data, execution });
  } catch (error) {
    console.error("[architect/suggestions/decision]", error);
    return NextResponse.json({ error: "No se pudo registrar la decisión." }, { status: 500 });
  }
}
