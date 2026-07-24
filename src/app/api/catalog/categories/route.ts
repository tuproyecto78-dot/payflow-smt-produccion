import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import { catalogApiError, getCatalogForClient, recordCatalogAudit, resolveCatalogClientId, slugifyCatalog } from "@/lib/catalog-server";
import { catalogCategorySchema, firstValidationError } from "@/lib/catalog-validation";
import { createServiceRoleClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const clientId = resolveCatalogClientId(session, request);
  if (!clientId) return NextResponse.json({ error: "Selecciona un negocio." }, { status: 400 });
  const parsed = catalogCategorySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: firstValidationError(parsed.error) }, { status: 400 });

  try {
    const catalog = await getCatalogForClient(clientId);
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("catalog_categories")
      .insert({
        client_id: clientId,
        catalog_id: catalog.id,
        name: parsed.data.name,
        slug: slugifyCatalog(parsed.data.name),
        description: parsed.data.description || null,
        sort_order: parsed.data.sortOrder,
        active: parsed.data.active,
      })
      .select("id")
      .single();
    if (error) throw error;
    await recordCatalogAudit({ session, clientId, action: "catalog_category_created", entityType: "catalog_category", entityId: String(data.id), metadata: { name: parsed.data.name } });
    return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
  } catch (error) {
    console.error("[catalog categories POST]", error);
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("catalog_categories_catalog_id_slug_key") || message.includes("duplicate key")) {
      return NextResponse.json({ error: "Ya existe una categoría con ese nombre." }, { status: 409 });
    }
    const apiError = catalogApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

export const dynamic = "force-dynamic";
