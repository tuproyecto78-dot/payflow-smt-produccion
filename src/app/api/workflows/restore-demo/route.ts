import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { rateLimit, getClientIP, RATE_LIMIT_ERROR, GENERIC_ERROR } from "@/lib/security";
import { logAudit } from "@/lib/audit";
import { TEMPLATES } from "@/lib/templates";

export const dynamic = "force-dynamic";

const DEMO_TEMPLATE_NAME = "Flujo demo WhatsApp + IA + PayPhone";

/**
 * POST /api/workflows/restore-demo
 *
 * Restores the example "Flujo demo WhatsApp + IA + PayPhone" workflow.
 *
 * Behavior:
 *   - Admin/super_admin only.
 *   - Idempotent: if a workflow with the demo name already exists in the
 *     admin's "Admin Workspace" project, it is UPDATED with the latest
 *     template nodes/edges (so message edits propagate). It is NOT duplicated.
 *   - If the admin project does not exist, it is created.
 *   - Audit log: workflow_demo_restored.
 *
 * Returns:
 *   {
 *     ok: true,
 *     workflowId: string,
 *     action: "created" | "updated",
 *     nodeName: string
 *   }
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== ROLES.ADMIN && session.role !== ROLES.SUPER_ADMIN) {
    return NextResponse.json(
      { error: "Se requiere rol de administrador." },
      { status: 403 }
    );
  }

  const ip = getClientIP(req);
  if (!rateLimit(`restore-demo:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }

  try {
    const tpl = TEMPLATES.find((t) => t.name === DEMO_TEMPLATE_NAME);
    if (!tpl) {
      return NextResponse.json(
        { error: "Plantilla demo no encontrada en el servidor." },
        { status: 500 }
      );
    }

    // Ensure the admin has a project.
    let project = await db.project.findFirst({
      where: { userId: session.userId, name: "Admin Workspace" },
    });
    if (!project) {
      project = await db.project.create({
        data: {
          name: "Admin Workspace",
          description: "Proyecto predeterminado del administrador de PayFlow SMT.",
          userId: session.userId,
        },
      });
    }

    // Check if the demo workflow already exists (idempotent — no duplicates).
    const existing = await db.workflow.findFirst({
      where: { projectId: project.id, name: DEMO_TEMPLATE_NAME },
      select: { id: true },
    });

    let action: "created" | "updated" = "created";
    let workflowId: string;

    if (existing) {
      // Update with the latest template (propagates message edits).
      const updated = await db.workflow.update({
        where: { id: existing.id },
        data: {
          nodesJson: JSON.stringify(tpl.nodes),
          edgesJson: JSON.stringify(tpl.edges),
        },
        select: { id: true },
      });
      workflowId = updated.id;
      action = "updated";
    } else {
      // Create the demo workflow.
      const created = await db.workflow.create({
        data: {
          name: DEMO_TEMPLATE_NAME,
          projectId: project.id,
          nodesJson: JSON.stringify(tpl.nodes),
          edgesJson: JSON.stringify(tpl.edges),
        },
        select: { id: true },
      });
      workflowId = created.id;
      action = "created";
    }

    void logAudit({
      userId: session.userId,
      action: "workflow_demo_restored",
      entityType: "workflow",
      entityId: workflowId,
      ipAddress: ip,
      metadata: {
        workflow_name: DEMO_TEMPLATE_NAME,
        action,
        node_count: tpl.nodes.length,
        edge_count: tpl.edges.length,
        project_id: project.id,
      },
    });

    return NextResponse.json({
      ok: true,
      workflowId,
      action,
      workflowName: DEMO_TEMPLATE_NAME,
      message:
        action === "created"
          ? "Flujo de ejemplo restaurado correctamente."
          : "Flujo de ejemplo actualizado con la última versión.",
    });
  } catch (err) {
    console.error("[/api/workflows/restore-demo] error:", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}
