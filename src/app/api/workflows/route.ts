import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth/require-session";
import { getDemoFlowItem, isDemoWorkflowId } from "@/lib/workflows/demo-whatsapp-ai-payment-flow";
import { getSupabaseServer, supabaseListWorkflows } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type FlowItem = {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  nodeCount: number;
  status: string;
  provider: string | null;
  channel: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function inspectNodes(nodes: Array<{ type?: string; data?: Record<string, unknown> }>) {
  const paymentNode = nodes.find((node) => node.type === "create_payment" || node.type === "payment");
  const provider = paymentNode?.data?.provider ? String(paymentNode.data.provider) : null;
  return {
    provider,
    channel: nodes.some((node) => node.type === "whatsapp") ? "WhatsApp" : null,
    status: nodes.length ? "active" : "draft",
  };
}

export async function GET() {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workflows: FlowItem[] = [];
  let loadedPersistent = false;

  try {
    const persistent = await supabaseListWorkflows(session.userId);
    if (persistent) {
      loadedPersistent = true;
      for (const workflow of persistent) {
        if (isDemoWorkflowId(workflow.id)) continue;
        let nodes: Array<{ type?: string; data?: Record<string, unknown> }> = [];
        try {
          const parsed = JSON.parse(workflow.nodesJson);
          nodes = Array.isArray(parsed) ? parsed : [];
        } catch {
          nodes = [];
        }
        const details = inspectNodes(nodes);
        workflows.push({
          id: workflow.id,
          name: workflow.name,
          projectId: workflow.projectId,
          projectName: workflow.projectName,
          nodeCount: nodes.length,
          status: details.status,
          provider: details.provider,
          channel: details.channel,
          createdAt: new Date(workflow.createdAt),
          updatedAt: new Date(workflow.updatedAt),
        });
      }
    }
  } catch (error) {
    console.error("[/api/workflows] Supabase list failed", error);
  }

  if (!loadedPersistent) {
    try {
      const projects = await db.project.findMany({
        where: { userId: session.userId },
        select: {
          id: true,
          name: true,
          workflows: {
            select: { id: true, name: true, nodesJson: true, createdAt: true, updatedAt: true },
          },
        },
      });
      for (const project of projects) {
        for (const workflow of project.workflows) {
          if (isDemoWorkflowId(workflow.id)) continue;
          let nodes: Array<{ type?: string; data?: Record<string, unknown> }> = [];
          try {
            const parsed = JSON.parse(workflow.nodesJson || "[]");
            nodes = Array.isArray(parsed) ? parsed : [];
          } catch {
            nodes = [];
          }
          const details = inspectNodes(nodes);
          workflows.push({
            id: workflow.id,
            name: workflow.name,
            projectId: project.id,
            projectName: project.name,
            nodeCount: nodes.length,
            status: details.status,
            provider: details.provider,
            channel: details.channel,
            createdAt: workflow.createdAt,
            updatedAt: workflow.updatedAt,
          });
        }
      }
    } catch (error) {
      console.error("[/api/workflows] Prisma list failed", error);
    }
  }

  const demo = getDemoFlowItem();
  const unique = new Map<string, FlowItem>();
  unique.set(demo.id, demo as FlowItem);
  workflows.forEach((workflow) => unique.set(workflow.id, workflow));
  const result = [...unique.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return NextResponse.json({ workflows: result });
}

export async function POST(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 200) : "Nuevo flujo";
  if (!projectId) return NextResponse.json({ error: "projectId is required." }, { status: 400 });

  try {
    const supabase = getSupabaseServer();
    if (supabase) {
      const { data: project, error: projectError } = await supabase.from("projects")
        .select("id").eq("id", projectId).eq("user_id", session.userId).maybeSingle();
      if (projectError) throw projectError;
      if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
      const { data, error } = await supabase.from("workflows").insert({
        project_id: projectId,
        name,
        nodes: [],
        edges: [],
      }).select("*").single();
      if (error) throw error;
      return NextResponse.json({ workflow: data }, { status: 201 });
    }

    const project = await db.project.findFirst({ where: { id: projectId, userId: session.userId } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const workflow = await db.workflow.create({
      data: { name, projectId, nodesJson: "[]", edgesJson: "[]" },
    });
    return NextResponse.json({ workflow }, { status: 201 });
  } catch (error) {
    console.error("[/api/workflows POST]", error);
    return NextResponse.json({ error: "No se pudo crear el flujo." }, { status: 503 });
  }
}
