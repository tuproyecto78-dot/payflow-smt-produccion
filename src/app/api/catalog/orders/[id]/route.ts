import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import { catalogApiError, recordCatalogAudit, resolveCatalogClientId } from "@/lib/catalog-server";
import { firstValidationError, orderStatusPatchSchema } from "@/lib/catalog-validation";
import { createServiceRoleClient } from "@/lib/supabase";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const clientId = resolveCatalogClientId(session, request);
  if (!clientId) return NextResponse.json({ error: "Selecciona un negocio." }, { status: 400 });
  const parsed = orderStatusPatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: firstValidationError(parsed.error) }, { status: 400 });
  const { id } = await params;

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc("update_catalog_order_status", {
      p_client_id: clientId,
      p_order_id: id,
      p_status: parsed.data.status || null,
      p_payment_status: parsed.data.paymentStatus || null,
    });
    if (error) throw error;
    await recordCatalogAudit({ session, clientId, action: "catalog_order_updated", entityType: "catalog_order", entityId: id, metadata: parsed.data });
    return NextResponse.json({ ok: true, order: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ORDER_NOT_FOUND")) return NextResponse.json({ error: "Pedido no encontrado." }, { status: 404 });
    if (message.includes("CANCELLED_ORDER_IS_FINAL")) return NextResponse.json({ error: "Un pedido cancelado no puede reabrirse." }, { status: 409 });
    const apiError = catalogApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

export const dynamic = "force-dynamic";
