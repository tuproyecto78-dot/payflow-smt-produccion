import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import { isInternalAccessRole } from "@/lib/auth/access-profile";
import { createServiceRoleClient } from "@/lib/supabase";
import { sanitizeText } from "@/lib/security";

type Context = { params: Promise<{ id: string }> };

async function authorize(clientId: string) {
  const session = await requireActiveSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!isInternalAccessRole(session.role) && session.clientId !== clientId) {
    return { error: NextResponse.json({ error: "No autorizado para este negocio." }, { status: 403 }) };
  }
  return { session };
}

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const auth = await authorize(id);
  if (auth.error) return auth.error;

  try {
    const supabase = createServiceRoleClient();
    const { data: client, error: clientError } = await supabase
      .from("client_accounts")
      .select("id,business_name,business_type,owner_email,owner_phone,country,city,status,payment_provider,plan_code,created_at,updated_at")
      .eq("id", id)
      .maybeSingle();
    if (clientError) throw clientError;
    if (!client) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

    const [catalogResult, productsResult, historyResult] = await Promise.all([
      supabase.from("catalogs").select("id,status,slug,description,currency").eq("client_id", id).maybeSingle(),
      supabase.from("catalog_products").select("id,name,description,sku,price,compare_at_price,currency,stock,track_inventory,active,updated_at").eq("client_id", id).order("updated_at", { ascending: false }).limit(500),
      supabase.from("audit_logs").select("id,action,entity_type,entity_id,metadata,created_at").eq("client_id", id).order("created_at", { ascending: false }).limit(200),
    ]);
    if (catalogResult.error) throw catalogResult.error;
    if (productsResult.error) throw productsResult.error;
    if (historyResult.error) throw historyResult.error;

    const promotionEvent = (historyResult.data || []).find((entry) => entry.action === "catalog_promotions_updated" || entry.action === "onboarding_completed");
    const metadata = promotionEvent?.metadata && typeof promotionEvent.metadata === "object"
      ? promotionEvent.metadata as Record<string, unknown>
      : {};
    const promotionValue = metadata.promotions;
    const promotions = Array.isArray(promotionValue)
      ? promotionValue.map(String).join("\n\n")
      : typeof promotionValue === "string" ? promotionValue : "";

    return NextResponse.json({
      client: {
        id: String(client.id),
        businessName: String(client.business_name || ""),
        businessType: String(client.business_type || ""),
        ownerEmail: String(client.owner_email || ""),
        ownerPhone: String(client.owner_phone || ""),
        country: String(client.country || ""),
        city: String(client.city || ""),
        status: String(client.status || "active"),
        paymentProvider: String(client.payment_provider || "none"),
        planCode: String(client.plan_code || "onboarding"),
        isDemo: String(client.plan_code || "") === "demo",
        createdAt: String(client.created_at || ""),
        updatedAt: String(client.updated_at || ""),
      },
      catalog: catalogResult.data ? {
        id: String(catalogResult.data.id),
        status: String(catalogResult.data.status || "draft"),
        slug: String(catalogResult.data.slug || ""),
        description: String(catalogResult.data.description || ""),
        currency: String(catalogResult.data.currency || "USD"),
      } : null,
      products: (productsResult.data || []).map((product) => ({
        id: String(product.id),
        name: String(product.name || ""),
        description: String(product.description || ""),
        sku: String(product.sku || ""),
        price: Number(product.price || 0),
        compareAtPrice: product.compare_at_price == null ? null : Number(product.compare_at_price),
        currency: String(product.currency || "USD"),
        stock: Number(product.stock || 0),
        trackInventory: product.track_inventory !== false,
        active: product.active !== false,
        updatedAt: String(product.updated_at || ""),
      })),
      promotions,
      history: (historyResult.data || []).map((entry) => ({
        id: String(entry.id),
        action: String(entry.action || ""),
        entityType: String(entry.entity_type || ""),
        entityId: String(entry.entity_id || ""),
        metadata: entry.metadata && typeof entry.metadata === "object" ? entry.metadata : {},
        createdAt: String(entry.created_at || ""),
      })),
    });
  } catch (error) {
    console.error("[client detail GET]", error);
    return NextResponse.json({ error: "No se pudo cargar el cliente." }, { status: 503 });
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  const auth = await authorize(id);
  if (auth.error || !auth.session) return auth.error;

  try {
    const body = await request.json();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.businessName === "string") {
      const value = sanitizeText(body.businessName).slice(0, 200);
      if (!value) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
      patch.business_name = value;
    }
    if (typeof body.businessType === "string") patch.business_type = sanitizeText(body.businessType).slice(0, 100) || null;
    if (typeof body.ownerPhone === "string") patch.owner_phone = sanitizeText(body.ownerPhone).slice(0, 30) || null;
    if (typeof body.paymentProvider === "string" && ["none", "payphone", "external", "transfer"].includes(body.paymentProvider)) {
      patch.payment_provider = body.paymentProvider;
    }
    if (typeof body.status === "string" && ["active", "suspended", "cancelled"].includes(body.status)) patch.status = body.status;

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.from("client_accounts").update(patch).eq("id", id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

    await supabase.from("audit_logs").insert({
      user_id: auth.session.userId,
      client_id: id,
      action: "client_profile_updated",
      entity_type: "client_account",
      entity_id: id,
      metadata: { fields: Object.keys(patch).filter((field) => field !== "updated_at") },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[client detail PATCH]", error);
    return NextResponse.json({ error: "No se pudo actualizar el cliente." }, { status: 503 });
  }
}
