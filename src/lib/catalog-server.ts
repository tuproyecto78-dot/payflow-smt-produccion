import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthenticatedUser } from "@/lib/auth/require-session";
import { isInternalAccessRole } from "@/lib/auth/access-profile";
import { createServiceRoleClient } from "@/lib/supabase";
import type {
  CatalogBusiness,
  CatalogCategory,
  CatalogOrder,
  CatalogProduct,
  CatalogSettings,
  CatalogSnapshot,
} from "@/lib/catalog-types";

export function slugifyCatalog(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "catalogo";
}

export function requestedClientId(request: Request) {
  return new URL(request.url).searchParams.get("clientId")?.trim() || null;
}

export function resolveCatalogClientId(session: AuthenticatedUser, request: Request) {
  if (session.clientId) return session.clientId;
  if (isInternalAccessRole(session.role)) return requestedClientId(request);
  return null;
}

export async function listCatalogBusinesses(session: AuthenticatedUser): Promise<CatalogBusiness[]> {
  if (!isInternalAccessRole(session.role)) return [];
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("client_accounts")
    .select("id, business_name, status")
    .order("business_name", { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => ({
    id: String(row.id),
    businessName: String(row.business_name || "Negocio"),
    status: String(row.status || "active"),
  }));
}

async function getBusiness(supabase: SupabaseClient, clientId: string) {
  const { data, error } = await supabase
    .from("client_accounts")
    .select("id, business_name, status")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureCatalog(supabase: SupabaseClient, clientId: string) {
  const { data: existing, error: existingError } = await supabase
    .from("catalogs")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  const business = await getBusiness(supabase, clientId);
  if (!business) throw new Error("BUSINESS_NOT_FOUND");
  const suffix = clientId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toLowerCase();
  const slug = `${slugifyCatalog(String(business.business_name || "catalogo"))}-${suffix || "payflow"}`;
  const { data, error } = await supabase
    .from("catalogs")
    .insert({
      client_id: clientId,
      business_name: String(business.business_name || "Mi negocio"),
      slug,
      status: "draft",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

function mapCategory(row: Record<string, unknown>): CatalogCategory {
  return {
    id: String(row.id),
    name: String(row.name || ""),
    slug: String(row.slug || ""),
    description: String(row.description || ""),
    sortOrder: Number(row.sort_order || 0),
    active: row.active !== false,
  };
}

function mapProduct(row: Record<string, unknown>): CatalogProduct {
  return {
    id: String(row.id),
    categoryId: row.category_id ? String(row.category_id) : null,
    name: String(row.name || ""),
    slug: String(row.slug || ""),
    description: String(row.description || ""),
    sku: String(row.sku || ""),
    price: Number(row.price || 0),
    compareAtPrice: row.compare_at_price == null ? null : Number(row.compare_at_price),
    currency: String(row.currency || "USD"),
    stock: Number(row.stock || 0),
    trackInventory: row.track_inventory !== false,
    active: row.active !== false,
    imageUrl: String(row.image_url || ""),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

function mapCatalog(row: Record<string, unknown>, whatsappConnected: boolean, origin: string): CatalogSettings {
  const slug = String(row.slug || "");
  return {
    id: String(row.id),
    clientId: String(row.client_id),
    businessName: String(row.business_name || ""),
    slug,
    description: String(row.description || ""),
    currency: String(row.currency || "USD"),
    status: row.status === "published" ? "published" : "draft",
    accentColor: String(row.accent_color || "#2563eb"),
    whatsappNotificationsEnabled: row.whatsapp_notifications_enabled === true,
    whatsappConnected,
    whatsappTemplateName: String(row.whatsapp_template_name || ""),
    whatsappTemplateLanguage: String(row.whatsapp_template_language || "es"),
    publicUrl: `${origin}/catalogo/${slug}`,
  };
}

export async function getCatalogSnapshot(input: {
  session: AuthenticatedUser;
  clientId: string | null;
  origin: string;
}): Promise<CatalogSnapshot> {
  const businesses = await listCatalogBusinesses(input.session);
  if (!input.clientId) {
    return {
      catalog: null,
      categories: [],
      products: [],
      businesses,
      selectedClientId: null,
      requiresBusinessSelection: isInternalAccessRole(input.session.role),
    };
  }

  if (isInternalAccessRole(input.session.role) && !businesses.some((business) => business.id === input.clientId)) {
    throw new Error("BUSINESS_NOT_FOUND");
  }

  const supabase = createServiceRoleClient();
  const catalog = await ensureCatalog(supabase, input.clientId);
  const [categoriesResult, productsResult, whatsappResult] = await Promise.all([
    supabase
      .from("catalog_categories")
      .select("*")
      .eq("client_id", input.clientId)
      .eq("catalog_id", catalog.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("catalog_products")
      .select("*")
      .eq("client_id", input.clientId)
      .eq("catalog_id", catalog.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("whatsapp_connections")
      .select("id")
      .eq("client_id", input.clientId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
  ]);
  if (categoriesResult.error) throw categoriesResult.error;
  if (productsResult.error) throw productsResult.error;

  return {
    catalog: mapCatalog(catalog, Boolean(whatsappResult.data), input.origin),
    categories: (categoriesResult.data || []).map((row) => mapCategory(row)),
    products: (productsResult.data || []).map((row) => mapProduct(row)),
    businesses,
    selectedClientId: input.clientId,
    requiresBusinessSelection: false,
  };
}

export async function getCatalogForClient(clientId: string) {
  const supabase = createServiceRoleClient();
  return ensureCatalog(supabase, clientId);
}

export async function recordCatalogAudit(input: {
  session: AuthenticatedUser;
  clientId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("audit_logs").insert({
      user_id: input.session.userId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId,
      metadata: { client_id: input.clientId, ...(input.metadata || {}) },
    });
    if (error) console.error("[catalog audit]", error.message);
  } catch (error) {
    console.error("[catalog audit]", error);
  }
}

export async function listCatalogOrders(clientId: string, limit = 100): Promise<CatalogOrder[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("catalog_orders")
    .select("*, catalog_order_items(*)")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((row) => ({
    id: String(row.id),
    orderNumber: String(row.order_number || ""),
    status: row.status,
    paymentStatus: row.payment_status,
    channel: String(row.channel || "web"),
    customerName: String(row.customer_name || ""),
    customerPhone: String(row.customer_phone || ""),
    customerEmail: String(row.customer_email || ""),
    notes: String(row.notes || ""),
    total: Number(row.total || 0),
    currency: String(row.currency || "USD"),
    whatsappNotificationStatus: String(row.whatsapp_notification_status || "not_requested"),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    items: ((row.catalog_order_items || []) as Array<Record<string, unknown>>).map((item) => ({
      id: String(item.id),
      productId: item.product_id ? String(item.product_id) : null,
      productName: String(item.product_name || ""),
      sku: String(item.sku || ""),
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unit_price || 0),
      lineTotal: Number(item.line_total || 0),
    })),
  }));
}

export function catalogApiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("BUSINESS_NOT_FOUND")) return { status: 404, message: "Negocio no encontrado." };
  if (message.includes("CATALOG_NOT_FOUND")) return { status: 404, message: "El catálogo no está publicado." };
  if (message.includes("PRODUCT_NOT_FOUND")) return { status: 400, message: "Uno de los productos ya no está disponible." };
  if (message.includes("INSUFFICIENT_STOCK:")) return { status: 409, message: `Stock insuficiente para ${message.split("INSUFFICIENT_STOCK:")[1] || "un producto"}.` };
  if (message.includes("INVALID_ORDER_ITEMS") || message.includes("INVALID_QUANTITY")) return { status: 400, message: "Revisa los productos y cantidades del pedido." };
  if (message.includes("catalogs_slug_key")) return { status: 409, message: "Ese enlace público ya está en uso." };
  if (message.includes("duplicate key")) return { status: 409, message: "Ya existe un registro con esos datos." };
  return { status: 503, message: "El módulo de catálogo no está disponible. Verifica que la migración esté aplicada." };
}
