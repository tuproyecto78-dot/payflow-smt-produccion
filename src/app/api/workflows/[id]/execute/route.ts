import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { executeWorkflow } from "@/lib/engine";
import type { PaymentOutcome } from "@/lib/workflow-types";

async function getOwnedWorkflow(workflowId: string, userId: string) {
  const workflow = await db.workflow.findUnique({
    where: { id: workflowId },
    include: { project: true },
  });
  if (!workflow || workflow.project.userId !== userId) return null;
  return workflow;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const workflow = await getOwnedWorkflow(id, session.userId);
  if (!workflow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: {
    forcePaymentOutcome?: PaymentOutcome;
    questionResponses?: Record<string, string>;
    nodes?: unknown;
    edges?: unknown;
  } = {};
  try {
    body = await req.json();
  } catch {
    // allow empty body
  }

  // Prefer the body nodes/edges (unsaved changes), otherwise use the saved graph.
  const nodes = Array.isArray(body.nodes)
    ? (body.nodes as Parameters<typeof executeWorkflow>[0])
    : (JSON.parse(workflow.nodesJson || "[]") as Parameters<typeof executeWorkflow>[0]);
  const edges = Array.isArray(body.edges)
    ? (body.edges as Parameters<typeof executeWorkflow>[1])
    : (JSON.parse(workflow.edgesJson || "[]") as Parameters<typeof executeWorkflow>[1]);

  const execution = await db.executionLog.create({
    data: {
      workflowId: workflow.id,
      status: "running",
      entriesJson: JSON.stringify([]),
      variablesJson: JSON.stringify({}),
    },
  });

  const result = await executeWorkflow(nodes, edges, {
    forcePaymentOutcome: body.forcePaymentOutcome,
    questionResponses: body.questionResponses,
  });

  const updated = await db.executionLog.update({
    where: { id: execution.id },
    data: {
      status: result.status,
      entriesJson: JSON.stringify(result.entries),
      variablesJson: JSON.stringify(result.variables),
      completedAt: new Date(),
    },
  });

  return NextResponse.json({
    execution: {
      id: updated.id,
      status: updated.status,
      startedAt: updated.startedAt,
      completedAt: updated.completedAt,
    },
    result: {
      status: result.status,
      entries: result.entries,
      variables: result.variables,
      whatsappMessages: result.whatsappMessages,
      finalNode: result.finalNode,
      error: result.error,
    },
  });
}
