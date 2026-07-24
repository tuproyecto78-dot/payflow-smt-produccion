import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth/require-session";
import { isAdmin } from "@/lib/roles";
import { createServiceRoleClient } from "@/lib/supabase";
import { getClientIP, rateLimit, RATE_LIMIT_ERROR } from "@/lib/security";

const querySchema = z.object({
  clientId: z.string().trim().min(1).max(100).optional(),
  messageId: z.string().trim().min(1).max(512),
});

export async function GET(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!rateLimit(`whatsapp-message-status:${session.userId}:${getClientIP(req)}`, 60, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  if (session.clientId && parsed.data.clientId && parsed.data.clientId !== session.clientId) {
    return NextResponse.json({ error: "No puedes consultar mensajes de otro negocio." }, { status: 403 });
  }
  const clientId = session.clientId || (isAdmin(session) ? parsed.data.clientId : null);
  if (!clientId) return NextResponse.json({ error: "Selecciona un negocio." }, { status: 409 });

  const supabase = createServiceRoleClient();
  const { data: message, error } = await supabase
    .from("messages")
    .select("id, provider_message_id, direction, message_type, status, content_preview, created_at, sent_at, delivered_at, read_at, failed_at")
    .eq("client_id", clientId)
    .eq("provider", "meta")
    .eq("provider_message_id", parsed.data.messageId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "No se pudo consultar el estado del mensaje." }, { status: 503 });
  if (!message) return NextResponse.json({ error: "Mensaje no encontrado." }, { status: 404 });
  const { data: events } = await supabase
    .from("message_status_events")
    .select("status, occurred_at, created_at")
    .eq("client_id", clientId)
    .eq("message_id", message.id)
    .order("occurred_at", { ascending: true });
  return NextResponse.json({ message, events: events || [] });
}

export const dynamic = "force-dynamic";

