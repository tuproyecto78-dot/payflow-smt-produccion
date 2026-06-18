import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

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
