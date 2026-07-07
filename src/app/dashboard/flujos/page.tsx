"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Workflow, Sparkles, Loader2, FolderKanban } from "lucide-react";
import { toast } from "sonner";
import { CreateFlowDialog } from "@/components/dashboard/create-flow-dialog";

export default function FlujosPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createFlowOpen, setCreateFlowOpen] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    setLoading(true);
    try {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch { /* no DB */ }
    finally { setLoading(false); }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-10">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Flujos</h1>
          <p className="text-muted-foreground mt-1">Canales de pago automatizados por WhatsApp</p>
        </div>
        <Button onClick={() => setCreateFlowOpen(true)} className="bg-purple-500 hover:bg-purple-600 text-white">
          <Sparkles className="size-4 mr-2" />
          Crear flujo sugerido
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="size-6 animate-spin mr-2" /> Cargando flujos…
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Workflow className="size-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-1">No hay flujos creados</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Crea tu primer flujo automático para empezar a automatizar WhatsApp, pagos e IA.
          </p>
          <Button onClick={() => setCreateFlowOpen(true)} className="bg-purple-500 hover:bg-purple-600 text-white">
            <Sparkles className="size-4 mr-2" />
            Crear flujo sugerido
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((p) => (
            <div key={p.id} className="rounded-xl border bg-card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Workflow className="size-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold truncate">{p.name}</h3>
                  {p.description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateFlowDialog
        open={createFlowOpen}
        onOpenChange={setCreateFlowOpen}
        onCreated={async (_workflowId, _projectId) => {
          toast.success("Flujo creado correctamente");
          setCreateFlowOpen(false);
          await loadProjects();
        }}
      />
    </div>
  );
}
