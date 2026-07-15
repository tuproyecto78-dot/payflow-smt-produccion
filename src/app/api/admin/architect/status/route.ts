import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { getArchitectStatus } from "@/lib/architect";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== ROLES.ADMIN && session.role !== ROLES.SUPER_ADMIN) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  return NextResponse.json(getArchitectStatus());
}
