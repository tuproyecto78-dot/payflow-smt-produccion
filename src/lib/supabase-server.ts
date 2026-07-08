/**
 * PayFlow SMT — Supabase server-only client (service role).
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY (server-only, NEVER exposed to frontend).
 * Falls back to the anon key if the service role key is not set.
 *
 * Server-only. NEVER import from a Client Component.
 */

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const isSupabaseServerConfigured = Boolean(SUPABASE_URL && (SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY));

let _client: SupabaseClient | null = null;

/**
 * Get a Supabase client with service role privileges (bypasses RLS).
 * Use this for backend operations that need to read/write any table.
 *
 * NEVER expose the service role key to the frontend.
 */
export function getSupabaseServer(): SupabaseClient | null {
  if (!isSupabaseServerConfigured) return null;
  if (_client) return _client;

  const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  _client = createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

/**
 * Try to query the `workflows` table in Supabase.
 * Returns null if Supabase is not configured or the table doesn't exist.
 */
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
    // Try to read workflows joined with projects.
    const { data, error } = await client
      .from("workflows")
      .select(`
        id,
        name,
        nodes_json,
        edges_json,
        created_at,
        updated_at,
        project:projects!inner(id, name, user_id)
      `)
      .eq("project.user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("[supabase-server] listWorkflows error:", error.message);
      return null;
    }

    return (data || []).map((row: Record<string, unknown>) => {
      const project = (row.project as Record<string, unknown>[])?.[0] || (row.project as Record<string, unknown>) || {};
      return {
        id: String(row.id),
        name: String(row.name),
        projectId: String(project.id || ""),
        projectName: String(project.name || "Proyecto"),
        nodesJson: String(row.nodes_json || "[]"),
        edgesJson: String(row.edges_json || "[]"),
        createdAt: String(row.created_at || new Date().toISOString()),
        updatedAt: String(row.updated_at || new Date().toISOString()),
      };
    });
  } catch (err) {
    console.error("[supabase-server] listWorkflows exception:", err);
    return null;
  }
}

/**
 * Try to upsert a demo workflow into Supabase.
 * Returns true on success, false if Supabase is not available or fails.
 */
export async function supabaseUpsertDemoWorkflow(
  userId: string,
  workflow: {
    name: string;
    nodesJson: string;
    edgesJson: string;
  }
): Promise<{ ok: boolean; created: boolean; id?: string; error?: string }> {
  const client = getSupabaseServer();
  if (!client) {
    return { ok: false, created: false, error: "Supabase not configured" };
  }

  try {
    // 1. Find or create a project for this user.
    let projectId: string | null = null;

    const { data: existingProject } = await client
      .from("projects")
      .select("id")
      .eq("user_id", userId)
      .eq("name", "Admin Workspace")
      .limit(1)
      .single();

    if (existingProject) {
      projectId = existingProject.id as string;
    } else {
      const { data: newProject, error: projectErr } = await client
        .from("projects")
        .insert({
          user_id: userId,
          name: "Admin Workspace",
          description: "Proyecto predeterminado del administrador de PayFlow SMT.",
        })
        .select("id")
        .single();

      if (projectErr) {
        return { ok: false, created: false, error: projectErr.message };
      }
      projectId = newProject?.id as string;
    }

    if (!projectId) {
      return { ok: false, created: false, error: "Could not resolve project" };
    }

    // 2. Check if the workflow already exists.
    const { data: existing } = await client
      .from("workflows")
      .select("id")
      .eq("project_id", projectId)
      .eq("name", workflow.name)
      .limit(1)
      .single();

    if (existing) {
      // Update the existing workflow with the latest template.
      await client
        .from("workflows")
        .update({
          nodes_json: workflow.nodesJson,
          edges_json: workflow.edgesJson,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id as string);
      return { ok: true, created: false, id: existing.id as string };
    }

    // 3. Create the workflow.
    const { data: newWf, error: wfErr } = await client
      .from("workflows")
      .insert({
        project_id: projectId,
        name: workflow.name,
        nodes_json: workflow.nodesJson,
        edges_json: workflow.edgesJson,
      })
      .select("id")
      .single();

    if (wfErr) {
      return { ok: false, created: false, error: wfErr.message };
    }
    return { ok: true, created: true, id: newWf?.id as string };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, created: false, error: msg };
  }
}
