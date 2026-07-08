import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  isDemoWorkflowId,
  getDemoWorkflowById,
} from "@/lib/workflows/demo-whatsapp-ai-payment-flow";

async function getOwnedWorkflow(workflowId: string, userId: string) {
  const workflow = await db.workflow.findUnique({
    where: { id: workflowId },
    include: { project: true },
  });
  if (!workflow || workflow.project.userId !== userId) return null;
  return workflow;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  // ─── Local demo flow: return from code, no DB lookup ─────────────
  if (isDemoWorkflowId(id)) {
    const demo = getDemoWorkflowById(id);
    if (demo) {
      return NextResponse.json({
        workflow: {
          id: demo.id,
          name: demo.name,
          projectId: "demo-project",
          nodes: demo.nodes,
          edges: demo.edges,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date(),
        },
      });
    }
  }

  // ─── Real flow: lookup in DB ─────────────────────────────────────
  try {
    const workflow = await getOwnedWorkflow(id, session.userId);
    if (!workflow) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      workflow: {
        id: workflow.id,
        name: workflow.name,
        projectId: workflow.projectId,
        nodes: JSON.parse(workflow.nodesJson || "[]"),
        edges: JSON.parse(workflow.edgesJson || "[]"),
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt,
      },
    });
  } catch (err) {
    console.error("[/api/workflows/[id] GET] DB error:", err);
    return NextResponse.json({ error: "No se pudo cargar el flujo." }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const workflow = await getOwnedWorkflow(id, session.userId);
  if (!workflow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string") data.name = body.name.trim();
    if (Array.isArray(body.nodes)) data.nodesJson = JSON.stringify(body.nodes);
    if (Array.isArray(body.edges)) data.edgesJson = JSON.stringify(body.edges);
    const updated = await db.workflow.update({
      where: { id },
      data,
    });
    // Touch project updatedAt
    await db.project.update({
      where: { id: workflow.projectId },
      data: { updatedAt: new Date() },
    });
    return NextResponse.json({
      workflow: {
        id: updated.id,
        name: updated.name,
        projectId: updated.projectId,
        nodes: JSON.parse(updated.nodesJson || "[]"),
        edges: JSON.parse(updated.edgesJson || "[]"),
        updatedAt: updated.updatedAt,
      },
    });
  } catch (err) {
    console.error("[workflow PUT] error", err);
    return NextResponse.json({ error: "Failed to save workflow." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const workflow = await getOwnedWorkflow(id, session.userId);
  if (!workflow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.workflow.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
