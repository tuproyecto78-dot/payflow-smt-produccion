import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { getProposalById, updateProposal, updateEventStatus } from "@/lib/architect";

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

  updateProposal(proposalId, {
    approvalStatus: "approved",
    approvedBy: session.email,
    approvedAt: new Date().toISOString(),
  });
  updateEventStatus(proposal.eventId, "approved");

  return NextResponse.json({ ok: true, message: "Propuesta aprobada" });
}
