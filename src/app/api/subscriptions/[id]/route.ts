import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isSupabaseConfigured, createServerClientHelper } from "@/lib/supabase";

const VALID_STATUSES = ["pending_review", "contacted", "active", "rejected"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { status } = body;
  if (!VALID_STATUSES.includes(status)) return NextResponse.json({ error: "Estado inválido." }, { status: 400 });

  // Use our JWT session (NOT getSupabaseUser which reads a cookie we don't set).
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (isSupabaseConfigured) {
    try {
      const supabase = await createServerClientHelper();
      const { error } = await supabase.from("subscription_requests").update({ subscription_status: status }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error("[subscriptions PATCH] Supabase failed, falling back to Prisma:", err);
    }
  }

  try {
    await db.subscriptionRequest.update({ where: { id }, data: { subscriptionStatus: status } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[subscriptions PATCH] Prisma failed:", err);
    return NextResponse.json({ error: "No se pudo actualizar la solicitud." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
