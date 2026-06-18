import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// List recent executions across all of the user's workflows.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const workflowId = searchParams.get("workflowId");
  const limit = Math.min(Number(searchParams.get("limit") || 50), 100);

  const workflows = await db.workflow.findMany({
    where: { project: { userId: session.userId } },
    select: { id: true },
  });
  const workflowIds = workflows.map((w) => w.id);
  if (workflowIds.length === 0) {
    return NextResponse.json({ executions: [] });
  }

  const executions = await db.executionLog.findMany({
    where: {
      workflowId: workflowId && workflowIds.includes(workflowId) ? workflowId : { in: workflowIds },
    },
    orderBy: { startedAt: "desc" },
    take: limit,
    include: { workflow: { select: { name: true, id: true } } },
  });

  return NextResponse.json({
    executions: executions.map((e) => ({
      id: e.id,
      status: e.status,
      workflowId: e.workflowId,
      workflowName: e.workflow.name,
      startedAt: e.startedAt,
      completedAt: e.completedAt,
    })),
  });
}
