import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import { isInternalAccessRole } from "@/lib/auth/access-profile";
import { createServiceRoleClient } from "@/lib/supabase";
import { sanitizeText } from "@/lib/security";

type Context = { params: Promise<{ id: string }> };

const PROMOTIONS_START = "[PAYFLOW_PROMOTIONS_START]";
const PROMOTIONS_END = "[PAYFLOW_PROMOTIONS_END]";

function updateAgentPromotions(nodesValue: unknown, promotions: string) {
  if (!Array.isArray(nodesValue)) return { nodes: [], changed: false };
  let changed = false;
  const nodes = nodesValue.map((node) => {
    if (!node || typeof node !== "object") return node;
    const item = node as Record<string, unknown>;
    if (item.type !== "ai_agent") return node;

    const data = item.data && typeof item.data === "object"
      ? { ...(item.data as Record<string, unknown>) }
      : {};
    const currentPrompt = String(data.systemPrompt || "");
    const markerExpression = new RegExp(
      `\\s*\\${PROMOTIONS_START}[\\s\\S]*?\\${PROMOTIONS_END}`,
      "g"
    );
    const basePrompt = currentPrompt.replace(markerExpression, "").trim();
    const promotionsBlock = promotions
      ? ` ${PROMOTIONS_START}\nPROMOCIONES VIGENTES DEL NEGOCIO:\n${promotions}\nUsa únicamente estas promociones mientras estén vigentes. No inventes descuentos.\n${PROMOTIONS_END}`
      : "";
    const nextPrompt = `${basePrompt}${promotionsBlock}`.trim();
    if (nextPrompt !== currentPrompt) changed = true;
    data.systemPrompt = nextPrompt;
    data.promotionsUpdatedAt = new Date().toISOString();
    return { ...item, data };
  });
  return { nodes, changed };
}

export async function POST(request: Request, { params }: Context) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!isInternalAccessRole(session.role) && session.clientId !== id) {
    return NextResponse.json({ error: "No autorizado para este negocio." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const promotions = sanitizeText(
    typeof body.promotions === "string" ? body.promotions : ""
  ).slice(0, 12000);

  try {
    const supabase = createServiceRoleClient();
    const { data: client, error: clientError } = await supabase
      .from("client_accounts")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (clientError) throw clientError;
    if (!client) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

    const { data: workflowEvents, error: eventError } = await supabase
      .from("audit_logs")
      .select("action,entity_id,metadata")
      .eq("client_id", id)
      .in("action", ["onboarding_completed", "workflow_created"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (eventError) throw eventError;

    const workflowIds = new Set<string>();
    for (const event of workflowEvents || []) {
      if (event.action === "workflow_created" && event.entity_id) {
        workflowIds.add(String(event.entity_id));
      }
      const metadata = event.metadata && typeof event.metadata === "object"
        ? event.metadata as Record<string, unknown>
        : {};
      if (typeof metadata.workflow_id === "string" && metadata.workflow_id) {
        workflowIds.add(metadata.workflow_id);
      }
    }

    let workflowsUpdated = 0;
    if (workflowIds.size) {
      const { data: workflows, error: workflowsError } = await supabase
        .from("workflows")
        .select("id,nodes")
        .in("id", [...workflowIds]);
      if (workflowsError) throw workflowsError;

      for (const workflow of workflows || []) {
        const result = updateAgentPromotions(workflow.nodes, promotions);
        if (!result.changed) continue;
        const { error: updateError } = await supabase
          .from("workflows")
          .update({ nodes: result.nodes, updated_at: new Date().toISOString() })
          .eq("id", workflow.id);
        if (updateError) throw updateError;
        workflowsUpdated += 1;
      }
    }

    const { error: auditError } = await supabase.from("audit_logs").insert({
      user_id: session.userId,
      client_id: id,
      action: "catalog_promotions_updated",
      entity_type: "client_account",
      entity_id: id,
      metadata: {
        promotions,
        lines: promotions.split(/\r?\n/).filter((line) => line.trim()).length,
        workflows_updated: workflowsUpdated,
      },
    });
    if (auditError) throw auditError;

    return NextResponse.json({ ok: true, promotions, workflowsUpdated });
  } catch (error) {
    console.error("[client promotions POST]", error);
    return NextResponse.json({ error: "No se pudieron guardar las promociones." }, { status: 503 });
  }
}
