import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isSupabaseConfigured, getSupabaseUser, createServerClientHelper } from "@/lib/supabase";

const VALID_STATUSES = ["pending_review", "contacted", "active", "rejected"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { status } = body;
  if (!VALID_STATUSES.includes(status)) return NextResponse.json({ error: "Estado inválido." }, { status: 400 });

  if (isSupabaseConfigured) {
    const user = await getSupabaseUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = await createServerClientHelper();
    const { error } = await supabase.from("subscription_requests").update({ subscription_status: status }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  }

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await db.subscriptionRequest.update({ where: { id }, data: { subscriptionStatus: status } });
  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
