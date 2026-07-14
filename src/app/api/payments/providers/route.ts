import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import { getAllProviderStatuses } from "@/lib/payments";

// GET /api/payments/providers
// Returns the list of payment provider statuses (configured, mode, missingVars).
// Admin-only. NEVER returns secret values — only booleans and env-var names.
export async function GET() {
  const session = await requireActiveSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const statuses = getAllProviderStatuses();
  return NextResponse.json({ providers: statuses });
}

export const dynamic = "force-dynamic";
