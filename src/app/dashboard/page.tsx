"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Workflow, CreditCard, Sparkles, FolderKanban, Loader2, Play, ExternalLink, Users, DollarSign, TrendingUp, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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

interface AnalyticsOverview {
  summary: {
    contactsToday: number;
    contactsYesterday: number;
    paymentsToday: number;
    revenueToday: number;
    conversion: number;
    failedRunsToday: number;
    pendingPayments: number;
  };
  funnel: Array<{ name: string; value: number }>;
  paymentStatus: { approved: number; failed: number; pending: number };
  alerts: Array<{ level: string; message: string }>;
  trend: Array<{
    date: string;
    contacts: number;
    inboundMessages: number;
    paid: number;
    revenue: number;
  }>;
}

export default function DashboardHome() {
  const { user } = useAuthStore();
  const [projects, setProjects] = useState<any[]>([]);
  const [workflows, setWorkflows] = useState<FlowItem[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const [projRes, wfRes, analyticsRes] = await Promise.all([
          fetch("/api/projects", { credentials: "include" }),
          fetch("/api/workflows", { credentials: "include" }),
          fetch("/api/analytics/overview?days=30", { credentials: "include" }),
        ]);
        if (cancelled) return;
        if (projRes.ok) {
          const data = await projRes.json();
          setProjects(data.projects || []);
        }
        if (wfRes.ok) {
          const data = await wfRes.json();
          setWorkflows(data.workflows || []);
        }
        if (analyticsRes.ok) {
          setAnalytics(await analyticsRes.json());
        }
      } catch {
        /* El panel conserva un estado vacío si una fuente no está disponible. */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  // Count only active (non-desactivated, non-draft) flows.
  const activeFlowCount = workflows.filter(
    (w) => !w.name.startsWith("[Desactivado]") && w.status !== "draft"
  ).length;

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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard
          title="Contactos hoy"
          value={String(analytics?.summary.contactsToday ?? 0)}
          detail={analytics ? `${analytics.summary.contactsYesterday} ayer` : "Cargando datos"}
          icon={<Users className="size-5" />}
        />
        <StatCard
          title="Pagos aprobados"
          value={String(analytics?.summary.paymentsToday ?? 0)}
          detail="Confirmados por webhook"
          icon={<CreditCard className="size-5" />}
        />
        <StatCard
          title="Ingresos hoy"
          value={formatCurrency(analytics?.summary.revenueToday ?? 0)}
          detail="Solo pagos aprobados"
          icon={<DollarSign className="size-5" />}
        />
        <StatCard
          title="Conversión"
          value={`${(analytics?.summary.conversion ?? 0).toFixed(1)}%`}
          detail="Links que terminaron pagados"
          icon={<TrendingUp className="size-5" />}
        />
        <StatCard title="Flujos activos" value={String(activeFlowCount)} icon={<Workflow className="size-5" />} />
        <StatCard
          title="Alertas hoy"
          value={String(analytics?.alerts.length ?? 0)}
          detail={`${analytics?.summary.pendingPayments ?? 0} pagos pendientes`}
          icon={<AlertTriangle className="size-5" />}
        />
      </div>

      <div className="mt-8 grid gap-5 xl:grid-cols-3">
        <section className="rounded-xl border bg-card p-5 xl:col-span-2">
          <div className="mb-5">
            <h2 className="font-semibold">Actividad de los últimos 30 días</h2>
            <p className="text-xs text-muted-foreground mt-1">Contactos únicos y mensajes recibidos por WhatsApp.</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics?.trend || []} margin={{ left: -20, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                <XAxis dataKey="date" tickFormatter={(value) => String(value).slice(5)} fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip labelFormatter={(value) => `Fecha: ${value}`} />
                <Line type="monotone" dataKey="contacts" name="Contactos" stroke="#059669" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="inboundMessages" name="Mensajes recibidos" stroke="#1d4ed8" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Embudo de hoy</h2>
          <p className="text-xs text-muted-foreground mt-1 mb-5">Del contacto al pago confirmado.</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics?.funnel || []} layout="vertical" margin={{ left: 15, right: 15 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.25} />
                <XAxis type="number" allowDecimals={false} hide />
                <YAxis type="category" dataKey="name" width={105} fontSize={11} />
                <Tooltip />
                <Bar dataKey="value" name="Cantidad" radius={[0, 6, 6, 0]}>
                  {(analytics?.funnel || []).map((entry, index) => (
                    <Cell key={entry.name} fill={["#1d4ed8", "#7c3aed", "#059669"][index] || "#059669"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {analytics?.alerts.map((alert) => (
            <div key={alert.message} className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {alert.message}
            </div>
          ))}
        </section>
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
          <div className="space-y-6">
            {projects.map((p) => {
              const projectFlows = workflows.filter((w) => w.projectId === p.id);
              return (
                <div key={p.id} className="rounded-xl border bg-card p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <FolderKanban className="size-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-base truncate">{p.name}</h3>
                      {p.description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>}
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {projectFlows.length} flujo(s)
                    </Badge>
                  </div>

                  {projectFlows.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Sin flujos en este proyecto.</p>
                  ) : (
                    <div className="space-y-2">
                      {projectFlows.map((w) => {
                        const isInactive = w.name.startsWith("[Desactivado]");
                        const statusLabel = isInactive ? "Desactivado" : w.status === "draft" ? "Borrador" : "En prueba";
                        const statusColor = isInactive
                          ? "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300"
                          : w.status === "draft"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
                        return (
                          <div key={w.id} className="rounded-lg border border-border/60 bg-background/40 p-3 flex items-center gap-3 flex-wrap">
                            <div className="size-8 rounded-md bg-purple-100 dark:bg-purple-500/15 flex items-center justify-center shrink-0">
                              <Workflow className="size-4 text-purple-600 dark:text-purple-300" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{w.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                WhatsApp + IA + pagos · {w.nodeCount} nodo(s)
                              </p>
                            </div>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>
                              {statusLabel}
                            </span>
                            <div className="flex gap-1.5">
                              <Link href={`/dashboard/flujos/${w.id}`}>
                                <Button size="sm" variant="outline" className="h-7 text-xs">
                                  <ExternalLink className="size-3 mr-1" />
                                  Abrir
                                </Button>
                              </Link>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => toast.info("Abre el flujo para usar el simulador visual.")}
                              >
                                <Play className="size-3 mr-1" />
                                Simulador
                              </Button>
                              <Link href={`/dashboard/flujos/${w.id}`}>
                                <Button size="sm" variant="outline" className="h-7 text-xs">
                                  Ejecutar
                                </Button>
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, detail }: { title: string; value: string; icon: React.ReactNode; detail?: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{title}</span>
        <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">{icon}</div>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {detail && <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>}
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}
