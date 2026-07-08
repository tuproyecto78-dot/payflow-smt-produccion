"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { EditorView } from "@/components/editor/editor-view";
import type { WorkflowSummary } from "@/stores/app-store";
import { Loader2, ArrowLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  isDemoWorkflowId,
  getDemoWorkflowById,
  demoWhatsappAiPaymentFlow,
} from "@/lib/workflows/demo-whatsapp-ai-payment-flow";

interface WorkflowData {
  id: string;
  name: string;
  projectId: string;
  nodes: unknown[];
  edges: unknown[];
  createdAt: string;
  updatedAt: string;
}

export default function WorkflowEditorPage() {
  const params = useParams<{ id: string }>();
  const [workflow, setWorkflow] = useState<WorkflowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.id) return;
    loadWorkflow(params.id);
  }, [params?.id]);

  async function loadWorkflow(id: string) {
    setLoading(true);
    setError(null);

    // ─── Local demo flow: load from code, no API call ──────────────
    if (isDemoWorkflowId(id)) {
      const demo = getDemoWorkflowById(id);
      if (demo) {
        setWorkflow({
          id: demo.id,
          name: demo.name,
          projectId: "demo-project",
          nodes: demo.nodes,
          edges: demo.edges,
          createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
          updatedAt: new Date().toISOString(),
        });
        setLoading(false);
        return;
      }
    }

    // ─── Real flow: load from API ──────────────────────────────────
    try {
      const res = await fetch(`/api/workflows/${id}`, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "No se pudo cargar el flujo.");
        return;
      }
      const data = await res.json();
      setWorkflow(data.workflow);
    } catch {
      setError("Error de red al cargar el flujo.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Cargando editor de flujo…
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
        <AlertCircle className="size-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground max-w-md">
          {error || "Flujo no encontrado."}
        </p>
        <Link href="/dashboard/flujos">
          <Button variant="outline" size="sm">
            <ArrowLeft className="size-4 mr-2" />
            Volver a Flujos
          </Button>
        </Link>
      </div>
    );
  }

  const workflowSummary: WorkflowSummary = {
    id: workflow.id,
    name: workflow.name,
    projectId: workflow.projectId,
    updatedAt: workflow.updatedAt,
  };

  const isDemo = isDemoWorkflowId(workflow.id);

  return (
    <div className="h-screen flex flex-col" style={{ height: "100vh" }}>
      {/* Top bar with back button */}
      <div className="shrink-0 border-b border-border bg-card/50 backdrop-blur px-3 py-2 flex items-center gap-2">
        <Link href="/dashboard/flujos">
          <Button variant="ghost" size="sm" className="h-8 text-xs">
            <ArrowLeft className="size-3.5 mr-1" />
            Flujos
          </Button>
        </Link>
        <span className="text-xs text-muted-foreground">/</span>
        <span className="text-xs font-medium truncate">{workflow.name}</span>
        {isDemo && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            En prueba
          </span>
        )}
      </div>

      {/* Editor fills remaining space */}
      <div className="flex-1 min-h-0 relative">
        <EditorView workflow={workflowSummary} />
      </div>
    </div>
  );
}
