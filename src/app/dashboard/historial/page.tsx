"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, History, Loader2, RefreshCw } from "lucide-react";

interface HistoryEntry {
  id: string;
  clientId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  onboarding_completed: "Onboarding completado",
  workflow_created: "Flujo creado",
  workflow_updated: "Flujo actualizado",
  workflow_executed: "Flujo ejecutado",
  client_profile_updated: "Cliente actualizado",
  catalog_product_created: "Producto agregado",
  catalog_product_updated: "Producto actualizado",
  catalog_product_deleted: "Producto eliminado",
  catalog_promotions_updated: "Promociones actualizadas",
  catalog_published: "Catálogo publicado",
  catalog_order_updated: "Pedido actualizado",
  subscription_request_created: "Solicitud creada",
  client_activated: "Cliente activado",
  payment_created: "Pago creado",
  payment_status_updated: "Estado de pago actualizado",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-EC", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function entryTitle(entry: HistoryEntry) {
  const businessName = entry.metadata.business_name;
  const workflowName = entry.metadata.workflow_name;
  const productName = entry.metadata.name;
  if (typeof businessName === "string" && businessName) return businessName;
  if (typeof workflowName === "string" && workflowName) return workflowName;
  if (typeof productName === "string" && productName) return productName;
  return entry.entityType || "Sistema";
}

function entryDetail(entry: HistoryEntry) {
  const parts: string[] = [];
  if (typeof entry.metadata.payment_provider === "string") parts.push(`Pago: ${entry.metadata.payment_provider}`);
  if (typeof entry.metadata.products_imported === "number") parts.push(`${entry.metadata.products_imported} productos importados`);
  if (typeof entry.metadata.node_count === "number") parts.push(`${entry.metadata.node_count} nodos`);
  if (typeof entry.metadata.lines === "number") parts.push(`${entry.metadata.lines} líneas de promociones`);
  return parts.join(" · ") || "Registro persistente";
}

export default function HistorialPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/history", { credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo cargar el historial.");
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el historial.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-10">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Historial</h1>
          <p className="text-muted-foreground mt-1">
            Registro persistente de clientes, catálogos, promociones, flujos y pagos.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load(true)} disabled={refreshing}>
          {refreshing ? <Loader2 className="size-4 mr-2 animate-spin" /> : <RefreshCw className="size-4 mr-2" />}
          Actualizar
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-500/10 p-4 flex gap-3 mb-6">
          <AlertCircle className="size-5 text-rose-600 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="py-20 flex justify-center text-muted-foreground">
          <Loader2 className="size-6 mr-2 animate-spin" /> Cargando historial…
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center">
          <History className="size-12 mx-auto text-muted-foreground/40 mb-4" />
          <h2 className="font-semibold">No hay eventos persistentes</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Al completar el onboarding, el cliente y su flujo aparecerán aquí.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Acción</th>
                  <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Cliente / elemento</th>
                  <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(entry.createdAt)}</td>
                    <td className="px-4 py-3"><Badge variant="outline">{ACTION_LABELS[entry.action] || entry.action}</Badge></td>
                    <td className="px-4 py-3 font-medium">{entryTitle(entry)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{entryDetail(entry)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
