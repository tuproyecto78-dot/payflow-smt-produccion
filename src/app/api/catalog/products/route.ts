import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import { catalogApiError, getCatalogForClient, recordCatalogAudit, resolveCatalogClientId, slugifyCatalog } from "@/lib/catalog-server";
import { catalogProductSchema, firstValidationError } from "@/lib/catalog-validation";
import { createServiceRoleClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const clientId = resolveCatalogClientId(session, request);
  if (!clientId) return NextResponse.json({ error: "Selecciona un negocio." }, { status: 400 });
  const parsed = catalogProductSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: firstValidationError(parsed.error) }, { status: 400 });

  try {
    const catalog = await getCatalogForClient(clientId);
    const supabase = createServiceRoleClient();
    const categoryId = parsed.data.categoryId || null;
    if (categoryId) {
      const { data: category } = await supabase
        .from("catalog_categories")
        .select("id")
        .eq("id", categoryId)
        .eq("client_id", clientId)
        .eq("catalog_id", catalog.id)
        .maybeSingle();
      if (!category) return NextResponse.json({ error: "Categoría no válida." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("catalog_products")
      .insert({
        client_id: clientId,
        catalog_id: catalog.id,
        category_id: categoryId,
        name: parsed.data.name,
        slug: `${slugifyCatalog(parsed.data.name)}-${randomUUID().slice(0, 6)}`,
        description: parsed.data.description || null,
        sku: parsed.data.sku || null,
        price: parsed.data.price,
        compare_at_price: parsed.data.compareAtPrice,
        currency: catalog.currency || "USD",
        stock: parsed.data.stock,
        track_inventory: parsed.data.trackInventory,
        active: parsed.data.active,
        image_url: parsed.data.imageUrl || null,
      })
      .select("id")
      .single();
    if (error) throw error;
    await recordCatalogAudit({ session, clientId, action: "catalog_product_created", entityType: "catalog_product", entityId: String(data.id), metadata: { name: parsed.data.name, sku: parsed.data.sku || null } });
    return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
  } catch (error) {
    console.error("[catalog products POST]", error);
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("idx_catalog_products_client_sku") || (parsed.data.sku && message.includes("duplicate key"))) {
      return NextResponse.json({ error: "Ese SKU ya existe en el negocio." }, { status: 409 });
    }
    const apiError = catalogApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

export const dynamic = "force-dynamic";
