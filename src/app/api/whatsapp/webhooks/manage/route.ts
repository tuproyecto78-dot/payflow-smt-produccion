import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth/require-session";
import { getClientIP, rateLimit, RATE_LIMIT_ERROR } from "@/lib/security";
import {
  recordWhatsAppAudit,
  resolveWhatsAppApiContext,
  whatsappApiError,
} from "@/lib/whatsapp/access";
import { listWhatsAppWebhookSubscriptions, setWhatsAppWebhookSubscription } from "@/lib/whatsapp/management-api";

export async function GET(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  try {
    const context = await resolveWhatsAppApiContext({
      session,
      requestedClientId: new URL(req.url).searchParams.get("clientId"),
      permission: "super_admin",
      requireWaba: true,
    });
    const subscriptions = await listWhatsAppWebhookSubscriptions(context.config);
    return NextResponse.json({
      subscriptions,
      callback_path: "/api/whatsapp/webhook",
      signature_verification: Boolean(process.env.WHATSAPP_APP_SECRET?.trim()),
      verify_token_configured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN?.trim()),
    });
  } catch (error) {
    const result = whatsappApiError(error, "No se pudieron consultar las suscripciones del webhook.");
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

const schema = z.object({
  client_id: z.string().trim().min(1).max(100).optional(),
  action: z.enum(["subscribe", "unsubscribe"]),
  confirm: z.literal(true),
  override_callback_uri: z.string().url().startsWith("https://").max(2048).optional(),
});

export async function POST(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!rateLimit(`whatsapp-webhook-write:${session.userId}:${getClientIP(req)}`, 5, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "action y confirm=true son obligatorios." }, { status: 400 });
  try {
    const context = await resolveWhatsAppApiContext({
      session,
      requestedClientId: parsed.data.client_id,
      permission: "super_admin",
      requireWaba: true,
    });
    let override: { callbackUri: string; verifyToken: string } | undefined;
    if (parsed.data.override_callback_uri) {
      if (parsed.data.action !== "subscribe") {
        return NextResponse.json({ error: "El callback alternativo solo aplica al suscribirse." }, { status: 400 });
      }
      const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
      const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
      if (!appUrl || !verifyToken) {
        return NextResponse.json({ error: "Configura APP_URL y WHATSAPP_VERIFY_TOKEN para usar callback alternativo." }, { status: 503 });
      }
      const callback = new URL(parsed.data.override_callback_uri);
      const allowedOrigin = new URL(appUrl).origin;
      if (callback.origin !== allowedOrigin || callback.pathname !== "/api/whatsapp/webhook") {
        return NextResponse.json({ error: "El callback debe ser /api/whatsapp/webhook en el dominio configurado de PayFlow." }, { status: 400 });
      }
      override = { callbackUri: callback.toString(), verifyToken };
    }
    const result = await setWhatsAppWebhookSubscription(
      context.config,
      parsed.data.action === "subscribe",
      override
    );
    await recordWhatsAppAudit({
      session,
      clientId: context.clientId,
      action: `whatsapp_webhook_${parsed.data.action}`,
      entityType: "whatsapp_business_account",
      entityId: context.connection.businessAccountId || "unknown",
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const result = whatsappApiError(error, "No se pudo modificar la suscripción del webhook.");
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

export const dynamic = "force-dynamic";
