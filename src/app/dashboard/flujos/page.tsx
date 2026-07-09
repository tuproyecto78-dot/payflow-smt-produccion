"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Workflow,
  Sparkles,
  Loader2,
  Eye,
  Play,
  Copy,
  Power,
  RotateCcw,
  Edit3,
  Trash2,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { CreateFlowDialog } from "@/components/dashboard/create-flow-dialog";

interface FlowItem {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  nodeCount: number;
  status: string;
  provider: string | null;
  channel: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ActionEntry {
  id: string;
  action: string;
  flowName: string;
  flowId: string;
  timestamp: string;
  details?: string;
}

const HISTORY_KEY = "payflow_flow_history";

function loadHistory(): ActionEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: ActionEntry[]) {
  try {
    // Keep only last 50 entries.
    const trimmed = entries.slice(0, 50);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
}

function addHistoryEntry(entry: Omit<ActionEntry, "id" | "timestamp">) {
  const newEntry: ActionEntry = {
    ...entry,
    id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
  };
  const current = loadHistory();
  const updated = [newEntry, ...current];
  saveHistory(updated);
  return newEntry;
}

const ACTION_LABELS: Record<string, string> = {
  flow_created: "Flujo creado",
  flow_edited: "Flujo editado",
  flow_deleted: "Flujo eliminado",
  flow_duplicated: "Flujo duplicado",
  flow_deactivated: "Flujo desactivado",
  flow_activated: "Flujo activado",
  flow_executed: "Flujo ejecutado",
  demo_reset: "Demo restablecido",
  flow_saved: "Flujo guardado",
};

export default function FlujosPage() {
  const [workflows, setWorkflows] = useState<FlowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createFlowOpen, setCreateFlowOpen] = useState(false);
  const [history, setHistory] = useState<ActionEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadWorkflows();
    setHistory(loadHistory());
  }, []);

  const loadWorkflows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/workflows", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data.workflows || []);
      }
    } catch {
      /* no DB */
    } finally {
      setLoading(false);
    }
  }, []);

  function refreshHistory() {
    setHistory(loadHistory());
  }

  async function handleDuplicate(w: FlowItem) {
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: w.projectId,
          name: `${w.name} (copia)`,
        }),
      });
      if (!res.ok) {
        toast.error("No se pudo duplicar el flujo.");
        return;
      }
      addHistoryEntry({
        action: "flow_duplicated",
        flowName: w.name,
        flowId: w.id,
        details: `Duplicado como "${w.name} (copia)"`,
      });
      refreshHistory();
      toast.success("Flujo duplicado.");
      await loadWorkflows();
    } catch {
      toast.error("Error de red al duplicar.");
    }
  }

  async function handleDeactivate(w: FlowItem) {
    try {
      const res = await fetch(`/api/workflows/${w.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `[Desactivado] ${w.name}`,
        }),
      });
      if (!res.ok) {
        toast.error("No se pudo desactivar el flujo.");
        return;
      }
      addHistoryEntry({
        action: "flow_deactivated",
        flowName: w.name,
        flowId: w.id,
      });
      refreshHistory();
      toast.success("Flujo desactivado.");
      await loadWorkflows();
    } catch {
      toast.error("Error de red al desactivar.");
    }
  }

  async function handleDelete(w: FlowItem) {
    if (!confirm(`¿Eliminar el flujo "${w.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/workflows/${w.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 404) {
        toast.error("No se pudo eliminar el flujo.");
        return;
      }
      addHistoryEntry({
        action: "flow_deleted",
        flowName: w.name,
        flowId: w.id,
      });
      refreshHistory();
      toast.success("Flujo eliminado.");
      await loadWorkflows();
    } catch {
      toast.error("Error de red al eliminar.");
    }
  }

  function handleResetDemo(w: FlowItem) {
    try {
      localStorage.removeItem(`payflow_demo_workflow_${w.id}`);
    } catch {}
    addHistoryEntry({
      action: "demo_reset",
      flowName: w.name,
      flowId: w.id,
    });
    refreshHistory();
    toast.success("Flujo demo restablecido. Abre el flujo para verlo.");
  }

  const providerLabel = (p: string | null) => {
    if (!p) return null;
    const lower = p.toLowerCase();
    if (lower === "payphone") return "PayPhone API Link";
    if (lower === "mock") return "Mock (simulación)";
    return p;
  };

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-10">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Flujos</h1>
          <p className="text-muted-foreground mt-1">Canales de pago automatizados por WhatsApp</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              refreshHistory();
              setShowHistory(!showHistory);
            }}
          >
            <History className="size-4 mr-2" />
            Historial
            {history.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-[10px] h-5">
                {history.length}
              </Badge>
            )}
          </Button>
          <Button onClick={() => setCreateFlowOpen(true)} className="bg-purple-500 hover:bg-purple-600 text-white">
            <Sparkles className="size-4 mr-2" />
            Crear flujo sugerido
          </Button>
        </div>
      </div>

      {/* Panel de historial */}
      {showHistory && (
        <div className="mb-6 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <History className="size-4 text-purple-500" />
              Historial de acciones
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                if (confirm("¿Borrar todo el historial?")) {
                  localStorage.removeItem(HISTORY_KEY);
                  setHistory([]);
                  toast.success("Historial borrado.");
                }
              }}
            >
              Borrar historial
            </Button>
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay acciones registradas todavía.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center gap-3 text-xs px-3 py-2 rounded-lg bg-background/50 border border-border/40"
                >
                  <span className="size-2 rounded-full bg-purple-500 shrink-0" />
                  <span className="font-medium shrink-0">
                    {ACTION_LABELS[h.action] || h.action}
                  </span>
                  <span className="text-muted-foreground truncate flex-1">
                    {h.flowName}
                    {h.details ? ` · ${h.details}` : ""}
                  </span>
                  <span className="text-muted-foreground/60 text-[10px] shrink-0">
                    {new Date(h.timestamp).toLocaleString("es-EC", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="size-6 animate-spin mr-2" /> Cargando flujos…
        </div>
      ) : workflows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Workflow className="size-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-1">No hay flujos creados</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Crea tu primer flujo automático para empezar.
          </p>
          <Button onClick={() => setCreateFlowOpen(true)} className="bg-purple-500 hover:bg-purple-600 text-white">
            <Sparkles className="size-4 mr-2" />
            Crear flujo sugerido
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {workflows.map((w) => {
            const isInactive = w.name.startsWith("[Desactivado]");
            const isDemo = w.id === "demo-cobro-whatsapp-ia";
            const statusLabel = isInactive
              ? "Desactivado"
              : isDemo
              ? "En prueba"
              : w.status === "draft"
              ? "Borrador"
              : "Activo";
            const statusColor = isInactive
              ? "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300"
              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
            const providerText = providerLabel(w.provider);
            return (
              <div key={w.id} className="rounded-xl border bg-card p-5 hover:shadow-md transition-shadow flex flex-col">
                <div className="flex items-start gap-3 mb-3">
                  <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Workflow className="size-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold truncate">{w.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {w.projectName} · {w.nodeCount} nodo(s)
                    </p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>
                    {statusLabel}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-4">
                  {providerText && (
                    <Badge variant="outline" className="text-[10px] border-violet-300 dark:border-violet-500/40 text-violet-700 dark:text-violet-300">
                      {providerText}
                    </Badge>
                  )}
                  {w.channel && (
                    <Badge variant="outline" className="text-[10px] border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                      {w.channel}
                    </Badge>
                  )}
                  {!providerText && !w.channel && (
                    <span className="text-[11px] text-muted-foreground">Sin canal configurado</span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mt-auto">
                  <Link href={`/dashboard/flujos/${w.id}`}>
                    <Button size="sm" variant="outline" className="h-8 text-xs">
                      <Eye className="size-3.5 mr-1" />
                      Abrir
                    </Button>
                  </Link>
                  <Link href={`/dashboard/flujos/${w.id}`}>
                    <Button size="sm" variant="outline" className="h-8 text-xs">
                      <Edit3 className="size-3.5 mr-1" />
                      Editar
                    </Button>
                  </Link>
                  <Link href={`/dashboard/flujos/${w.id}`}>
                    <Button size="sm" variant="outline" className="h-8 text-xs">
                      <Play className="size-3.5 mr-1" />
                      Ejecutar
                    </Button>
                  </Link>
                  {isDemo && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => handleResetDemo(w)}
                    >
                      <RotateCcw className="size-3.5 mr-1" />
                      Restablecer
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => handleDuplicate(w)}
                  >
                    <Copy className="size-3.5 mr-1" />
                    Duplicar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => handleDeactivate(w)}
                    disabled={isInactive}
                  >
                    <Power className="size-3.5 mr-1" />
                    {isInactive ? "Desactivado" : "Desactivar"}
                  </Button>
                  {!isDemo && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                      onClick={() => handleDelete(w)}
                    >
                      <Trash2 className="size-3.5 mr-1" />
                      Eliminar
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateFlowDialog
        open={createFlowOpen}
        onOpenChange={setCreateFlowOpen}
        onCreated={async (_workflowId, _projectId) => {
          addHistoryEntry({
            action: "flow_created",
            flowName: "Nuevo flujo",
            flowId: _workflowId,
          });
          refreshHistory();
          toast.success("Flujo creado correctamente");
          setCreateFlowOpen(false);
          await loadWorkflows();
        }}
      />
    </div>
  );
}
