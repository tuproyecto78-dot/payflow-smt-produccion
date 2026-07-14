import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import {
  isDemoWorkflowId,
  getDemoWorkflowById,
} from "@/lib/workflows/demo-whatsapp-ai-payment-flow";
import { executeWorkflow } from "@/lib/engine";
import type { PaymentOutcome, FlowNode, FlowEdge } from "@/lib/workflow-types";
import { validateWorkflow } from "@/lib/workflow-validator";

export const dynamic = "force-dynamic";

interface ExecuteBody {
  workflowId?: string;
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  forcePaymentOutcome?: PaymentOutcome;
  questionResponses?: Record<string, string>;
}

/**
 * POST /api/workflows/execute
 *
 * Executes a workflow in Mock mode. Does NOT require DATABASE_URL or Prisma.
 *
 * Behavior:
 *   - If workflowId is the demo id, loads the demo flow from code.
 *   - If nodes/edges are provided in the body, uses those (unsaved changes).
 *   - Executes nodes in order following the edges.
 *   - Supports Mock payment outcomes (no real PayPhone call).
 *   - Does NOT require Z.ai API — AI agent uses mock fallback.
 *   - Returns execution logs + result.
 *
 * Response:
 *   {
 *     success: true,
 *     workflowId: string,
 *     status: "completed" | "failed",
 *     result: "payment_success" | "payment_failed" | "payment_pending" | "error",
 *     logs: Array<{ nodeId, nodeLabel, nodeType, status, message, durationMs }>,
 *     whatsappMessages: Array<{...}>,
 *     variables: Record<string, unknown>
 *   }
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

  const workflowId = body.workflowId || "";

  // ─── Resolve nodes + edges ────────────────────────────────────────
  let nodes: FlowNode[] = [];
  let edges: FlowEdge[] = [];

  // If body provides nodes/edges (unsaved editor state), use them.
  if (Array.isArray(body.nodes) && body.nodes.length > 0) {
    nodes = body.nodes;
    edges = Array.isArray(body.edges) ? body.edges : [];
  } else if (isDemoWorkflowId(workflowId)) {
    // Load demo flow from code.
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
    // Execute the workflow in Mock mode.
    const result = await executeWorkflow(nodes, edges, {
      forcePaymentOutcome: body.forcePaymentOutcome,
      questionResponses: body.questionResponses,
    });

    // Build a clean logs array for the UI (guard against undefined entries).
    // Add timestamps if missing so the ExecutionLog component can format them.
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

    // Determine the final payment result.
    const paymentOutcome =
      (result?.variables?.payment_outcome as string) ||
      (result?.variables?.payment_status as string) ||
      "unknown";

    return NextResponse.json({
      success: true,
      workflowId,
      status: result?.status === "success" ? "completed" : result?.status || "failed",
      result: paymentOutcome,
      logs,
      whatsappMessages: result?.whatsappMessages || [],
      variables: result?.variables || {},
      finalNode: result?.finalNode,
      error: result?.error,
    });
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
