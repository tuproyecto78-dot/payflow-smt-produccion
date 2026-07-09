"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface ActiveClient {
  id: string;
  registrationCode: string;
  businessName: string;
  ownerEmail: string;
  ownerPhoneMasked: string;
  status: string;
  paymentProvider: string;
  payphoneBusinessStatus: string;
  createdAt: string;
}

// Demo data for when DB is not available
const DEMO_ACTIVE_CLIENTS: ActiveClient[] = [
  {
    id: "demo-client-1",
    registrationCode: "PFS-20260101-0001",
    businessName: "Negocio Demo PayFlow",
    ownerEmail: "demo@payflow.smt",
    ownerPhoneMasked: "****4321",
    status: "active",
    paymentProvider: "payphone",
    payphoneBusinessStatus: "configured",
    createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  },
];

export default function ClientesActivosPage() {
  const [clients, setClients] = useState<ActiveClient[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/clients", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const rawClients = data.clients || [];
        setClients(
          rawClients.map((c: Record<string, unknown>, idx: number) => ({
            id: String(c.id || `client-${idx}`),
            registrationCode: `PFS-${new Date(String(c.createdAt || Date.now())).toISOString().slice(0, 10).replace(/-/g, "")}-${String(idx + 1).padStart(4, "0")}`,
            businessName: String(c.businessName || ""),
            ownerEmail: String(c.ownerEmail || ""),
            ownerPhoneMasked: String(c.ownerPhone || "").replace(/\d(?=\d{4})/g, "*"),
            status: String(c.status || "active"),
            paymentProvider: String(c.paymentProvider || "payphone"),
            payphoneBusinessStatus: String(c.paymentAccounts?.[0]?.payphoneBusinessStatus || "not_configured"),
            createdAt: String(c.createdAt || new Date().toISOString()),
          }))
        );
      } else {
        setClients(DEMO_ACTIVE_CLIENTS);
      }
    } catch {
      setClients(DEMO_ACTIVE_CLIENTS);
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
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Clientes activos</h1>
          <p className="text-muted-foreground mt-1">Clientes activados con configuración PayPhone</p>
        </div>
        <Button variant="outline" onClick={load}>
          <RefreshCw className="size-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="size-6 animate-spin mr-2" /> Cargando clientes…
        </div>
      ) : clients.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Users className="size-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-1">No hay clientes activos</h3>
          <p className="text-muted-foreground text-sm">Los clientes activados aparecerán aquí.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {clients.map((c) => (
            <div key={c.id} className="rounded-xl border bg-card p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start gap-4 flex-wrap">
                <div className="size-10 rounded-lg bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center shrink-0">
                  <Users className="size-5 text-emerald-600 dark:text-emerald-300" />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-mono text-emerald-600 dark:text-emerald-300 font-semibold">
                      {c.registrationCode}
                    </span>
                    <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300">
                      Activo
                    </Badge>
                    {c.payphoneBusinessStatus === "configured" && (
                      <Badge variant="outline" className="text-[10px] border-violet-300 text-violet-700 dark:border-violet-500/40 dark:text-violet-300">
                        PayPhone configurado
                      </Badge>
                    )}
                  </div>
                  <h3 className="font-semibold truncate">{c.businessName}</h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                    <span>{c.ownerEmail}</span>
                    <span>Tel: {c.ownerPhoneMasked}</span>
                    <span>Proveedor: {c.paymentProvider}</span>
                    <span>Activado: {new Date(c.createdAt).toLocaleDateString("es-EC")}</span>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => toast.info(`Configuración PayPhone de ${c.businessName}`)}
                  >
                    Ver PayPhone
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => toast.info(`Flujos de ${c.businessName}`)}
                  >
                    Ver flujos
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => toast.info(`Historial de ${c.businessName}`)}
                  >
                    Ver historial
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
