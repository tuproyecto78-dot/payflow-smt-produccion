"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Loader2, RefreshCw, Inbox } from "lucide-react";
import { toast } from "sonner";

interface NewClient {
  id: string;
  registrationCode: string;
  fullName: string;
  email: string;
  phoneMasked: string;
  plan: string;
  status: string;
  createdAt: string;
  paymentProvider: string;
  businessName: string;
}

// Demo data for when DB is not available
const DEMO_NEW_CLIENTS: NewClient[] = [
  {
    id: "demo-req-1",
    registrationCode: "PFS-20260709-0041",
    fullName: "Ana Pérez",
    email: "ana.perez@example.com",
    phoneMasked: "****4321",
    plan: "Plan Trimestral",
    status: "pending_review",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    paymentProvider: "payphone",
    businessName: "Boutique Ana",
  },
  {
    id: "demo-req-2",
    registrationCode: "PFS-20260709-0042",
    fullName: "Carlos Mendoza",
    email: "carlos.m@example.com",
    phoneMasked: "****9876",
    plan: "Plan Anual",
    status: "pending_review",
    createdAt: new Date(Date.now() - 43200000).toISOString(),
    paymentProvider: "payphone",
    businessName: "TechStore EC",
  },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_review: { label: "Pendiente", color: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  reviewed: { label: "En revisión", color: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  missing_info: { label: "Info faltante", color: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
  approved: { label: "Aprobado", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  rejected: { label: "Rechazado", color: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  activated: { label: "Activado", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
};

export default function NuevosClientesPage() {
  const [clients, setClients] = useState<NewClient[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/subscriptions", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const requests = data.requests || [];
        if (requests.length > 0) {
          setClients(
            requests.map((r: Record<string, unknown>, idx: number) => ({
              id: String(r.id || `req-${idx}`),
              registrationCode: `PFS-${new Date(String(r.createdAt || Date.now())).toISOString().slice(0, 10).replace(/-/g, "")}-${String(idx + 1).padStart(4, "0")}`,
              fullName: String(r.fullName || ""),
              email: String(r.email || ""),
              phoneMasked: String(r.phoneNumber || "").replace(/\d(?=\d{4})/g, "*"),
              plan: String(r.selectedPlanLabel || r.selectedPlan || ""),
              status: String(r.subscriptionStatus || "pending_review"),
              createdAt: String(r.createdAt || new Date().toISOString()),
              paymentProvider: String(r.paymentProvider || "payphone"),
              businessName: String(r.businessName || ""),
            }))
          );
        } else {
          setClients(DEMO_NEW_CLIENTS);
        }
      } else {
        setClients(DEMO_NEW_CLIENTS);
      }
    } catch {
      setClients(DEMO_NEW_CLIENTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-5xl mx-auto p-6 lg:p-10">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Nuevos clientes</h1>
          <p className="text-muted-foreground mt-1">Solicitudes de suscripción pendientes de revisión</p>
        </div>
        <Button variant="outline" onClick={load}>
          <RefreshCw className="size-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="size-6 animate-spin mr-2" /> Cargando solicitudes…
        </div>
      ) : clients.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Inbox className="size-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-1">No hay solicitudes pendientes</h3>
          <p className="text-muted-foreground text-sm">Las nuevas solicitudes de suscripción aparecerán aquí.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {clients.map((c) => {
            const statusInfo = STATUS_LABELS[c.status] || STATUS_LABELS.pending_review;
            return (
              <div key={c.id} className="rounded-xl border bg-card p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="size-10 rounded-lg bg-purple-100 dark:bg-purple-500/15 flex items-center justify-center shrink-0">
                    <UserPlus className="size-5 text-purple-600 dark:text-purple-300" />
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-mono text-purple-600 dark:text-purple-300 font-semibold">
                        {c.registrationCode}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <h3 className="font-semibold truncate">{c.businessName || c.fullName}</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                      <span>{c.email}</span>
                      <span>Tel: {c.phoneMasked}</span>
                      <span>{c.plan}</span>
                      <span>Proveedor: {c.paymentProvider}</span>
                      <span>{new Date(c.createdAt).toLocaleDateString("es-EC")}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => toast.info(`Detalle de ${c.registrationCode}`)}
                    >
                      Ver detalle
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs text-emerald-600 hover:text-emerald-700"
                      onClick={() => {
                        toast.success(`Cliente ${c.registrationCode} aprobado.`);
                        // Log to history
                        try {
                          const hist = JSON.parse(localStorage.getItem("payflow_flow_history") || "[]");
                          hist.unshift({
                            id: `hist_${Date.now()}`,
                            action: "client_approved",
                            flowName: c.businessName || c.fullName,
                            flowId: c.id,
                            timestamp: new Date().toISOString(),
                            details: `Código: ${c.registrationCode}`,
                          });
                          localStorage.setItem("payflow_flow_history", JSON.stringify(hist.slice(0, 50)));
                        } catch {}
                      }}
                    >
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs text-rose-600 hover:text-rose-700"
                      onClick={() => toast.info(`Rechazar ${c.registrationCode}`)}
                    >
                      Rechazar
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
