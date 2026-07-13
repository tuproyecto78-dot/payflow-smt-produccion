"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, Edge, MarkerType, Node } from "reactflow";
import { AlertTriangle, BrainCircuit, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Status = "healthy" | "warning" | "error";
type Severity = "low" | "medium" | "high";

interface ModuleItem { id: string; label: string; status: Status; detail: string; metric?: string }
interface AlertItem { id: string; module: string; title: string; detail: string; severity: Severity; suggestedPrompt: string }
interface ContextResponse { modules: ModuleItem[]; alerts: AlertItem[]; generatedAt: string }

const POSITIONS: Record<string, { x: number; y: number }> = {
  architect: { x: 360, y: 135 },
  supabase: { x: 80, y: 20 },
  clickup: { x: 640, y: 20 },
  payphone: { x: 80, y: 250 },
  whatsapp: { x: 640, y: 250 },
  workflows: { x: 270, y: 300 },
  vercel: { x: 450, y: 300 },
  ai: { x: 360, y: 0 },
};

const STATUS_COLOR: Record<Status, string> = {
  healthy: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
};

const SEVERITY_STYLE: Record<Severity, string> = {
  low: "bg-sky-100 text-sky-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
};

export function ArchitectSystemMap() {
  const [context, setContext] = useState<ContextResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/architect/context", { credentials: "include", cache: "no-store" });
      const data = await res.json();
      if (res.ok) setContext(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const nodes = useMemo<Node[]>(() => (context?.modules || []).map((module) => ({
    id: module.id,
    position: POSITIONS[module.id] || { x: 0, y: 0 },
    draggable: false,
    selectable: false,
    data: {
      label: (
        <div className="min-w-[130px] text-left">
          <div className="flex items-center gap-2 font-semibold text-xs">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[module.status] }} />
            {module.label}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">{module.detail}</p>
          {module.metric && <p className="text-[10px] font-medium mt-1">{module.metric}</p>}
        </div>
      ),
    },
    style: {
      border: `1px solid ${STATUS_COLOR[module.status]}55`,
      borderRadius: 12,
      background: "var(--card)",
      color: "var(--card-foreground)",
      padding: 10,
      boxShadow: `0 4px 16px ${STATUS_COLOR[module.status]}18`,
    },
  })), [context]);

  const edges = useMemo<Edge[]>(() => (context?.modules || [])
    .filter((module) => module.id !== "architect")
    .map((module) => ({
      id: `architect-${module.id}`,
      source: "architect",
      target: module.id,
      animated: module.status !== "healthy",
      style: { stroke: STATUS_COLOR[module.status], strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: STATUS_COLOR[module.status] },
    })), [context]);

  function askArchitect(prompt: string) {
    window.dispatchEvent(new CustomEvent("architect:prompt", { detail: prompt }));
    document.getElementById("architect-chat")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <Card className="mb-8 overflow-hidden">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><BrainCircuit className="size-5 text-violet-600" /> Red inteligente del sistema</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Estado conectado de módulos, datos y automatizaciones.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <RefreshCw className="size-3.5 mr-1" />} Actualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-[420px] bg-slate-50/50 dark:bg-slate-950/20">
          {loading && !context ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground"><Loader2 className="size-5 mr-2 animate-spin" /> Conectando módulos…</div>
          ) : (
            <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.55} maxZoom={1.3} nodesConnectable={false} elementsSelectable={false}>
              <Background gap={22} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
          )}
        </div>

        <div className="border-t p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="size-4 text-amber-500" /> Alertas inteligentes</h3>
            <Badge variant="outline">{context?.alerts.length || 0}</Badge>
          </div>
          {context?.alerts.length ? (
            <div className="grid gap-2 md:grid-cols-2">
              {context.alerts.map((alert) => (
                <button key={alert.id} type="button" onClick={() => askArchitect(alert.suggestedPrompt)} className="text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{alert.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{alert.detail}</p>
                    </div>
                    <Badge variant="outline" className={SEVERITY_STYLE[alert.severity]}>{alert.severity}</Badge>
                  </div>
                  <p className="text-[11px] text-violet-600 mt-2">Consultar al Arquitecto →</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-emerald-600">No se detectaron alertas operativas en este momento.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
