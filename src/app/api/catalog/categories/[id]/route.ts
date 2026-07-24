import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import { catalogApiError, recordCatalogAudit, resolveCatalogClientId, slugifyCatalog } from "@/lib/catalog-server";
import { catalogCategoryPatchSchema, firstValidationError } from "@/lib/catalog-validation";
import { createServiceRoleClient } from "@/lib/supabase";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const clientId = resolveCatalogClientId(session, request);
  if (!clientId) return NextResponse.json({ error: "Selecciona un negocio." }, { status: 400 });
  const parsed = catalogCategoryPatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: firstValidationError(parsed.error) }, { status: 400 });
  const { id } = await params;
  try {
    const patch: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) {
      patch.name = parsed.data.name;
      patch.slug = slugifyCatalog(parsed.data.name);
    }
    if (parsed.data.description !== undefined) patch.description = parsed.data.description || null;
    if (parsed.data.sortOrder !== undefined) patch.sort_order = parsed.data.sortOrder;
    if (parsed.data.active !== undefined) patch.active = parsed.data.active;
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("catalog_categories")
      .update(patch)
      .eq("id", id)
      .eq("client_id", clientId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Categoría no encontrada." }, { status: 404 });
    await recordCatalogAudit({ session, clientId, action: "catalog_category_updated", entityType: "catalog_category", entityId: id });
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
    .from("catalog_categories")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("client_id", clientId);
  if (error) return NextResponse.json({ error: "No se pudo eliminar la categoría." }, { status: 503 });
  if (!count) return NextResponse.json({ error: "Categoría no encontrada." }, { status: 404 });
  await recordCatalogAudit({ session, clientId, action: "catalog_category_deleted", entityType: "catalog_category", entityId: id });
  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
