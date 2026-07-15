import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { getProposalById, updateProposal, updateEventStatus, createAction, updateAction } from "@/lib/architect";

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
  if (proposal.approvalStatus !== "approved") {
    return NextResponse.json({ error: "Proposal must be approved first" }, { status: 400 });
  }

  const action = createAction({
    proposalId,
    actionType: "manual_review",
    status: "executing",
    result: null,
    clickupTaskId: null,
    clickupTaskUrl: null,
    executedBy: session.email,
    executedAt: new Date().toISOString(),
  });

  // Mark as executed (in a real system, this would perform the action)
  updateAction(action.id, { status: "completed", result: "Acción ejecutada manualmente por administrador" });
  updateProposal(proposalId, { approvalStatus: "executed" });
  updateEventStatus(proposal.eventId, "executed");

  return NextResponse.json({ ok: true, action, message: "Acción ejecutada" });
}
