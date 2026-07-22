import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import { createServiceRoleClient } from "@/lib/supabase";
import { getClientIP, sanitizeText, GENERIC_ERROR } from "@/lib/security";
import { validateWorkflow } from "@/lib/workflow-validator";
import { slugifyCatalog } from "@/lib/catalog-server";
import {
  generateFlexibleOnboardingFlow,
  type FlexibleConfirmationMode,
  type FlexibleOnboardingParams,
  type FlexiblePaymentProvider,
  type FlexibleTemplateId,
} from "@/lib/flexible-onboarding-flow";

export const dynamic = "force-dynamic";

const TEMPLATE_IDS = new Set<FlexibleTemplateId>([
  "solo_ia",
  "ia_agenda",
  "ia_catalogo",
  "ia_payphone",
  "ia_agenda_payphone",
  "agente_completo",
]);

type DetectedProduct = {
  name?: unknown;
  price?: unknown;
  currency?: unknown;
  stock?: unknown;
  sku?: unknown;
  category?: unknown;
  description?: unknown;
};

type DetectedKnowledge = {
  products?: DetectedProduct[];
  services?: unknown[];
  faqs?: unknown[];
  business_hours?: unknown[];
  policies?: unknown[];
  payment_conditions?: unknown[];
};

function safeText(value: unknown, max: number) {
  return sanitizeText(typeof value === "string" ? value : "").slice(0, max);
}

function safeNumber(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : Number.parseFloat(String(value || ""));
  return Number.isFinite(number) ? number : fallback;
}

function isPrivateIpv4(hostname: string) {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isSafeExternalPaymentUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase();
    return (
      Boolean(hostname) &&
      hostname !== "localhost" &&
      hostname !== "::1" &&
      !hostname.endsWith(".local") &&
      !isPrivateIpv4(hostname)
    );
  } catch {
    return false;
  }
}

function normalizeTemplate(value: unknown): FlexibleTemplateId {
  return TEMPLATE_IDS.has(value as FlexibleTemplateId)
    ? (value as FlexibleTemplateId)
    : "solo_ia";
}

function normalizeProvider(value: unknown): FlexiblePaymentProvider {
  return value === "payphone" || value === "external" ? value : "none";
}

function normalizeConfirmation(value: unknown): FlexibleConfirmationMode {
  return value === "merchant_manual" ? "merchant_manual" : "provider_webhook";
}

function normalizeKnowledge(value: unknown): DetectedKnowledge {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const knowledge = value as DetectedKnowledge;
  return {
    products: Array.isArray(knowledge.products) ? knowledge.products.slice(0, 1000) : [],
    services: Array.isArray(knowledge.services) ? knowledge.services.slice(0, 500) : [],
    faqs: Array.isArray(knowledge.faqs) ? knowledge.faqs.slice(0, 500) : [],
    business_hours: Array.isArray(knowledge.business_hours)
      ? knowledge.business_hours.slice(0, 100)
      : [],
    policies: Array.isArray(knowledge.policies) ? knowledge.policies.slice(0, 200) : [],
    payment_conditions: Array.isArray(knowledge.payment_conditions)
      ? knowledge.payment_conditions.slice(0, 100)
      : [],
  };
}

async function insertAudit(input: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  userId: string;
  clientId: string;
  action: string;
  entityType: string;
  entityId: string;
  ip: string;
  metadata: Record<string, unknown>;
}) {
  const { error } = await input.supabase.from("audit_logs").insert({
    user_id: input.userId,
    client_id: input.clientId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    ip_address: input.ip,
    metadata: input.metadata,
  });
  if (error) console.error("[persistent-onboarding] audit", error.message);
}

export async function POST(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIP(req);
  let createdClientId = "";
  let createdProjectId = "";
  let createdWorkflowId = "";
  let createdRequestId = "";
  let clientWasCreated = false;
  let projectWasCreated = false;

  try {
    const body = await req.json();
    const paymentProvider = normalizeProvider(body.paymentProvider);
    const externalPaymentUrl =
      paymentProvider === "external" ? safeText(body.externalPaymentUrl, 2048) : "";

    if (paymentProvider === "external" && !isSafeExternalPaymentUrl(externalPaymentUrl)) {
      return NextResponse.json(
        { error: "El enlace externo debe ser una URL HTTPS pública y válida." },
        { status: 400 }
      );
    }

    const params: FlexibleOnboardingParams = {
      templateId: normalizeTemplate(body.templateId),
      businessName: safeText(body.businessName, 200),
      businessType: safeText(body.businessType, 100),
      productOrService: safeText(body.productOrService, 240),
      welcomeMessage: safeText(body.welcomeMessage, 1000),
      whatsappNumber: safeText(body.whatsappNumber, 30),
      businessHours: safeText(body.businessHours, 200),
      agentTone: safeText(body.agentTone, 40) || "amable",
      agentMode:
        body.agentMode === "vender" ||
        body.agentMode === "cobrar" ||
        body.agentMode === "agendar"
          ? body.agentMode
          : "completo",
      usesAgenda: body.usesAgenda === true,
      usesCatalog: body.usesCatalog === true,
      paymentProvider,
      confirmationMode: normalizeConfirmation(body.confirmationMode),
      externalProviderName:
        paymentProvider === "external" ? safeText(body.externalProviderName, 120) : "",
      externalPaymentUrl,
      amountMode: body.amountMode === "fixed" ? "fixed" : "variable",
      fixedAmount:
        typeof body.fixedAmount === "number" && Number.isFinite(body.fixedAmount)
          ? Math.max(0, Math.min(body.fixedAmount, 1_000_000))
          : 0,
      currency: "USD",
      knowledgeSummary: safeText(body.knowledgeSummary, 1000),
    };

    if (!params.businessName) {
      return NextResponse.json({ error: "El nombre del negocio es obligatorio." }, { status: 400 });
    }
    if (!/^\+[1-9]\d{7,14}$/.test(params.whatsappNumber)) {
      return NextResponse.json(
        { error: "WhatsApp debe incluir código de país, por ejemplo +593987654321." },
        { status: 400 }
      );
    }
    if (params.paymentProvider === "external" && !params.externalProviderName) {
      return NextResponse.json(
        { error: "Indica el nombre del proveedor de pago del comercio." },
        { status: 400 }
      );
    }

    const flow = generateFlexibleOnboardingFlow(params);
    const validation = validateWorkflow(flow.nodes, flow.edges);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "El flujo generado no superó la validación.", validation },
        { status: 422 }
      );
    }

    const supabase = createServiceRoleClient();
    const detectedKnowledge = normalizeKnowledge(body.detectedKnowledge);
    const isDemo = body.isDemo === true;
    const planCode = isDemo ? "demo" : "onboarding";

    const { data: requestRow, error: requestError } = await supabase
      .from("subscription_requests")
      .insert({
        selected_plan: planCode,
        selected_plan_label: isDemo ? "Prueba / Demo" : "Configuración de cliente",
        selected_plan_price: 0,
        full_name: session.name || session.email.split("@")[0],
        country_code: params.whatsappNumber.startsWith("+593")
          ? "593"
          : params.whatsappNumber.replace(/\D/g, "").slice(0, 3),
        phone_number: params.whatsappNumber,
        email: session.email.toLowerCase(),
        document_id: isDemo ? "DEMO" : "ONBOARDING",
        business_name: params.businessName,
        business_type: params.businessType || null,
        payment_provider: params.paymentProvider,
        payphone_business_status:
          params.paymentProvider === "payphone" ? "in_process" : "not_configured",
        has_payphone_business: params.paymentProvider === "payphone" ? "in_process" : "no",
        start_payments_config: params.paymentProvider === "payphone",
        consent_accepted: true,
        consent_accepted_at: new Date().toISOString(),
        subscription_status: "activated",
      })
      .select("id")
      .single();
    if (requestError) {
      throw new Error(`No se pudo crear el registro del cliente: ${requestError.message}`);
    }
    createdRequestId = String(requestRow.id);

    const { data: existingClient, error: existingError } = await supabase
      .from("client_accounts")
      .select("id")
      .eq("owner_user_id", session.userId)
      .ilike("business_name", params.businessName)
      .limit(1)
      .maybeSingle();
    if (existingError) {
      throw new Error(`No se pudo consultar el cliente: ${existingError.message}`);
    }

    if (existingClient?.id) {
      createdClientId = String(existingClient.id);
      const { error } = await supabase
        .from("client_accounts")
        .update({
          subscription_request_id: createdRequestId,
          business_type: params.businessType || null,
          owner_email: session.email.toLowerCase(),
          owner_phone: params.whatsappNumber,
          plan_code: planCode,
          payment_provider: params.paymentProvider,
          status: "active",
        })
        .eq("id", createdClientId);
      if (error) throw new Error(`No se pudo actualizar el cliente: ${error.message}`);
    } else {
      const { data: clientRow, error: clientError } = await supabase
        .from("client_accounts")
        .insert({
          owner_user_id: session.userId,
          subscription_request_id: createdRequestId,
          business_name: params.businessName,
          business_type: params.businessType || null,
          owner_email: session.email.toLowerCase(),
          owner_phone: params.whatsappNumber,
          plan_code: planCode,
          payment_provider: params.paymentProvider,
          status: "active",
        })
        .select("id")
        .single();
      if (clientError) throw new Error(`No se pudo guardar el cliente: ${clientError.message}`);
      createdClientId = String(clientRow.id);
      clientWasCreated = true;
    }

    const { error: requestLinkError } = await supabase
      .from("subscription_requests")
      .update({ activated_client_id: createdClientId })
      .eq("id", createdRequestId);
    if (requestLinkError) {
      throw new Error(`No se pudo vincular el cliente: ${requestLinkError.message}`);
    }

    const requestedProjectId =
      typeof body.projectId === "string" ? body.projectId.trim() : "";
    if (requestedProjectId) {
      const { data: ownedProject, error } = await supabase
        .from("projects")
        .select("id")
        .eq("id", requestedProjectId)
        .eq("user_id", session.userId)
        .maybeSingle();
      if (error) throw new Error(`No se pudo validar el proyecto: ${error.message}`);
      if (!ownedProject) throw new Error("Project not found");
      createdProjectId = requestedProjectId;
    } else {
      const { data: projectRow, error: projectError } = await supabase
        .from("projects")
        .insert({
          user_id: session.userId,
          name: params.businessName,
          description: flow.description,
        })
        .select("id")
        .single();
      if (projectError) {
        throw new Error(`No se pudo guardar el proyecto: ${projectError.message}`);
      }
      createdProjectId = String(projectRow.id);
      projectWasCreated = true;
    }

    const { data: workflowRow, error: workflowError } = await supabase
      .from("workflows")
      .insert({
        project_id: createdProjectId,
        name: flow.name,
        nodes: flow.nodes,
        edges: flow.edges,
      })
      .select("id")
      .single();
    if (workflowError) {
      throw new Error(`No se pudo guardar el flujo: ${workflowError.message}`);
    }
    createdWorkflowId = String(workflowRow.id);

    const { data: existingCatalog, error: catalogLookupError } = await supabase
      .from("catalogs")
      .select("id")
      .eq("client_id", createdClientId)
      .maybeSingle();
    if (catalogLookupError) {
      throw new Error(`No se pudo consultar el catálogo: ${catalogLookupError.message}`);
    }

    let catalogId = existingCatalog?.id ? String(existingCatalog.id) : "";
    if (!catalogId) {
      const catalogSlug = `${slugifyCatalog(params.businessName)}-${createdClientId
        .replace(/-/g, "")
        .slice(-6)}`;
      const { data: catalogRow, error: catalogError } = await supabase
        .from("catalogs")
        .insert({
          client_id: createdClientId,
          business_name: params.businessName,
          slug: catalogSlug,
          description: params.knowledgeSummary || params.productOrService || null,
          currency: "USD",
          status: "draft",
        })
        .select("id")
        .single();
      if (catalogError) {
        throw new Error(`No se pudo crear el catálogo: ${catalogError.message}`);
      }
      catalogId = String(catalogRow.id);
    }

    const productRows = (detectedKnowledge.products || [])
      .map((product, index) => {
        const name = safeText(product.name, 180);
        if (!name) return null;
        const sku = safeText(product.sku, 80) || null;
        return {
          client_id: createdClientId,
          catalog_id: catalogId,
          category_id: null,
          name,
          slug: `${slugifyCatalog(name)}-${
            sku ? slugifyCatalog(sku).slice(0, 12) : index + 1
          }`,
          description: safeText(product.description, 1000) || null,
          sku,
          price: Math.max(0, safeNumber(product.price)),
          currency: safeText(product.currency, 3).toUpperCase() || "USD",
          stock: Math.max(0, Math.trunc(safeNumber(product.stock))),
          track_inventory: product.stock !== undefined,
          active: true,
          metadata: {
            category: safeText(product.category, 120) || null,
            source: "onboarding",
          },
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    if (productRows.length) {
      const { error: productsError } = await supabase
        .from("catalog_products")
        .upsert(productRows, { onConflict: "catalog_id,slug" });
      if (productsError) {
        throw new Error(`No se pudieron guardar los productos: ${productsError.message}`);
      }
    }

    const promotions = Array.isArray(body.knowledgeSources)
      ? body.knowledgeSources
          .map((source: unknown) =>
            safeText((source as { rawText?: unknown })?.rawText, 4000)
          )
          .filter((text: string) => /promoci[oó]n|descuento|oferta/i.test(text))
      : [];

    await insertAudit({
      supabase,
      userId: session.userId,
      clientId: createdClientId,
      action: "onboarding_completed",
      entityType: "client_account",
      entityId: createdClientId,
      ip,
      metadata: {
        business_name: params.businessName,
        workflow_id: createdWorkflowId,
        workflow_name: flow.name,
        project_id: createdProjectId,
        subscription_request_id: createdRequestId,
        payment_provider: params.paymentProvider,
        confirmation_mode: params.confirmationMode,
        is_demo: isDemo,
        products_imported: productRows.length,
        services_detected: detectedKnowledge.services?.length || 0,
        faqs_detected: detectedKnowledge.faqs?.length || 0,
        promotions,
      },
    });

    await insertAudit({
      supabase,
      userId: session.userId,
      clientId: createdClientId,
      action: "workflow_created",
      entityType: "workflow",
      entityId: createdWorkflowId,
      ip,
      metadata: {
        business_name: params.businessName,
        workflow_name: flow.name,
        payment_provider: params.paymentProvider,
        node_count: flow.nodes.length,
        edge_count: flow.edges.length,
      },
    });

    return NextResponse.json({
      ok: true,
      workflow_id: createdWorkflowId,
      project_id: createdProjectId,
      client_id: createdClientId,
      subscription_request_id: createdRequestId,
      name: flow.name,
      node_count: flow.nodes.length,
      edge_count: flow.edges.length,
      products_imported: productRows.length,
      payment_provider: params.paymentProvider,
      confirmation_mode: params.confirmationMode,
      message: `Cliente, catálogo y flujo “${flow.name}” guardados correctamente.`,
    });
  } catch (error) {
    console.error("[persistent-onboarding] error", error);
    try {
      const supabase = createServiceRoleClient();
      if (createdWorkflowId) {
        await supabase.from("workflows").delete().eq("id", createdWorkflowId);
      }
      if (projectWasCreated && createdProjectId) {
        await supabase.from("projects").delete().eq("id", createdProjectId);
      }
      if (clientWasCreated && createdClientId) {
        await supabase.from("client_accounts").delete().eq("id", createdClientId);
        if (createdRequestId) {
          await supabase.from("subscription_requests").delete().eq("id", createdRequestId);
        }
      }
    } catch (cleanupError) {
      console.error("[persistent-onboarding] rollback failed", cleanupError);
    }
    const detail = error instanceof Error ? error.message : GENERIC_ERROR;
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
