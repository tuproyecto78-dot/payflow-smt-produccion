import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import {
  isDemoWorkflowId,
  getDemoWorkflowById,
} from "@/lib/workflows/demo-whatsapp-ai-payment-flow";
import { executeWorkflow, type AiDeliveryMode } from "@/lib/engine";
import { createServiceRoleClient } from "@/lib/supabase";
import type { PaymentOutcome, FlowNode, FlowEdge } from "@/lib/workflow-types";
import { validateWorkflow } from "@/lib/workflow-validator";

export const dynamic = "force-dynamic";

interface ExecuteBody {
  workflowId?: string;
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  forcePaymentOutcome?: PaymentOutcome;
  questionResponses?: Record<string, string>;
  clientMessage?: string;
  aiMode?: AiDeliveryMode;
}

function normalizeAiMode(value: unknown): AiDeliveryMode {
  if (value === "assisted" || value === "automatic") return value;
  return "simulation";
}

async function resolveWorkflowClientId(input: {
  workflowId: string;
  sessionUserId: string;
  sessionClientId: string | null;
}): Promise<string | null> {
  if (input.sessionClientId) return input.sessionClientId;
  if (!input.workflowId || isDemoWorkflowId(input.workflowId)) return null;

  const supabase = createServiceRoleClient();

  // Primary link: workflow audit written by the persistent onboarding.
  const { data: workflowAudit, error: auditError } = await supabase
    .from("audit_logs")
    .select("client_id")
    .eq("entity_type", "workflow")
    .eq("entity_id", input.workflowId)
    .not("client_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (auditError) {
    console.error("[workflow execute] audit client lookup failed", auditError.message);
  }
  if (workflowAudit?.client_id) return String(workflowAudit.client_id);

  // Secondary link: onboarding_completed metadata contains the workflow id.
  const { data: onboardingAudit, error: onboardingError } = await supabase
    .from("audit_logs")
    .select("client_id")
    .eq("action", "onboarding_completed")
    .contains("metadata", { workflow_id: input.workflowId })
    .not("client_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (onboardingError) {
    console.error("[workflow execute] onboarding client lookup failed", onboardingError.message);
  }
  if (onboardingAudit?.client_id) return String(onboardingAudit.client_id);

  // Final safe fallback for older records: project name + owner must match a client.
  const { data: workflow, error: workflowError } = await supabase
    .from("workflows")
    .select("project_id")
    .eq("id", input.workflowId)
    .maybeSingle();
  if (workflowError || !workflow?.project_id) return null;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("name, user_id")
    .eq("id", workflow.project_id)
    .eq("user_id", input.sessionUserId)
    .maybeSingle();
  if (projectError || !project?.name) return null;

  const { data: client, error: clientError } = await supabase
    .from("client_accounts")
    .select("id")
    .eq("owner_user_id", input.sessionUserId)
    .ilike("business_name", String(project.name))
    .limit(1)
    .maybeSingle();
  if (clientError) return null;
  return client?.id ? String(client.id) : null;
}

/**
 * POST /api/workflows/execute
 *
 * - The regular Run button keeps the complete node-by-node simulator.
 * - Messages typed in the WhatsApp simulator use OpenAI with the real catalog
 *   scoped to the client linked to the workflow.
 * - No real WhatsApp message is sent from this endpoint.
 */
export async function POST(req: Request) {
  const session = await requireActiveSession();
  if (!session) {
    return NextResponse.json(
      { error: "Tu sesión expiró. Inicia sesión nuevamente." },
      { status: 401 }
    );
  }

  let body: ExecuteBody = {};
  try {
    body = await req.json();
  } catch {
    // allow empty body
  }

  const workflowId = typeof body.workflowId === "string" ? body.workflowId : "";
  const aiMode = normalizeAiMode(body.aiMode);

  let nodes: FlowNode[] = [];
  let edges: FlowEdge[] = [];

  if (Array.isArray(body.nodes) && body.nodes.length > 0) {
    nodes = body.nodes;
    edges = Array.isArray(body.edges) ? body.edges : [];
  } else if (isDemoWorkflowId(workflowId)) {
    const demo = getDemoWorkflowById(workflowId);
    if (demo) {
      nodes = demo.nodes;
      edges = demo.edges;
    }
  }

  if (nodes.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "No hay nodos para ejecutar. Abre un flujo con nodos o usa el flujo demo.",
      },
      { status: 400 }
    );
  }

  const validation = validateWorkflow(nodes, edges);
  if (!validation.valid) {
    return NextResponse.json(
      { success: false, error: "El flujo tiene conexiones inválidas.", validation },
      { status: 422 }
    );
  }

  try {
    const clientId = await resolveWorkflowClientId({
      workflowId,
      sessionUserId: session.userId,
      sessionClientId: session.clientId,
    });

    const result = await executeWorkflow(nodes, edges, {
      workflowId,
      clientId,
      aiMode,
      forcePaymentOutcome: body.forcePaymentOutcome,
      questionResponses: body.questionResponses,
      clientMessage: typeof body.clientMessage === "string" ? body.clientMessage.slice(0, 4000) : undefined,
    });

    const logs = Array.isArray(result?.entries)
      ? result.entries.map((entry) => ({
          nodeId: entry.nodeId,
          nodeLabel: entry.nodeLabel,
          nodeType: entry.nodeType,
          status: entry.status,
          message: entry.message,
          durationMs: entry.durationMs,
          timestamp: entry.timestamp || new Date().toISOString(),
        }))
      : [];

    const paymentOutcome =
      (result?.variables?.payment_outcome as string) ||
      (result?.variables?.payment_status as string) ||
      "unknown";

    return NextResponse.json({
      success: result?.status === "success",
      workflowId,
      clientId,
      aiMode,
      requiresApproval: result?.variables?.ai_requires_approval === true,
      suggestedResponse: result?.variables?.ai_response || null,
      status: result?.status === "success" ? "completed" : result?.status || "failed",
      result: paymentOutcome,
      logs,
      whatsappMessages: result?.whatsappMessages || [],
      variables: result?.variables || {},
      finalNode: result?.finalNode,
      error: result?.error,
    }, { status: result?.status === "failed" ? 422 : 200 });
  } catch (err) {
    console.error("[/api/workflows/execute] error:", err);
    const message = err instanceof Error ? err.message : "Error interno al ejecutar el flujo.";
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
