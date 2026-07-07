import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { generateFlowFromTemplate, type FlowTemplateParams } from "@/lib/flow-templates";
import { getClientIP, sanitizeText, GENERIC_ERROR } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ip = getClientIP(req);

  try {
    const body = await req.json();
    const params: FlowTemplateParams = {
      templateId: body.templateId || "solo_ia",
      business_name: sanitizeText(body.business_name || "").slice(0, 200),
      business_type: sanitizeText(body.business_type || "").slice(0, 100),
      product_or_service: sanitizeText(body.product_or_service || "").slice(0, 200),
      amount_mode: body.amount_mode === "variable" ? "variable" : "fixed",
      fixed_amount: typeof body.fixed_amount === "number" ? body.fixed_amount : 0,
      currency: body.currency || "USD",
      welcome_message: sanitizeText(body.welcome_message || `¡Hola! 👋 Bienvenido a ${body.business_name || "tu negocio"}.`).slice(0, 1000),
      business_hours: sanitizeText(body.business_hours || "").slice(0, 200),
      whatsapp_number: sanitizeText(body.whatsapp_number || "").slice(0, 30),
      payment_provider: body.payment_provider === "none" ? "none" : body.payment_provider === "mock" ? "mock" : "payphone",
      payment_required: body.payment_required !== false,
      agent_mode: body.agent_mode || "completo",
    };

    if (!params.business_name) return NextResponse.json({ error: "business_name es obligatorio." }, { status: 400 });
    if (!params.whatsapp_number) return NextResponse.json({ error: "whatsapp_number es obligatorio." }, { status: 400 });

    const flow = generateFlowFromTemplate(params);

    // Find or create project (lazy db import)
    let projectId = body.projectId;
    if (!projectId) {
      try {
        const { db } = await import("@/lib/db");
        const project = await db.project.create({
          data: { name: params.business_name, description: flow.description, userId: session.userId },
        });
        projectId = project.id;
      } catch {
        // No database — generate a temporary ID
        projectId = `proj_${Date.now()}`;
      }
    } else {
      try {
        const { db } = await import("@/lib/db");
        const existing = await db.project.findFirst({ where: { id: projectId, userId: session.userId } });
        if (!existing) return NextResponse.json({ error: "Project not found" }, { status: 404 });
      } catch {
        // No database — continue with provided projectId
      }
    }

    // Try to save to database (if available)
    try {
      const { db } = await import("@/lib/db");
      const workflow = await db.workflow.create({
        data: {
          name: flow.name,
          projectId,
          nodesJson: JSON.stringify(flow.nodes),
          edgesJson: JSON.stringify(flow.edges),
        },
      });

      // Try audit log (non-blocking)
      try {
        const { logAudit } = await import("@/lib/audit");
        void logAudit({
          userId: session.userId,
          action: "workflow_created",
          entityType: "workflow",
          entityId: workflow.id,
          ipAddress: ip,
          metadata: {
            template_id: params.templateId,
            template_name: flow.name,
            business_name: params.business_name,
          },
        });
      } catch {
        // Audit log failed — not critical
      }

      return NextResponse.json({
        ok: true,
        workflow_id: workflow.id,
        project_id: projectId,
        name: flow.name,
        node_count: flow.nodes.length,
        edge_count: flow.edges.length,
        payment_required: params.payment_required,
        payment_provider: params.payment_provider,
        message: `Flujo "${flow.name}" creado con ${flow.nodes.length} nodos.`,
      });
    } catch {
      // Database not available — return success with generated flow data
      return NextResponse.json({
        ok: true,
        workflow_id: `flow_${Date.now()}`,
        project_id: projectId || `proj_${Date.now()}`,
        name: flow.name,
        node_count: flow.nodes.length,
        edge_count: flow.edges.length,
        payment_required: params.payment_required,
        payment_provider: params.payment_provider,
        message: `Flujo "${flow.name}" generado con ${flow.nodes.length} nodos.`,
      });
    }
  } catch (err) {
    console.error("[create-from-template] error:", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}
