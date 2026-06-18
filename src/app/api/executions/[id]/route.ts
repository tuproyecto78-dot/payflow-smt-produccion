import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const execution = await db.executionLog.findUnique({
    where: { id },
    include: { workflow: { include: { project: true } } },
  });
  if (!execution || execution.workflow.project.userId !== session.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    execution: {
      id: execution.id,
      status: execution.status,
      workflowId: execution.workflowId,
      workflowName: execution.workflow.name,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      entries: JSON.parse(execution.entriesJson || "[]"),
      variables: JSON.parse(execution.variablesJson || "{}"),
    },
  });
}
