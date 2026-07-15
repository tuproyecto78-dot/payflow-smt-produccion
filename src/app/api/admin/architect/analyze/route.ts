import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { getAllEvents, getEventById, analyzeEvent, createProposal, updateEventStatus } from "@/lib/architect";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== ROLES.ADMIN && session.role !== ROLES.SUPER_ADMIN) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const eventId = body.eventId;

  if (eventId) {
    const event = getEventById(eventId);
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    const analysis = analyzeEvent(event);
    const proposal = createProposal({ ...analysis, eventId: event.id });
    updateEventStatus(event.id, "analyzed");

    return NextResponse.json({ ok: true, proposal });
  }

  // Analyze all unanalyzed events
  const events = getAllEvents().filter(e => e.status === "detected");
  const newProposals = [];

  for (const event of events) {
    const analysis = analyzeEvent(event);
    const proposal = createProposal({ ...analysis, eventId: event.id });
    updateEventStatus(event.id, "analyzed");
    newProposals.push(proposal);
  }

  return NextResponse.json({ ok: true, proposals: newProposals, count: newProposals.length });
}
