import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth/require-session";
import { isDemoWorkflowId, getDemoWorkflowById } from "@/lib/workflows/demo-whatsapp-ai-payment-flow";
import { getSupabaseServer, supabaseGetWorkflow, supabaseUpdateWorkflow } from "@/lib/supabase-server";
import { validateWorkflow } from "@/lib/workflow-validator";
import type { FlowEdge, FlowNode } from "@/lib/workflow-types";

async function getOwnedPrismaWorkflow(workflowId: string, userId: string) {
  const workflow = await db.workflow.findUnique({ where: { id: workflowId }, include: { project: true } });
  return workflow && workflow.project.userId === userId ? workflow : null;
}

function normalizeNodes(value: unknown): FlowNode[] {
  if (!Array.isArray(value)) return [];
  return value.map((node, index) => {
    const item = node as Record<string, unknown>;
    const position = item.position as { x?: unknown; y?: unknown } | undefined;
    return {
      id: String(item.id || `node_${index}`),
      type: String(item.type || "message") as FlowNode["type"],
      position: {
        x: typeof position?.x === "number" ? position.x : 0,
        y: typeof position?.y === "number" ? position.y : 0,
      },
      data: item.data && typeof item.data === "object" ? item.data as Record<string, unknown> : {},
    };
  });
}

function normalizeEdges(value: unknown): FlowEdge[] {
  if (!Array.isArray(value)) return [];
  return value.map((edge, index) => {
    const item = edge as Record<string, unknown>;
    return {
      id: String(item.id || `edge_${index}`),
      source: String(item.source || ""),
      target: String(item.target || ""),
      sourceHandle: item.sourceHandle == null ? null : String(item.sourceHandle),
      targetHandle: item.targetHandle == null ? null : String(item.targetHandle),
    };
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

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

  try {
    const workflow = await getOwnedPrismaWorkflow(id, session.userId);
    if (workflow) {
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
    }
  } catch (error) {
    console.warn("[workflow GET] Prisma unavailable", error instanceof Error ? error.message : String(error));
  }

  const persistent = await supabaseGetWorkflow(id, session.userId);
  if (!persistent.ok || !persistent.workflow) {
    return NextResponse.json({ error: persistent.error || "Not found" }, { status: persistent.error === "Not found" ? 404 : 503 });
  }
  const workflow = persistent.workflow;
  return NextResponse.json({
    workflow: {
      id: String(workflow.id || id),
      name: String(workflow.name || "Flujo"),
      projectId: String(workflow.project_id || ""),
      nodes: normalizeNodes(workflow.nodes),
      edges: normalizeEdges(workflow.edges),
      createdAt: workflow.created_at || new Date().toISOString(),
      updatedAt: workflow.updated_at || workflow.created_at || new Date().toISOString(),
    },
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (isDemoWorkflowId(id)) {
    return NextResponse.json({ error: "El flujo demo es de solo lectura.", code: "DEMO_READONLY" }, { status: 409 });
  }

  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : undefined;
    if (name !== undefined && !name) return NextResponse.json({ error: "El nombre del flujo no puede estar vacío." }, { status: 400 });

    const nodes = body.nodes === undefined ? undefined : normalizeNodes(body.nodes);
    const edges = body.edges === undefined ? undefined : normalizeEdges(body.edges);
    if (nodes && edges) {
      const validation = validateWorkflow(nodes, edges);
      if (!validation.valid) {
        return NextResponse.json({ error: "El flujo contiene conexiones inválidas.", validation }, { status: 422 });
      }
    }

    try {
      const workflow = await getOwnedPrismaWorkflow(id, session.userId);
      if (workflow) {
        const updated = await db.workflow.update({
          where: { id },
          data: {
            ...(name !== undefined ? { name } : {}),
            ...(nodes !== undefined ? { nodesJson: JSON.stringify(nodes) } : {}),
            ...(edges !== undefined ? { edgesJson: JSON.stringify(edges) } : {}),
          },
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
      }
    } catch (error) {
      console.warn("[workflow PUT] Prisma unavailable", error instanceof Error ? error.message : String(error));
    }

    const result = await supabaseUpdateWorkflow(id, session.userId, { name, nodes, edges });
    if (!result.ok || !result.workflow) {
      return NextResponse.json({ error: result.error || "No se pudo guardar el flujo." }, { status: result.error === "Not found" ? 404 : 503 });
    }
    const workflow = result.workflow;
    return NextResponse.json({
      workflow: {
        id: String(workflow.id || id),
        name: String(workflow.name || name || "Flujo"),
        projectId: String(workflow.project_id || ""),
        nodes: normalizeNodes(workflow.nodes),
        edges: normalizeEdges(workflow.edges),
        updatedAt: workflow.updated_at || new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[workflow PUT]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar el flujo." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (isDemoWorkflowId(id)) return NextResponse.json({ error: "El demo no se elimina." }, { status: 409 });

  try {
    const workflow = await getOwnedPrismaWorkflow(id, session.userId);
    if (workflow) {
      await db.workflow.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    }
  } catch (error) {
    console.warn("[workflow DELETE] Prisma unavailable", error instanceof Error ? error.message : String(error));
  }

  const supabase = getSupabaseServer();
  if (!supabase) return NextResponse.json({ error: "Base de datos no disponible." }, { status: 503 });
  const { data: projects, error: projectsError } = await supabase.from("projects").select("id").eq("user_id", session.userId);
  if (projectsError) return NextResponse.json({ error: projectsError.message }, { status: 503 });
  const projectIds = (projects || []).map((project) => String(project.id));
  if (!projectIds.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { error, count } = await supabase.from("workflows").delete({ count: "exact" }).eq("id", id).in("project_id", projectIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 503 });
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
