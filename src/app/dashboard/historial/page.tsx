"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollText, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface HistoryEntry {
  id: string;
  action: string;
  flowName: string;
  flowId: string;
  timestamp: string;
  details?: string;
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
  subscription_request_created: "Solicitud de suscripción creada",
  client_registered: "Cliente registrado",
  client_reviewed: "Cliente revisado",
  client_approved: "Cliente aprobado",
  client_rejected: "Cliente rechazado",
  client_activated: "Cliente activado",
  workflow_created: "Workflow creado",
  workflow_updated: "Workflow actualizado",
  workflow_executed: "Workflow ejecutado",
  payphone_config_checked: "Configuración PayPhone verificada",
  payphone_link_created: "Link PayPhone generado",
  payment_created: "Pago creado",
  payment_pending: "Pago pendiente",
  payment_status_updated: "Estado de pago actualizado",
  login: "Inicio de sesión",
  logout: "Cierre de sesión",
  security_error: "Error de seguridad",
};

const HISTORY_KEY = "payflow_flow_history";

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function HistorialPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setEntries(loadHistory());
    setLoading(false);
  }, []);

  useEffect(() => {
    // Load history on mount — use a microtask to avoid setState-in-effect lint
    Promise.resolve().then(() => {
      setEntries(loadHistory());
      setLoading(false);
    });
  }, []);

  function handleClear() {
    if (confirm("¿Borrar todo el historial? Esta acción no se puede deshacer.")) {
      localStorage.removeItem(HISTORY_KEY);
      setEntries([]);
      toast.success("Historial borrado.");
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6 lg:p-10">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Historial</h1>
          <p className="text-muted-foreground mt-1">Registro de acciones administrativas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}>
            <RefreshCw className="size-4 mr-2" />
            Actualizar
          </Button>
          {entries.length > 0 && (
            <Button variant="outline" onClick={handleClear} className="text-rose-600 hover:text-rose-700">
              <Trash2 className="size-4 mr-2" />
              Borrar todo
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="size-6 animate-spin mr-2" /> Cargando historial…
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <ScrollText className="size-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-1">No hay acciones registradas</h3>
          <p className="text-muted-foreground text-sm">
            Las acciones que realices (crear, editar, eliminar flujos, etc.) aparecerán aquí.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Fecha</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Acción</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Flujo/Cliente</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(e.timestamp).toLocaleString("es-EC", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[10px]">
                        {ACTION_LABELS[e.action] || e.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-medium truncate max-w-[200px]">
                      {e.flowName}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[200px]">
                      {e.details || "—"}
                    </td>
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
