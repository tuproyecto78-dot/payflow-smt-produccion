import { NextResponse } from "next/server";
import { requireAdmin, unauthorizedResponse, forbiddenResponse } from "@/lib/auth/require-session";
import { rateLimit, getClientIP, RATE_LIMIT_ERROR, GENERIC_ERROR } from "@/lib/security";
import { logAudit } from "@/lib/audit";
import { TEMPLATES } from "@/lib/templates";
import { supabaseUpsertDemoWorkflow } from "@/lib/supabase-server";
import { demoWorkflow } from "@/lib/workflows/demo-workflow";

export const dynamic = "force-dynamic";

/**
 * POST /api/workflows/restore-demo
 *
 * Restores the "Cobro por WhatsApp con IA" demo workflow.
 *
 * Behavior:
 *   - Admin/super_admin only (401 if no session, 403 if not admin).
 *   - Tries to save to Supabase (workflows table) using service role key.
 *   - If Supabase is not configured or fails, returns demo-fallback so the
 *     UI still shows the demo flow.
 *   - Idempotent: if the workflow already exists, it's updated (not duplicated).
 *   - Audit log: workflow_demo_restored (best-effort).
 *
 * Response (success, saved to Supabase):
 *   { success: true, workflowName: "Cobro por WhatsApp con IA", created: true }
 *
 * Response (success, fallback — no DB):
 *   { success: true, workflowName: "Cobro por WhatsApp con IA", created: false, source: "demo-fallback" }
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    const { getSession } = await import("@/lib/session");
    const session = await getSession();
    if (!session) return unauthorizedResponse();
    return forbiddenResponse();
  }

  const ip = getClientIP(req);
  if (!rateLimit(`restore-demo:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }

  const workflowName = demoWorkflow.name;

  // Try Supabase first (no DATABASE_URL, no Prisma).
  const nodesJson = JSON.stringify(
    TEMPLATES.find((t) => t.name === workflowName)?.nodes || demoWorkflow.nodes
  );
  const edgesJson = JSON.stringify(
    TEMPLATES.find((t) => t.name === workflowName)?.edges || demoWorkflow.edges
  );

  const result = await supabaseUpsertDemoWorkflow(admin.userId, {
    name: workflowName,
    nodesJson,
    edgesJson,
  });

  if (result.ok) {
    // Best-effort audit log.
    void logAudit({
      userId: admin.userId,
      action: "workflow_demo_restored",
      entityType: "workflow",
      entityId: result.id || null,
      ipAddress: ip,
      metadata: {
        workflow_name: workflowName,
        action: result.created ? "created" : "updated",
        source: "supabase",
      },
    });

    return NextResponse.json({
      success: true,
      workflowName,
      created: result.created,
      source: "supabase",
      message: result.created
        ? "Flujo de ejemplo creado en Supabase."
        : "Flujo de ejemplo actualizado en Supabase.",
    });
  }

  // Fallback: return demo-fallback so the UI shows the demo anyway.
  console.warn("[restore-demo] Supabase failed, using demo-fallback:", result.error);

  void logAudit({
    userId: admin.userId,
    action: "workflow_demo_restored",
    entityType: "workflow",
    ipAddress: ip,
    metadata: {
      workflow_name: workflowName,
      action: "demo-fallback",
      source: "demo-fallback",
      reason: result.error || "supabase_unavailable",
    },
  });

  return NextResponse.json({
    success: true,
    workflowName,
    created: false,
    source: "demo-fallback",
    message: "Flujo de ejemplo cargado localmente (modo demo). La base de datos no está disponible.",
  });
}
