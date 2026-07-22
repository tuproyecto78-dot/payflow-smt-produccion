import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import { catalogApiError, recordCatalogAudit, resolveCatalogClientId } from "@/lib/catalog-server";
import { catalogProductPatchSchema, firstValidationError } from "@/lib/catalog-validation";
import { createServiceRoleClient } from "@/lib/supabase";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const clientId = resolveCatalogClientId(session, request);
  if (!clientId) return NextResponse.json({ error: "Selecciona un negocio." }, { status: 400 });
  const parsed = catalogProductPatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: firstValidationError(parsed.error) }, { status: 400 });
  const { id } = await params;

  try {
    const supabase = createServiceRoleClient();
    const categoryId = parsed.data.categoryId === "" ? null : parsed.data.categoryId;
    if (categoryId) {
      const { data: category } = await supabase
        .from("catalog_categories")
        .select("id")
        .eq("id", categoryId)
        .eq("client_id", clientId)
        .maybeSingle();
      if (!category) return NextResponse.json({ error: "Categoría no válida." }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (parsed.data.categoryId !== undefined) patch.category_id = categoryId || null;
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.description !== undefined) patch.description = parsed.data.description || null;
    if (parsed.data.sku !== undefined) patch.sku = parsed.data.sku || null;
    if (parsed.data.price !== undefined) patch.price = parsed.data.price;
    if (parsed.data.compareAtPrice !== undefined) patch.compare_at_price = parsed.data.compareAtPrice;
    if (parsed.data.stock !== undefined) patch.stock = parsed.data.stock;
    if (parsed.data.trackInventory !== undefined) patch.track_inventory = parsed.data.trackInventory;
    if (parsed.data.active !== undefined) patch.active = parsed.data.active;
    if (parsed.data.imageUrl !== undefined) patch.image_url = parsed.data.imageUrl || null;

    const { data, error } = await supabase
      .from("catalog_products")
      .update(patch)
      .eq("id", id)
      .eq("client_id", clientId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });
    await recordCatalogAudit({ session, clientId, action: "catalog_product_updated", entityType: "catalog_product", entityId: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const apiError = catalogApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const clientId = resolveCatalogClientId(session, request);
  if (!clientId) return NextResponse.json({ error: "Selecciona un negocio." }, { status: 400 });
  const { id } = await params;
  const supabase = createServiceRoleClient();
  const { error, count } = await supabase
    .from("catalog_products")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("client_id", clientId);
  if (error) return NextResponse.json({ error: "No se pudo eliminar el producto." }, { status: 503 });
  if (!count) return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });
  await recordCatalogAudit({ session, clientId, action: "catalog_product_deleted", entityType: "catalog_product", entityId: id });
  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
