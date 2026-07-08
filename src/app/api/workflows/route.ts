import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ensureDemoFlowForAdmin } from "@/lib/auto-seed";
import { ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * GET /api/workflows
 *
 * Returns all workflows owned by the current user (across all their projects).
 * Each workflow includes: id, name, projectId, projectName, nodeCount,
 * updatedAt, and a derived provider/channel/status for display.
 *
 * For admin users, auto-seeds the demo flow if they have 0 workflows
 * (critical for Vercel ephemeral databases).
 *
 * Used by /dashboard/flujos to render workflow cards.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Auto-seed: for admin users, ensure they have the demo flow.
    // This is critical for Vercel where the DB is ephemeral.
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

    for (const p of projects) {
      for (const w of p.workflows) {
        let nodes: Array<{ type?: string; data?: Record<string, unknown> }> = [];
        try {
          nodes = JSON.parse(w.nodesJson || "[]");
        } catch {
          nodes = [];
        }
        // Derive provider + channel from node types/data.
        const hasPayment = nodes.some((n) => n.type === "create_payment" || n.type === "payment");
        const hasWhatsapp = nodes.some((n) => n.type === "whatsapp");
        const hasAi = nodes.some((n) => n.type === "ai_agent");
        const paymentNode = nodes.find((n) => n.type === "create_payment" || n.type === "payment");
        const provider = paymentNode?.data?.provider
          ? String(paymentNode.data.provider)
          : hasPayment
          ? "payphone"
          : null;

        let channel: string | null = null;
        if (hasWhatsapp) channel = "WhatsApp";

        let status = "active";
        // If the workflow has 0 nodes, mark as draft.
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

    // Sort by updatedAt desc.
    workflows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    return NextResponse.json({ workflows });
  } catch (err) {
    console.error("[/api/workflows GET] error:", err);
    return NextResponse.json({ workflows: [] });
  }
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
