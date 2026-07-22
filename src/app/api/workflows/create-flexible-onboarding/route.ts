import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import { getClientIP, sanitizeText, GENERIC_ERROR } from "@/lib/security";
import { validateWorkflow } from "@/lib/workflow-validator";
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

function safeText(value: unknown, max: number) {
  return sanitizeText(typeof value === "string" ? value : "").slice(0, max);
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
    if (!hostname || hostname === "localhost" || hostname === "::1") return false;
    if (hostname.endsWith(".local") || isPrivateIpv4(hostname)) return false;
    return true;
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

export async function POST(req: Request) {
  const session = await requireActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIP(req);

  try {
    const body = await req.json();
    const paymentProvider = normalizeProvider(body.paymentProvider);
    const externalPaymentUrl =
      paymentProvider === "external" && typeof body.externalPaymentUrl === "string"
        ? body.externalPaymentUrl.trim().slice(0, 2048)
        : "";

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
      console.error("[flexible-onboarding] generated invalid flow", validation.issues);
      return NextResponse.json(
        { error: "El flujo generado no superó la validación.", validation },
        { status: 500 }
      );
    }

    let projectId = typeof body.projectId === "string" ? body.projectId : "";

    try {
      const { db } = await import("@/lib/db");
      if (projectId) {
        const existing = await db.project.findFirst({
          where: { id: projectId, userId: session.userId },
          select: { id: true },
        });
        if (!existing) {
          return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }
      } else {
        const project = await db.project.create({
          data: {
            name: params.businessName,
            description: flow.description,
            userId: session.userId,
          },
        });
        projectId = project.id;
      }

      const workflow = await db.workflow.create({
        data: {
          name: flow.name,
          projectId,
          nodesJson: JSON.stringify(flow.nodes),
          edgesJson: JSON.stringify(flow.edges),
        },
      });

      try {
        const { logAudit } = await import("@/lib/audit");
        void logAudit({
          userId: session.userId,
          action: "workflow_created",
          entityType: "workflow",
          entityId: workflow.id,
          ipAddress: ip,
          metadata: {
            onboarding_version: "flexible-v1",
            template_id: params.templateId,
            business_name: params.businessName,
            payment_provider: params.paymentProvider,
            confirmation_mode: params.confirmationMode,
          },
        });
      } catch (auditError) {
        console.warn("[flexible-onboarding] audit log failed", auditError);
      }

      return NextResponse.json({
        ok: true,
        workflow_id: workflow.id,
        project_id: projectId,
        name: flow.name,
        node_count: flow.nodes.length,
        edge_count: flow.edges.length,
        payment_provider: params.paymentProvider,
        confirmation_mode: params.confirmationMode,
        message: `Flujo “${flow.name}” creado correctamente.`,
      });
    } catch (dbError) {
      console.warn("[flexible-onboarding] database unavailable", dbError);
      return NextResponse.json({
        ok: true,
        workflow_id: `flow_${Date.now()}`,
        project_id: projectId || `proj_${Date.now()}`,
        name: flow.name,
        node_count: flow.nodes.length,
        edge_count: flow.edges.length,
        payment_provider: params.paymentProvider,
        confirmation_mode: params.confirmationMode,
        message: `Flujo “${flow.name}” generado en modo temporal.`,
      });
    }
  } catch (error) {
    console.error("[flexible-onboarding] error", error);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}
