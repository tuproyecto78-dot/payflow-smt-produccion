"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Workflow, History, CreditCard, Sparkles, FolderKanban, Loader2 } from "lucide-react";

export default function DashboardHome() {
  const { user } = useAuthStore();
  const [projects, setProjects] = useState<any[]>([]);
  const [activeFlowCount, setActiveFlowCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
    loadFlowCount();
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

  async function loadFlowCount() {
    try {
      const res = await fetch("/api/workflows", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        // Count only active (non-desactivated) flows.
        const active = (data.workflows || []).filter(
          (w: { name: string; status: string }) =>
            !w.name.startsWith("[Desactivado]") && w.status !== "draft"
        ).length;
        setActiveFlowCount(active);
      }
    } catch { /* no DB */ }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-10">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Panel administrador</h1>
          <p className="text-muted-foreground mt-1">
            Bienvenido, {user?.name || user?.email}. Gestiona tus flujos de WhatsApp, pagos e IA.
          </p>
        </div>
        <Link href="/dashboard/flujos">
          <Button className="bg-purple-500 hover:bg-purple-600 text-white">
            <Sparkles className="size-4 mr-2" />
            Crear flujo automático
          </Button>
        </Link>
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Flujos activos" value={String(activeFlowCount)} icon={<Workflow className="size-5" />} />
        <StatCard title="Ejecuciones" value="0" icon={<History className="size-5" />} />
        <StatCard title="Pagos" value="$0" icon={<CreditCard className="size-5" />} />
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4">Proyectos</h2>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin mr-2" /> Cargando proyectos…
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <FolderKanban className="size-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground text-sm">No hay proyectos todavía. Crea tu primer flujo automático.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((p) => (
              <div key={p.id} className="rounded-xl border bg-card p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FolderKanban className="size-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-base truncate">{p.name}</h3>
                    {p.description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{title}</span>
        <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">{icon}</div>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

import Link from "next/link";
