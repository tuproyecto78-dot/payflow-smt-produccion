import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { getProposalById, getEventById, createClickUpTask, createAction, updateAction } from "@/lib/architect";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== ROLES.ADMIN && session.role !== ROLES.SUPER_ADMIN) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { proposalId } = body;
  if (!proposalId) return NextResponse.json({ error: "proposalId required" }, { status: 400 });

  const proposal = getProposalById(proposalId);
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  const event = getEventById(proposal.eventId);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const result = await createClickUpTask(proposal, event);

  const action = createAction({
    proposalId,
    actionType: "clickup_task",
    status: result.ok ? "completed" : "failed",
    result: result.ok ? "Tarea creada en ClickUp" : result.error,
    clickupTaskId: result.taskId || null,
    clickupTaskUrl: result.taskUrl || null,
    executedBy: session.email,
    executedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: result.ok, action, taskUrl: result.taskUrl, error: result.error });
}
