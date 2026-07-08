import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  isDemoWorkflowId,
} from "@/lib/workflows/demo-whatsapp-ai-payment-flow";

async function getOwnedWorkflow(workflowId: string, userId: string) {
  const workflow = await db.workflow.findUnique({
    where: { id: workflowId },
    include: { project: true },
  });
  if (!workflow || workflow.project.userId !== userId) return null;
  return workflow;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  // ─── Local demo flow: return from code, no DB lookup ─────────────
  if (isDemoWorkflowId(id)) {
    const demo = getDemoWorkflowById(id);
    if (demo) {
      return NextResponse.json({
        workflow: {
          id: demo.id,
          name: demo.name,
          projectId: "demo-project",
          nodes: demo.nodes,
          edges: demo.edges,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date(),
        },
      });
    }
  }

  // ─── Real flow: lookup in DB ─────────────────────────────────────
  try {
    const workflow = await getOwnedWorkflow(id, session.userId);
    if (!workflow) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      workflow: {
        id: workflow.id,
        name: workflow.name,
        projectId: workflow.projectId,
        nodes: JSON.parse(workflow.nodesJson || "[]"),
        edges: JSON.parse(workflow.edgesJson || "[]"),
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt,
      },
    });
  } catch (err) {
    console.error("[/api/workflows/[id] GET] DB error:", err);
    return NextResponse.json({ error: "No se pudo cargar el flujo." }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  // ─── Demo flow: can't save to DB (read-only local demo) ──────────
  if (isDemoWorkflowId(id)) {
    return NextResponse.json(
      {
        error:
          "Este es un flujo demo local de solo lectura. Los cambios no se guardan en la base de datos.",
        code: "DEMO_READONLY",
      },
      { status: 404 }
    );
  }

  try {
    const workflow = await getOwnedWorkflow(id, session.userId);
    if (!workflow) {
      console.warn("[workflow PUT] workflow not found or not owned:", {
        workflowId: id,
        userId: session.userId,
      });
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const trimmed = body.name.trim();
      if (trimmed.length === 0) {
        return NextResponse.json(
          { error: "El nombre del flujo no puede estar vacío." },
          { status: 400 }
        );
      }
      data.name = trimmed.slice(0, 200);
    }

    // Validate + sanitize nodes array (accept any node type, including ai_agent).
    if (Array.isArray(body.nodes)) {
      // Each node must have id, type, position. Data can contain any fields
      // (systemPrompt, prompt, inputVariable, outputVariable, etc.).
      // We do NOT reject AI agent nodes — they're fully supported.
      const sanitizedNodes = body.nodes.map((n: Record<string, unknown>, idx: number) => {
        if (!n || typeof n !== "object") {
          throw new Error(`Nodo en posición ${idx} inválido.`);
        }
        const nodeId = String(n.id || `node_${idx}`);
        const nodeType = String(n.type || "message");
        const position = n.position as { x?: number; y?: number } | undefined;
        return {
          id: nodeId,
          type: nodeType,
          position: {
            x: typeof position?.x === "number" ? position.x : 0,
            y: typeof position?.y === "number" ? position.y : 0,
          },
          data: (n.data as Record<string, unknown>) || {},
        };
      });
      data.nodesJson = JSON.stringify(sanitizedNodes);
    }

    if (Array.isArray(body.edges)) {
      const sanitizedEdges = body.edges.map((e: Record<string, unknown>, idx: number) => {
        if (!e || typeof e !== "object") {
          throw new Error(`Conexión en posición ${idx} inválida.`);
        }
        return {
          id: String(e.id || `edge_${idx}`),
          source: String(e.source || ""),
          target: String(e.target || ""),
          sourceHandle: (e.sourceHandle as string) ?? null,
          targetHandle: (e.targetHandle as string) ?? null,
        };
      });
      data.edgesJson = JSON.stringify(sanitizedEdges);
    }

    const updated = await db.workflow.update({
      where: { id },
      data,
    });
    // Touch project updatedAt
    await db.project.update({
      where: { id: workflow.projectId },
      data: { updatedAt: new Date() },
    });

    console.log("[workflow PUT] saved successfully:", {
      workflowId: id,
      nodeCount: Array.isArray(body.nodes) ? body.nodes.length : 0,
      edgeCount: Array.isArray(body.edges) ? body.edges.length : 0,
    });

    return NextResponse.json({
      workflow: {
        id: updated.id,
        name: updated.name,
        projectId: updated.projectId,
        nodes: JSON.parse(updated.nodesJson || "[]"),
        edges: JSON.parse(updated.edgesJson || "[]"),
        updatedAt: updated.updatedAt,
      },
    });
  } catch (err) {
    // Log the full error with context for debugging.
    console.error("[workflow PUT] error:", {
      workflowId: id,
      userId: session.userId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });

    // Return a clear, actionable error message.
    const message = err instanceof Error ? err.message : "Failed to save workflow.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const workflow = await getOwnedWorkflow(id, session.userId);
  if (!workflow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.workflow.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
