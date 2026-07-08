import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ensureDemoFlowForAdmin } from "@/lib/auto-seed";
import { ROLES } from "@/lib/roles";
import { getDemoFlowItem } from "@/lib/workflows/demo-workflow";

export const dynamic = "force-dynamic";

/**
 * GET /api/workflows
 *
 * Returns all workflows owned by the current user (across all their projects).
 * Each workflow includes: id, name, projectId, projectName, nodeCount,
 * updatedAt, and a derived provider/channel/status for display.
 *
 * For admin users with 0 workflows, includes the demo flow as fallback
 * so the dashboard never shows an empty state.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workflows: Array<{
    id: string;
    name: string;
    projectId: string;
    projectName: string;
    nodeCount: number;
    status: string;
    provider: string | null;
    channel: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  try {
    // Auto-seed: for admin users, ensure they have the demo flow.
    const isAdmin =
      session.role === ROLES.ADMIN || session.role === ROLES.SUPER_ADMIN;
    if (isAdmin) {
      await ensureDemoFlowForAdmin(session.userId);
    }

    const projects = await db.project.findMany({
      where: { userId: session.userId },
      select: {
        id: true,
        name: true,
        workflows: {
          select: {
            id: true,
            name: true,
            nodesJson: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    for (const p of projects) {
      for (const w of p.workflows) {
        let nodes: Array<{ type?: string; data?: Record<string, unknown> }> = [];
        try {
          nodes = JSON.parse(w.nodesJson || "[]");
        } catch {
          nodes = [];
        }
        const hasPayment = nodes.some((n) => n.type === "create_payment" || n.type === "payment");
        const hasWhatsapp = nodes.some((n) => n.type === "whatsapp");
        const paymentNode = nodes.find((n) => n.type === "create_payment" || n.type === "payment");
        const provider = paymentNode?.data?.provider
          ? String(paymentNode.data.provider)
          : hasPayment
          ? "payphone"
          : null;

        let channel: string | null = null;
        if (hasWhatsapp) channel = "WhatsApp";

        let status = "active";
        if (nodes.length === 0) status = "draft";

        workflows.push({
          id: w.id,
          name: w.name,
          projectId: p.id,
          projectName: p.name,
          nodeCount: nodes.length,
          status,
          provider,
          channel,
          createdAt: w.createdAt,
          updatedAt: w.updatedAt,
        });
      }
    }
  } catch (err) {
    // DB not available — we'll fall back to the demo flow below.
    console.error("[/api/workflows GET] DB error, using demo fallback:", err);
  }

  // If no workflows were found (DB empty or unavailable), include the demo flow.
  if (workflows.length === 0) {
    workflows.push(getDemoFlowItem());
  }

  // Sort by updatedAt desc.
  workflows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  return NextResponse.json({ workflows });
}

/**
 * POST /api/workflows
 * Create a new workflow. Body: { projectId, name }
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { projectId, name } = await req.json();
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required." }, { status: 400 });
    }
    const project = await db.project.findFirst({
      where: { id: projectId, userId: session.userId },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const workflow = await db.workflow.create({
      data: {
        name: name?.trim() || "Untitled Workflow",
        projectId,
        nodesJson: JSON.stringify([]),
        edgesJson: JSON.stringify([]),
      },
    });
    return NextResponse.json({ workflow });
  } catch (err) {
    console.error("[workflow POST] error", err);
    return NextResponse.json({ error: "Failed to create workflow." }, { status: 500 });
  }
}
