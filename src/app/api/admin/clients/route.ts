import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import { isInternalAccessRole } from "@/lib/auth/access-profile";
import { createServiceRoleClient } from "@/lib/supabase";
import { rateLimit, getClientIP, RATE_LIMIT_ERROR } from "@/lib/security";

export async function GET(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isInternalAccessRole(session.role)) {
    return NextResponse.json({ error: "Se requiere rol de administrador." }, { status: 403 });
  }

  const ip = getClientIP(req);
  if (!rateLimit(`admin-clients-list:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }

  try {
    const supabase = createServiceRoleClient();
    const { data: clients, error: clientsError } = await supabase
      .from("client_accounts")
      .select("id,business_name,business_type,owner_email,owner_phone,owner_document,country,city,status,payment_provider,plan_code,subscription_request_id,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (clientsError) throw clientsError;

    const clientIds = (clients || []).map((client) => String(client.id));
    if (!clientIds.length) return NextResponse.json({ clients: [] });

    const [catalogsResult, productsResult, auditResult] = await Promise.all([
      supabase.from("catalogs").select("id,client_id,status,slug").in("client_id", clientIds),
      supabase.from("catalog_products").select("id,client_id").in("client_id", clientIds),
      supabase.from("audit_logs").select("id,client_id,action,created_at,metadata").in("client_id", clientIds).order("created_at", { ascending: false }).limit(1000),
    ]);
    if (catalogsResult.error) throw catalogsResult.error;
    if (productsResult.error) throw productsResult.error;
    if (auditResult.error) throw auditResult.error;

    const catalogByClient = new Map((catalogsResult.data || []).map((catalog) => [String(catalog.client_id), catalog]));
    const productCounts = new Map<string, number>();
    for (const product of productsResult.data || []) {
      const clientId = String(product.client_id);
      productCounts.set(clientId, (productCounts.get(clientId) || 0) + 1);
    }
    const lastActionByClient = new Map<string, { action: string; createdAt: string }>();
    const workflowCountByClient = new Map<string, number>();
    for (const entry of auditResult.data || []) {
      const clientId = String(entry.client_id || "");
      if (!clientId) continue;
      if (!lastActionByClient.has(clientId)) {
        lastActionByClient.set(clientId, { action: String(entry.action), createdAt: String(entry.created_at) });
      }
      if (entry.action === "workflow_created") {
        workflowCountByClient.set(clientId, (workflowCountByClient.get(clientId) || 0) + 1);
      }
    }

    return NextResponse.json({
      clients: (clients || []).map((client) => {
        const id = String(client.id);
        const catalog = catalogByClient.get(id);
        return {
          id,
          businessName: String(client.business_name || "Negocio"),
          businessType: client.business_type ? String(client.business_type) : null,
          ownerEmail: String(client.owner_email || ""),
          ownerPhone: String(client.owner_phone || ""),
          ownerDocument: client.owner_document ? String(client.owner_document) : null,
          country: client.country ? String(client.country) : null,
          city: client.city ? String(client.city) : null,
          status: String(client.status || "active"),
          paymentProvider: String(client.payment_provider || "none"),
          planCode: String(client.plan_code || "onboarding"),
          isDemo: String(client.plan_code || "") === "demo",
          subscriptionRequestId: client.subscription_request_id ? String(client.subscription_request_id) : null,
          createdAt: String(client.created_at || ""),
          updatedAt: String(client.updated_at || client.created_at || ""),
          catalog: catalog ? {
            id: String(catalog.id),
            status: String(catalog.status || "draft"),
            slug: String(catalog.slug || ""),
            productCount: productCounts.get(id) || 0,
          } : null,
          workflowCount: workflowCountByClient.get(id) || 0,
          lastAction: lastActionByClient.get(id) || null,
          paymentAccounts: [],
        };
      }),
    });
  } catch (error) {
    console.error("[/api/admin/clients] persistent query failed", error);
    return NextResponse.json(
      { error: "No se pudieron cargar los clientes persistentes. Verifica Supabase." },
      { status: 503 }
    );
  }
}

export const dynamic = "force-dynamic";
