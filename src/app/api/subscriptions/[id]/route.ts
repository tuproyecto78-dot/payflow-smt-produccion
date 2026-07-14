import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isSupabaseConfigured, createServiceRoleClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth/require-session";

// "activated" is intentionally excluded: activation must use the atomic
// admin endpoint that also grants the tenant entitlement.
const VALID_STATUSES = ["pending_review", "reviewed", "rejected"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { status } = body;
  if (!VALID_STATUSES.includes(status)) return NextResponse.json({ error: "Estado inválido." }, { status: 400 });

  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Se requiere rol de administrador." }, { status: 403 });

  if (isSupabaseConfigured) {
    try {
      const supabase = createServiceRoleClient();
      const { error } = await supabase.from("subscription_requests").update({ subscription_status: status }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error("[subscriptions PATCH] Supabase failed:", err);
      return NextResponse.json({ error: "No se pudo actualizar la solicitud." }, { status: 500 });
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
