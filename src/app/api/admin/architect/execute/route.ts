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
    actionType: "hermes_coordinated_review",
    status: "executing",
    result: null,
    executedBy: session.email,
    executedAt: new Date().toISOString(),
  });

  // Hermes coordinates the approved action and records the critical approval trail.
  updateAction(action.id, { status: "completed", result: "Acción aprobada y coordinada por Arquitecto Hermes" });
  updateProposal(proposalId, { approvalStatus: "executed" });
  updateEventStatus(proposal.eventId, "executed");

  return NextResponse.json({ ok: true, action, message: "Acción coordinada por Arquitecto Hermes" });
}
