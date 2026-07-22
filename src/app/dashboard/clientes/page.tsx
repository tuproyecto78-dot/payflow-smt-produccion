"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  Building2,
  CreditCard,
  History,
  Loader2,
  Package,
  RefreshCw,
  Search,
  Settings2,
  Workflow,
} from "lucide-react";

interface ClientItem {
  id: string;
  businessName: string;
  businessType: string | null;
  ownerEmail: string;
  ownerPhone: string;
  status: string;
  paymentProvider: string;
  planCode: string;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  catalog: { id: string; status: string; slug: string; productCount: number } | null;
  workflowCount: number;
  lastAction: { action: string; createdAt: string } | null;
}

const PAYMENT_LABELS: Record<string, string> = {
  none: "Sin pagos en línea",
  payphone: "PayPhone",
  external: "Enlace propio",
  transfer: "Transferencia",
};

const ACTION_LABELS: Record<string, string> = {
  onboarding_completed: "Onboarding completado",
  workflow_created: "Flujo creado",
  catalog_product_created: "Producto agregado",
  catalog_product_updated: "Producto actualizado",
  catalog_promotions_updated: "Promociones actualizadas",
};

function formatDate(value: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-EC", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ClientesPage() {
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/clients", { credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudieron cargar los clientes.");
      setClients(Array.isArray(data.clients) ? data.clients : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los clientes.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return clients;
    return clients.filter((client) =>
      [client.businessName, client.businessType, client.ownerEmail, client.ownerPhone, client.paymentProvider]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [clients, search]);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-10">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-7">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Clientes activos</h1>
          <p className="text-muted-foreground mt-1">
            Negocios, catálogo, pagos, flujos e historial en un solo lugar.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load(true)} disabled={refreshing}>
          {refreshing ? <Loader2 className="size-4 mr-2 animate-spin" /> : <RefreshCw className="size-4 mr-2" />}
          Actualizar
        </Button>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar negocio, correo, teléfono o proveedor…"
          className="pl-9"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-500/10 p-4 flex gap-3 mb-6">
          <AlertCircle className="size-5 text-rose-600 shrink-0" />
          <div>
            <p className="font-medium text-sm">No se pudo cargar la información</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-20 flex justify-center text-muted-foreground">
          <Loader2 className="size-6 mr-2 animate-spin" /> Cargando clientes…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center">
          <Building2 className="size-12 mx-auto text-muted-foreground/40 mb-4" />
          <h2 className="font-semibold">No hay clientes guardados</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Al completar el onboarding, el negocio aparecerá aquí con su catálogo e historial.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((client) => (
            <article key={client.id} className="rounded-2xl border bg-card p-5 shadow-sm flex flex-col">
              <div className="flex items-start gap-3">
                <div className="size-11 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
                  <Building2 className="size-5 text-purple-600 dark:text-purple-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold truncate">{client.businessName}</h2>
                    {client.isDemo && <Badge variant="secondary">Demo</Badge>}
                    <Badge className={client.status === "active" ? "bg-emerald-500/15 text-emerald-700" : ""}>
                      {client.status === "active" ? "Activo" : client.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {client.businessType || "Tipo no definido"} · {client.ownerPhone || client.ownerEmail}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-5">
                <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                  <Package className="size-4 mx-auto text-amber-600" />
                  <p className="font-semibold mt-1">{client.catalog?.productCount || 0}</p>
                  <p className="text-[10px] text-muted-foreground">Productos</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                  <Workflow className="size-4 mx-auto text-sky-600" />
                  <p className="font-semibold mt-1">{client.workflowCount}</p>
                  <p className="text-[10px] text-muted-foreground">Flujos</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                  <CreditCard className="size-4 mx-auto text-violet-600" />
                  <p className="font-semibold mt-1 text-xs truncate">
                    {PAYMENT_LABELS[client.paymentProvider] || client.paymentProvider}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Pago</p>
                </div>
              </div>

              <div className="mt-4 rounded-lg border px-3 py-2.5">
                <div className="flex items-center gap-2 text-xs">
                  <History className="size-3.5 text-muted-foreground" />
                  <span className="font-medium">
                    {client.lastAction ? ACTION_LABELS[client.lastAction.action] || client.lastAction.action : "Sin actividad"}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {client.lastAction ? formatDate(client.lastAction.createdAt) : `Creado: ${formatDate(client.createdAt)}`}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-5">
                <Button asChild className="col-span-2">
                  <Link href={`/dashboard/clientes/${encodeURIComponent(client.id)}`}>
                    <Settings2 className="size-4 mr-2" /> Administrar cliente
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/dashboard/catalogo?clientId=${encodeURIComponent(client.id)}`}>
                    <Package className="size-4 mr-2" /> Catálogo
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/dashboard/flujos">
                    <Workflow className="size-4 mr-2" /> Flujos
                  </Link>
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
