import "server-only";

import { createServiceRoleClient } from "@/lib/supabase";
import {
  extractBusinessRules,
  normalizePaymentProvider,
  type BusinessContext,
  type BusinessProduct,
} from "@/lib/business-context-contract";
import type { FlowNode } from "@/lib/workflow-types";

function safeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function extractPromotions(value: unknown): string {
  const metadata = safeMetadata(value);
  if (typeof metadata.promotions === "string") {
    return metadata.promotions.trim();
  }
  if (Array.isArray(metadata.promotions)) {
    return metadata.promotions
      .map((promotion) => String(promotion || "").trim())
      .filter(Boolean)
      .join("\n\n");
  }
  return "";
}

export async function loadBusinessContext(input: {
  clientId: string;
  nodes: FlowNode[];
}): Promise<BusinessContext> {
  const supabase = createServiceRoleClient();

  const [businessResult, productsResult, updatedPromotions, onboardingPromotions] =
    await Promise.all([
      supabase
        .from("client_accounts")
        .select("business_name,business_type,payment_provider")
        .eq("id", input.clientId)
        .maybeSingle(),
      supabase
        .from("catalog_products")
        .select("name,description,price,currency,stock,track_inventory,metadata")
        .eq("client_id", input.clientId)
        .eq("active", true)
        .order("name", { ascending: true })
        .limit(150),
      supabase
        .from("audit_logs")
        .select("metadata")
        .eq("action", "catalog_promotions_updated")
        .contains("metadata", { client_id: input.clientId })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("audit_logs")
        .select("metadata")
        .eq("action", "onboarding_completed")
        .eq("entity_type", "client_account")
        .eq("entity_id", input.clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (businessResult.error) {
    throw new Error(
      `No se pudo cargar la identidad del negocio: ${businessResult.error.message}`
    );
  }
  if (!businessResult.data?.business_name) {
    throw new Error("No se encontró la identidad del negocio asociado al flujo.");
  }
  if (productsResult.error) {
    throw new Error(`No se pudo cargar el catálogo real: ${productsResult.error.message}`);
  }
  if (updatedPromotions.error) {
    throw new Error(
      `No se pudieron cargar las promociones vigentes: ${updatedPromotions.error.message}`
    );
  }
  if (onboardingPromotions.error) {
    throw new Error(
      `No se pudieron cargar las promociones iniciales: ${onboardingPromotions.error.message}`
    );
  }

  const businessName = String(businessResult.data.business_name).trim();
  const products: BusinessProduct[] = (productsResult.data || []).map((row) => {
    const metadata = safeMetadata(row.metadata);
    return {
      name: String(row.name || "Producto"),
      description: String(row.description || ""),
      price: Number(row.price || 0),
      currency: String(row.currency || "USD"),
      stock: Number(row.stock || 0),
      trackInventory: row.track_inventory !== false,
      category: typeof metadata.category === "string" ? metadata.category : "",
    };
  });

  return {
    clientId: input.clientId,
    businessName,
    businessType: String(businessResult.data.business_type || "").trim(),
    products,
    promotions:
      extractPromotions(updatedPromotions.data?.metadata) ||
      extractPromotions(onboardingPromotions.data?.metadata),
    rules: extractBusinessRules(input.nodes, businessName),
    paymentProvider: normalizePaymentProvider(businessResult.data.payment_provider),
  };
}
