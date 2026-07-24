import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import {
  catalogApiError,
  getCatalogForClient,
  getCatalogSnapshot,
  recordCatalogAudit,
  resolveCatalogClientId,
} from "@/lib/catalog-server";
import { catalogSettingsSchema, firstValidationError } from "@/lib/catalog-validation";
import { createServiceRoleClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const clientId = resolveCatalogClientId(session, request);
  try {
    const snapshot = await getCatalogSnapshot({
      session,
      clientId,
      origin: new URL(request.url).origin,
    });
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error("[catalog GET]", error);
    const apiError = catalogApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

export async function PUT(request: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const clientId = resolveCatalogClientId(session, request);
  if (!clientId) return NextResponse.json({ error: "Selecciona un negocio." }, { status: 400 });
  const parsed = catalogSettingsSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: firstValidationError(parsed.error) }, { status: 400 });

  try {
    const catalog = await getCatalogForClient(clientId);
    const supabase = createServiceRoleClient();
    if (parsed.data.whatsappNotificationsEnabled) {
      const { data: connection } = await supabase
        .from("whatsapp_connections")
        .select("id")
        .eq("client_id", clientId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (!connection) {
        return NextResponse.json({ error: "Conecta primero la API oficial de WhatsApp para activar notificaciones." }, { status: 409 });
      }
    }

    const { error } = await supabase
      .from("catalogs")
      .update({
        business_name: parsed.data.businessName,
        slug: parsed.data.slug,
        description: parsed.data.description || null,
        currency: parsed.data.currency,
        status: parsed.data.status,
        accent_color: parsed.data.accentColor,
        whatsapp_notifications_enabled: parsed.data.whatsappNotificationsEnabled,
        whatsapp_template_name: parsed.data.whatsappTemplateName || null,
        whatsapp_template_language: parsed.data.whatsappTemplateLanguage,
      })
      .eq("id", catalog.id)
      .eq("client_id", clientId);
    if (error) throw error;
    await recordCatalogAudit({ session, clientId, action: "catalog_settings_updated", entityType: "catalog", entityId: String(catalog.id), metadata: { status: parsed.data.status } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[catalog PUT]", error);
    const apiError = catalogApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

export const dynamic = "force-dynamic";
