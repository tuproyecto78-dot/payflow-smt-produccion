"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Workflow, Sparkles, Loader2, RotateCcw, Eye, Play, Copy, Power } from "lucide-react";
import { toast } from "sonner";
import { CreateFlowDialog } from "@/components/dashboard/create-flow-dialog";
import { useAuthStore } from "@/stores/auth-store";

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

export default function FlujosPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<FlowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createFlowOpen, setCreateFlowOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  useEffect(() => {
    loadWorkflows();
  }, []);

  async function loadWorkflows() {
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
  }

  async function handleRestoreDemo() {
    setRestoring(true);
    try {
      const res = await fetch("/api/workflows/restore-demo", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.status === 401) {
        toast.error("Tu sesión expiró. Inicia sesión nuevamente.");
        setTimeout(() => { window.location.href = "/login?next=/dashboard/flujos"; }, 2000);
        return;
      }
      if (res.status === 403) {
        toast.error("No tienes permisos para esta acción.");
        return;
      }
      if (res.status === 503) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Base de datos no disponible. Verifica la configuración del servidor.");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "No se pudo restaurar el flujo de ejemplo.");
        return;
      }
      toast.success(data.message || "Flujo de ejemplo restaurado.");
      await loadWorkflows();
    } catch {
      toast.error("Error de red al restaurar el flujo.");
    } finally {
      setRestoring(false);
    }
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
      toast.success("Flujo duplicado (copia en blanco). Cópialo desde el editor.");
      await loadWorkflows();
    } catch {
      toast.error("Error de red al duplicar.");
    }
  }

  async function handleDeactivate(w: FlowItem) {
    // Renaming the flow with a "[Desactivado]" prefix is a soft-deactivate.
    try {
      const res = await fetch(`/api/workflows/${w.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: w.name.replace(/^\[Desactivado\]\s*/, "").startsWith("[Desactivado]")
            ? w.name
            : `[Desactivado] ${w.name}`,
        }),
      });
      if (!res.ok) {
        toast.error("No se pudo desactivar el flujo.");
        return;
      }
      toast.success("Flujo desactivado.");
      await loadWorkflows();
    } catch {
      toast.error("Error de red al desactivar.");
    }
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
          {isAdmin && (
            <Button
              onClick={handleRestoreDemo}
              disabled={restoring}
              variant="outline"
            >
              {restoring ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="size-4 mr-2" />
              )}
              Restaurar flujo de ejemplo
            </Button>
          )}
          <Button onClick={() => setCreateFlowOpen(true)} className="bg-purple-500 hover:bg-purple-600 text-white">
            <Sparkles className="size-4 mr-2" />
            Crear flujo sugerido
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="size-6 animate-spin mr-2" /> Cargando flujos…
        </div>
      ) : workflows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Workflow className="size-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-1">No hay flujos creados</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Crea tu primer flujo automático o restaura el flujo de ejemplo para empezar.
          </p>
          <div className="flex gap-2 justify-center">
            {isAdmin && (
              <Button onClick={handleRestoreDemo} disabled={restoring} variant="outline">
                {restoring ? (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                ) : (
                  <RotateCcw className="size-4 mr-2" />
                )}
                Restaurar flujo de ejemplo
              </Button>
            )}
            <Button onClick={() => setCreateFlowOpen(true)} className="bg-purple-500 hover:bg-purple-600 text-white">
              <Sparkles className="size-4 mr-2" />
              Crear flujo sugerido
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {workflows.map((w) => {
            const isInactive = w.name.startsWith("[Desactivado]");
            const statusLabel = isInactive ? "Desactivado" : w.status === "draft" ? "Borrador" : "Activo";
            const statusColor = isInactive
              ? "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300"
              : w.status === "draft"
              ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
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
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                    >
                      <Eye className="size-3.5 mr-1" />
                      Ver
                    </Button>
                  </Link>
                  <Link href={`/dashboard/flujos/${w.id}`}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                    >
                      <Play className="size-3.5 mr-1" />
                      Probar simulador
                    </Button>
                  </Link>
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
          toast.success("Flujo creado correctamente");
          setCreateFlowOpen(false);
          await loadWorkflows();
        }}
      />
    </div>
  );
}
