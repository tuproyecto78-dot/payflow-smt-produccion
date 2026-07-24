import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import { isAdmin } from "@/lib/roles";
import { resolveWhatsAppConnection } from "@/lib/whatsapp/repository";

const CAPABILITIES = [
  { type: "text", label: "Texto", live: true },
  { type: "template", label: "Plantilla aprobada", live: true },
  { type: "media", label: "Imagen, video, audio, documento o sticker por URL/ID", live: true },
  { type: "buttons", label: "Botones de respuesta", live: true },
  { type: "list", label: "Lista interactiva", live: true },
  { type: "location", label: "Ubicación", live: true },
  { type: "contacts", label: "Tarjetas de contacto", live: true },
  { type: "reaction", label: "Reacciones con emoji", live: true },
  { type: "flow_message", label: "Envío de WhatsApp Flow", live: true },
  { type: "mark_read", label: "Marcar mensajes como leídos", live: true },
  { type: "delivery_status", label: "Seguimiento sent, delivered, read y failed", live: true },
  { type: "media_management", label: "Carga, consulta y eliminación de medios", live: true },
  { type: "template_management", label: "Crear, actualizar, listar y eliminar plantillas", live: true },
  { type: "business_profile", label: "Perfil comercial", live: true },
  { type: "phone_management", label: "Registro y verificación de números", live: true },
  { type: "flows", label: "WhatsApp Flows", live: true },
  { type: "analytics", label: "Analítica de cuenta, conversación y número", live: true },
  { type: "webhooks", label: "Webhook firmado y suscripciones WABA", live: true },
  { type: "business_accounts", label: "Cuentas comerciales del portafolio", live: true },
] as const;

export async function GET(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const requestedClientId = new URL(req.url).searchParams.get("clientId")?.trim() || null;
  if (session.clientId && requestedClientId && requestedClientId !== session.clientId) {
    return NextResponse.json({ error: "No puedes consultar otro negocio." }, { status: 403 });
  }
  const clientId = session.clientId || (
    isAdmin(session)
      ? requestedClientId || process.env.WHATSAPP_CLIENT_ID?.trim() || null
      : null
  );
  const connection = clientId ? await resolveWhatsAppConnection(clientId).catch(() => null) : null;
  return NextResponse.json({
    clientId,
    configured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN?.trim() && connection?.phoneNumberId),
    templatesConfigured: Boolean(connection?.businessAccountId),
    webhookSignatureConfigured: Boolean(process.env.WHATSAPP_APP_SECRET?.trim()),
    businessPortfolioConfigured: Boolean(process.env.META_BUSINESS_PORTFOLIO_ID?.trim()),
    capabilities: CAPABILITIES,
    permissions: {
      operate: "sesión activa, limitada al client_id propio",
      manage: "client_owner, admin o super_admin",
      sensitive: "solo super_admin y confirmación explícita",
    },
    security: {
      arbitraryGraphProxy: false,
      localServerFileReads: false,
      serverSideTokenOnly: true,
      tenantMediaOwnership: true,
    },
  });
}

export const dynamic = "force-dynamic";
