import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import { isInternalAccessRole } from "@/lib/auth/access-profile";
import { createServiceRoleClient } from "@/lib/supabase";
import { sanitizeText } from "@/lib/security";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!isInternalAccessRole(session.role) && session.clientId !== id) {
    return NextResponse.json({ error: "No autorizado para este negocio." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const promotions = sanitizeText(typeof body.promotions === "string" ? body.promotions : "").slice(0, 12000);

  try {
    const supabase = createServiceRoleClient();
    const { data: client, error: clientError } = await supabase
      .from("client_accounts")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (clientError) throw clientError;
    if (!client) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

    const { error } = await supabase.from("audit_logs").insert({
      user_id: session.userId,
      client_id: id,
      action: "catalog_promotions_updated",
      entity_type: "client_account",
      entity_id: id,
      metadata: {
        promotions,
        lines: promotions.split(/\r?\n/).filter((line) => line.trim()).length,
      },
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, promotions });
  } catch (error) {
    console.error("[client promotions POST]", error);
    return NextResponse.json({ error: "No se pudieron guardar las promociones." }, { status: 503 });
  }
}
