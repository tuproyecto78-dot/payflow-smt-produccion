import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import { catalogApiError, listCatalogBusinesses, listCatalogOrders, resolveCatalogClientId } from "@/lib/catalog-server";
import { isInternalAccessRole } from "@/lib/auth/access-profile";

export async function GET(request: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const clientId = resolveCatalogClientId(session, request);
  try {
    const businesses = await listCatalogBusinesses(session);
    if (!clientId) {
      return NextResponse.json({
        orders: [],
        businesses,
        selectedClientId: null,
        requiresBusinessSelection: isInternalAccessRole(session.role),
      });
    }
    if (isInternalAccessRole(session.role) && !businesses.some((business) => business.id === clientId)) {
      return NextResponse.json({ error: "Negocio no encontrado." }, { status: 404 });
    }
    const orders = await listCatalogOrders(clientId);
    return NextResponse.json({ orders, businesses, selectedClientId: clientId, requiresBusinessSelection: false });
  } catch (error) {
    console.error("[catalog orders GET]", error);
    const apiError = catalogApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

export const dynamic = "force-dynamic";
