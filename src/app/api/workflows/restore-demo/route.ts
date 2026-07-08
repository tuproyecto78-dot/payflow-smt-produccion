import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, unauthorizedResponse, forbiddenResponse } from "@/lib/auth/require-session";
import { rateLimit, getClientIP, RATE_LIMIT_ERROR, GENERIC_ERROR } from "@/lib/security";
import { logAudit } from "@/lib/audit";
import { TEMPLATES } from "@/lib/templates";

export const dynamic = "force-dynamic";

const ADMIN_PROJECT_NAME = "Admin Workspace";

/**
 * POST /api/workflows/restore-demo
 *
 * Restores ALL demo workflows for the authenticated admin.
 * Currently restores:
 *   - "Cobro por WhatsApp con IA" (classic demo, Mock provider)
 *   - "Flujo demo WhatsApp + IA + PayPhone" (PayPhone API Link demo)
 *
 * Behavior:
 *   - Admin/super_admin only (401 if no session, 403 if not admin).
 *   - Idempotent: if a workflow with the same name already exists, it is
 *     UPDATED with the latest template. It is NOT duplicated.
 *   - If the admin project does not exist, it is created.
 *   - Audit log: workflow_demo_restored.
 *
 * Returns:
 *   {
 *     success: true,
 *     restored: [{ workflowName, action: "created" | "updated" }],
 *   }
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    // Check if there's a session at all to return the right status code.
    const session = await import("@/lib/session").then((m) => m.getSession());
    if (!session) return unauthorizedResponse();
    return forbiddenResponse();
  }

  const ip = getClientIP(req);
  if (!rateLimit(`restore-demo:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }

  try {
    const results: Array<{ workflowName: string; action: "created" | "updated" }> = [];

    // 1. Ensure the admin has a project.
    let project;
    try {
      project = await db.project.findFirst({
        where: { userId: admin.userId, name: ADMIN_PROJECT_NAME },
        select: { id: true },
      });

      if (!project) {
        project = await db.project.create({
          data: {
            name: ADMIN_PROJECT_NAME,
            description: "Proyecto predeterminado del administrador de PayFlow SMT.",
            userId: admin.userId,
          },
          select: { id: true },
        });
      }
    } catch (err) {
      console.error("[restore-demo] DB project lookup/create failed:", err);
      return NextResponse.json(
        { error: "No se pudo acceder a la base de datos. Si estás en Vercel, verifica que DATABASE_URL esté configurada." },
        { status: 503 }
      );
    }

    // 2. Restore ALL templates (idempotent).
    for (const tpl of TEMPLATES) {
      try {
        const existing = await db.workflow.findFirst({
          where: { projectId: project.id, name: tpl.name },
          select: { id: true },
        });

        if (!existing) {
          await db.workflow.create({
            data: {
              name: tpl.name,
              projectId: project.id,
              nodesJson: JSON.stringify(tpl.nodes),
              edgesJson: JSON.stringify(tpl.edges),
            },
          });
          results.push({ workflowName: tpl.name, action: "created" });
        } else {
          // Update with the latest template (propagates message edits).
          await db.workflow.update({
            where: { id: existing.id },
            data: {
              nodesJson: JSON.stringify(tpl.nodes),
              edgesJson: JSON.stringify(tpl.edges),
            },
          });
          results.push({ workflowName: tpl.name, action: "updated" });
        }

        // Audit log (best-effort).
        void logAudit({
          userId: admin.userId,
          action: "workflow_demo_restored",
          entityType: "workflow",
          ipAddress: ip,
          metadata: {
            workflow_name: tpl.name,
            action: results[results.length - 1].action,
            node_count: tpl.nodes.length,
            edge_count: tpl.edges.length,
          },
        });
      } catch (err) {
        console.error(`[restore-demo] Failed to restore "${tpl.name}":`, err);
        // Continue with the next template.
      }
    }

    if (results.length === 0) {
      return NextResponse.json(
        { error: "No se pudo restaurar ningún flujo. Revisa los logs del servidor." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      restored: results,
      message: `Se restauraron ${results.length} flujo(s) de ejemplo.`,
    });
  } catch (err) {
    console.error("[/api/workflows/restore-demo] error:", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}
