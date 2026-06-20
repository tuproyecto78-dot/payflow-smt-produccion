// Repositorio de Supabase para PayFlow SMT.
import { createServerClientHelper } from "./supabase";
import type { User } from "@supabase/supabase-js";

export async function listProjects(user: User) {
  const supabase = await createServerClientHelper();
  const { data, error } = await supabase.from("projects").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function getProject(user: User, id: string) {
  const supabase = await createServerClientHelper();
  const { data, error } = await supabase.from("projects").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  return data;
}
export async function createProject(user: User, name: string, description?: string) {
  const supabase = await createServerClientHelper();
  const { data, error } = await supabase.from("projects").insert({ user_id: user.id, name, description: description||null }).select().single();
  if (error) throw error;
  return data;
}
export async function updateProject(user: User, id: string, patch: Record<string, unknown>) {
  const supabase = await createServerClientHelper();
  const { data, error } = await supabase.from("projects").update(patch).eq("id", id).eq("user_id", user.id).select().single();
  if (error) throw error;
  return data;
}
export async function deleteProject(user: User, id: string) {
  const supabase = await createServerClientHelper();
  const { error } = await supabase.from("projects").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw error;
}
export async function listWorkflowsByProject(user: User, projectId: string) {
  const supabase = await createServerClientHelper();
  const { data, error } = await supabase.from("workflows").select("*").eq("user_id", user.id).eq("project_id", projectId).order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function getWorkflow(user: User, id: string) {
  const supabase = await createServerClientHelper();
  const { data, error } = await supabase.from("workflows").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  return data;
}
export async function createWorkflow(user: User, projectId: string, name: string) {
  const supabase = await createServerClientHelper();
  const { data, error } = await supabase.from("workflows").insert({ user_id: user.id, project_id: projectId, name, nodes: [], edges: [], status: "draft" }).select().single();
  if (error) throw error;
  return data;
}
export async function updateWorkflow(user: User, id: string, patch: Record<string, unknown>) {
  const supabase = await createServerClientHelper();
  const { data, error } = await supabase.from("workflows").update(patch).eq("id", id).eq("user_id", user.id).select().single();
  if (error) throw error;
  return data;
}
export async function deleteWorkflow(user: User, id: string) {
  const supabase = await createServerClientHelper();
  const { error } = await supabase.from("workflows").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw error;
}
export async function createWorkflowRun(user: User, workflowId: string, input: Record<string, unknown> = {}) {
  const supabase = await createServerClientHelper();
  const { data, error } = await supabase.from("workflow_runs").insert({ user_id: user.id, workflow_id: workflowId, status: "running", input, output: {} }).select().single();
  if (error) throw error;
  return data;
}
export async function finishWorkflowRun(user: User, runId: string, status: string, output: Record<string, unknown>) {
  const supabase = await createServerClientHelper();
  const { error } = await supabase.from("workflow_runs").update({ status, output, finished_at: new Date().toISOString() }).eq("id", runId).eq("user_id", user.id);
  if (error) throw error;
}
export async function listWorkflowRuns(user: User, workflowId?: string) {
  const supabase = await createServerClientHelper();
  let q = supabase.from("workflow_runs").select("*, workflows(name)").eq("user_id", user.id).order("started_at", { ascending: false }).limit(50);
  if (workflowId) q = q.eq("workflow_id", workflowId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
export async function getWorkflowRun(user: User, runId: string) {
  const supabase = await createServerClientHelper();
  const { data, error } = await supabase.from("workflow_runs").select("*").eq("id", runId).eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  return data;
}
export async function createExecutionLogs(user: User, runId: string, workflowId: string, logs: any[]) {
  if (logs.length === 0) return;
  const supabase = await createServerClientHelper();
  const rows = logs.map((l) => ({ user_id: user.id, workflow_run_id: runId, workflow_id: workflowId, node_id: l.node_id, node_type: l.node_type, node_label: l.node_label, status: l.status, message: l.message, input: l.input||{}, output: l.output||{} }));
  const { error } = await supabase.from("execution_logs").insert(rows);
  if (error) throw error;
}
export async function listExecutionLogs(user: User, runId: string) {
  const supabase = await createServerClientHelper();
  const { data, error } = await supabase.from("execution_logs").select("*").eq("user_id", user.id).eq("workflow_run_id", runId).order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}
export async function createPaymentTransaction(user: User, row: Record<string, unknown>): Promise<string> {
  const supabase = await createServerClientHelper();
  const { data, error } = await supabase.from("payment_transactions").insert({ user_id: user.id, ...row }).select("id").single();
  if (error) throw error;
  return (data as any).id;
}
export async function updatePaymentTransaction(user: User, id: string, patch: Record<string, unknown>) {
  const supabase = await createServerClientHelper();
  const { error } = await supabase.from("payment_transactions").update(patch).eq("id", id).eq("user_id", user.id);
  if (error) throw error;
}
