import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send-message";
import { sanitizeText } from "@/lib/security";

export async function POST(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const clientId = session.clientId || process.env.WHATSAPP_CLIENT_ID?.trim();
  if (!clientId) return NextResponse.json({ error: "No hay un cliente de WhatsApp configurado." }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const phoneNumber = sanitizeText(body.phone_number || "");
  const messageText = sanitizeText(body.message_text || "").slice(0, 4000);
  if (!phoneNumber || !messageText) {
    return NextResponse.json({ error: "phone_number y message_text son obligatorios." }, { status: 400 });
  }

  const result = await sendWhatsAppMessage({
    clientId,
    phoneNumber,
    messageText,
    conversationId: sanitizeText(body.conversation_id || "") || null,
    contactId: sanitizeText(body.contact_id || "") || null,
  });
  return NextResponse.json(
    { ok: result.status === "sent", message_id: result.id, provider_message_id: result.providerMessageId, status: result.status },
    { status: result.status === "sent" ? 200 : 502 }
  );
}
export const dynamic = "force-dynamic";
