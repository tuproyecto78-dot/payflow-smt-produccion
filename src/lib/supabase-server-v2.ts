import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function sanitizeSupabaseUrl(raw: string): string {
  return (raw || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/(rest|auth)(\/v\d+)?$/i, "");
}

const SUPABASE_URL = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const isSupabaseServerConfigured = Boolean(
  SUPABASE_URL && (SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY)
);

let cachedClient: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient | null {
  if (!isSupabaseServerConfigured) return null;
  if (cachedClient) return cachedClient;
  cachedClient = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  return cachedClient;
}

async function ownedProjectIds(client: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await client
    .from("projects")
    .select("id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data || []).map((row) => String(row.id));
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function supabaseListWorkflows(userId: string): Promise<Array<{
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  nodesJson: string;
  edgesJson: string;
  createdAt: string;
  updatedAt: string;
}> | null> {
  const client = getSupabaseServer();
  if (!client) return null;

  try {
    const projectIds = await ownedProjectIds(client, userId);
    if (!projectIds.length) return [];

    const [workflowsResult, projectsResult] = await Promise.all([
      client
        .from("workflows")
        .select("id,name,project_id,nodes,edges,created_at,updated_at")
        .in("project_id", projectIds)
        .order("updated_at", { ascending: false }),
      client.from("projects").select("id,name").in("id", projectIds),
    ]);
    if (workflowsResult.error) throw workflowsResult.error;
    if (projectsResult.error) throw projectsResult.error;

    const projectNames = new Map(
      (projectsResult.data || []).map((project) => [String(project.id), String(project.name || "Proyecto")])
    );

    return (workflowsResult.data || []).map((row) => ({
      id: String(row.id),
      name: String(row.name || "Flujo"),
      projectId: String(row.project_id || ""),
      projectName: projectNames.get(String(row.project_id)) || "Proyecto",
      nodesJson: JSON.stringify(toArray(row.nodes)),
      edgesJson: JSON.stringify(toArray(row.edges)),
      createdAt: String(row.created_at || new Date().toISOString()),
      updatedAt: String(row.updated_at || row.created_at || new Date().toISOString()),
    }));
  } catch (error) {
    console.error("[supabase-workflows] list", error);
    return null;
  }
}

export async function supabaseUpsertDemoWorkflow(
  userId: string,
  workflow: { name: string; nodesJson: string; edgesJson: string }
): Promise<{ ok: boolean; created: boolean; id?: string; error?: string }> {
  const client = getSupabaseServer();
  if (!client) return { ok: false, created: false, error: "Supabase not configured" };

  try {
    let projectId = (await ownedProjectIds(client, userId))[0] || "";
    if (!projectId) {
      const { data, error } = await client.from("projects").insert({
        user_id: userId,
        name: "Admin Workspace",
        description: "Proyecto predeterminado de PayFlow SMT.",
      }).select("id").single();
      if (error) throw error;
      projectId = String(data.id);
    }

    const { data: existing, error: lookupError } = await client
      .from("workflows")
      .select("id")
      .eq("project_id", projectId)
      .eq("name", workflow.name)
      .limit(1)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (existing?.id) {
      const { error } = await client.from("workflows").update({
        nodes: toArray(workflow.nodesJson),
        edges: toArray(workflow.edgesJson),
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
      if (error) throw error;
      return { ok: true, created: false, id: String(existing.id) };
    }

    const { data, error } = await client.from("workflows").insert({
      project_id: projectId,
      name: workflow.name,
      nodes: toArray(workflow.nodesJson),
      edges: toArray(workflow.edgesJson),
    }).select("id").single();
    if (error) throw error;
    return { ok: true, created: true, id: String(data.id) };
  } catch (error) {
    return { ok: false, created: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function supabaseGetWorkflow(
  workflowId: string,
  userId: string
): Promise<{ ok: boolean; error?: string; workflow?: Record<string, unknown> }> {
  const client = getSupabaseServer();
  if (!client) return { ok: false, error: "Supabase not configured" };
  try {
    const projectIds = await ownedProjectIds(client, userId);
    if (!projectIds.length) return { ok: false, error: "Not found" };
    const { data, error } = await client
      .from("workflows")
      .select("*")
      .eq("id", workflowId)
      .in("project_id", projectIds)
      .maybeSingle();
    if (error) throw error;
    return data ? { ok: true, workflow: data } : { ok: false, error: "Not found" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function supabaseUpdateWorkflow(
  workflowId: string,
  userId: string,
  patch: { name?: string; nodes?: unknown[]; edges?: unknown[] }
): Promise<{ ok: boolean; error?: string; workflow?: Record<string, unknown> }> {
  const client = getSupabaseServer();
  if (!client) return { ok: false, error: "Supabase not configured" };
  try {
    const projectIds = await ownedProjectIds(client, userId);
    if (!projectIds.length) return { ok: false, error: "Not found" };
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) updateData.name = patch.name;
    if (patch.nodes !== undefined) updateData.nodes = patch.nodes;
    if (patch.edges !== undefined) updateData.edges = patch.edges;

    const { data, error } = await client
      .from("workflows")
      .update(updateData)
      .eq("id", workflowId)
      .in("project_id", projectIds)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? { ok: true, workflow: data } : { ok: false, error: "Not found" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
