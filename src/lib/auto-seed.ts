/**
 * PayFlow SMT — Auto-seed helper.
 *
 * Ensures the admin user always has at least one project and the demo
 * "Flujo demo WhatsApp + IA + PayPhone" workflow. This is critical for
 * Vercel deployments where the SQLite database is ephemeral and resets
 * on each cold start.
 *
 * Idempotent: only creates what's missing. Never deletes or overwrites.
 * Safe to call on every request.
 *
 * Server-only. NEVER import from a Client Component.
 */

import "server-only";
import { db } from "@/lib/db";
import { TEMPLATES } from "@/lib/templates";
import { logAudit } from "@/lib/audit";

const ADMIN_PROJECT_NAME = "Admin Workspace";

/**
 * Ensure the admin user has a project and ALL template workflows.
 * Returns true if something was created, false if everything already existed.
 *
 * Templates seeded:
 *   - "Cobro por WhatsApp con IA" (the classic demo flow)
 *   - "Flujo demo WhatsApp + IA + PayPhone" (the PayPhone API Link demo)
 */
export async function ensureDemoFlowForAdmin(userId: string): Promise<boolean> {
  let createdSomething = false;

  try {
    // 1. Ensure the admin has a project.
    let project = await db.project.findFirst({
      where: { userId, name: ADMIN_PROJECT_NAME },
      select: { id: true },
    });

    if (!project) {
      project = await db.project.create({
        data: {
          name: ADMIN_PROJECT_NAME,
          description: "Proyecto predeterminado del administrador de PayFlow SMT.",
          userId,
        },
        select: { id: true },
      });
      createdSomething = true;
    }

    // 2. Ensure ALL template workflows exist in that project (idempotent).
    for (const tpl of TEMPLATES) {
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
        createdSomething = true;

        // Audit log (best-effort, don't block on failure).
        void logAudit({
          userId,
          action: "workflow_demo_restored",
          entityType: "workflow",
          ipAddress: null,
          metadata: {
            workflow_name: tpl.name,
            action: "auto_seeded",
            node_count: tpl.nodes.length,
            edge_count: tpl.edges.length,
            project_id: project.id,
          },
        });
      }
    }

    return createdSomething;
  } catch (err) {
    // If the DB is not available (e.g., ephemeral Vercel without DATABASE_URL),
    // silently return false. The caller will return an empty list.
    console.error("[auto-seed] Failed:", err);
    return false;
  }
}
