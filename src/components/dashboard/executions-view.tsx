"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  History,
  Loader2,
  Circle,
  CheckCircle2,
  XCircle,
  Square,
  ChevronRight,
  Variable,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { LogEntry, NodeType } from "@/lib/workflow-types";

interface ExecutionListItem {
  id: string;
  status: string;
  workflowId: string;
  workflowName: string;
  startedAt: string;
  completedAt: string | null;
}

interface ExecutionDetail extends ExecutionListItem {
  entries: LogEntry[];
  variables: Record<string, unknown>;
}

const NODE_TYPE_LABELS: Record<string, string> = {
  start: "Inicio",
  message: "Mensaje",
  question: "Pregunta",
  condition: "Condición",
  whatsapp: "WhatsApp",
  payment: "Pago",
  ai_agent: "Agente IA",
  api: "API",
  end: "Fin",
};

export function ExecutionsView() {
  const [list, setList] = useState<ExecutionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ExecutionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/executions?limit=50");
      const data = await res.json();
      setList(data.executions || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openDetail(id: string) {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/executions/${id}`);
      const data = await res.json();
      setSelected(data.execution);
    } catch {
      // ignore
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <div className="flex-1 overflow-hidden flex">
      {/* Lista */}
      <div className="w-full md:w-96 border-r border-border flex flex-col min-h-0">
        <div className="p-5 border-b border-border">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <History className="size-5 text-primary" />
            Historial de ejecuciones
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cada ejecución de flujo se registra aquí.
          </p>
        </div>
        <ScrollArea className="flex-1 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="size-4 animate-spin mr-2" /> Cargando…
            </div>
          ) : list.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm px-6">
              Aún no hay ejecuciones. Ejecuta un flujo desde el editor para ver
              los registros aquí.
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {list.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => openDetail(ex.id)}
                  className={cn(
                    "w-full text-left rounded-lg px-3 py-2.5 hover:bg-accent/60 transition-colors border border-transparent",
                    selected?.id === ex.id && "bg-accent border-border"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">
                      {ex.workflowName}
                    </span>
                    <StatusBadge status={ex.status} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Clock />
                    {formatDistanceToNow(new Date(ex.startedAt), {
                      addSuffix: true,
                      locale: es,
                    })}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Detalle */}
      <div className="hidden md:flex flex-1 flex-col overflow-hidden min-h-0">
        {loadingDetail ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <Loader2 className="size-5 animate-spin mr-2" /> Cargando ejecución…
          </div>
        ) : !selected ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <History className="size-10 mb-3 opacity-40" />
            <p className="text-sm">Selecciona una ejecución para ver sus registros.</p>
          </div>
        ) : (
          <ExecutionDetailPanel detail={selected} />
        )}
      </div>
    </div>
  );
}

function Clock() {
  return <span className="size-3 inline-block rounded-full border border-current opacity-60" />;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    success: {
      label: "Éxito",
      cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
      icon: <CheckCircle2 className="size-3" />,
    },
    failed: {
      label: "Fallido",
      cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
      icon: <XCircle className="size-3" />,
    },
    running: {
      label: "En curso",
      cls: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
      icon: <Loader2 className="size-3 animate-spin" />,
    },
    stopped: {
      label: "Detenido",
      cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
      icon: <Square className="size-3" />,
    },
  };
  const s = map[status] || {
    label: status,
    cls: "bg-muted text-muted-foreground",
    icon: <Circle className="size-3" />,
  };
  return (
    <Badge variant="secondary" className={cn("gap-1 text-[10px]", s.cls)}>
      {s.icon}
      {s.label}
    </Badge>
  );
}

function ExecutionDetailPanel({ detail }: { detail: ExecutionDetail }) {
  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="p-6 lg:p-8 max-w-4xl">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <h2 className="text-lg font-bold">{detail.workflowName}</h2>
            <p className="text-sm text-muted-foreground">
              Iniciado {format(new Date(detail.startedAt), "PPpp", { locale: es })}
            </p>
          </div>
          <StatusBadge status={detail.status} />
        </div>

        {/* Variables */}
        {Object.keys(detail.variables).length > 0 && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Variable className="size-4 text-primary" />
                Variables finales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-2 text-xs">
                {Object.entries(detail.variables).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-start justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5"
                  >
                    <code className="text-primary font-medium">{k}</code>
                    <code className="text-muted-foreground break-all text-right max-w-[60%]">
                      {typeof v === "string"
                        ? `"${v.slice(0, 120)}${v.length > 120 ? "…" : ""}"`
                        : JSON.stringify(v)}
                    </code>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Registros */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Registro de ejecución</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ol className="relative">
              {detail.entries.map((entry, i) => (
                <LogRow key={i} entry={entry} isLast={i === detail.entries.length - 1} />
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}

function LogRow({ entry, isLast }: { entry: LogEntry; isLast: boolean }) {
  const iconMap: Record<string, React.ReactNode> = {
    started: <Circle className="size-3 text-sky-500" />,
    success: <CheckCircle2 className="size-3.5 text-emerald-500" />,
    error: <XCircle className="size-3.5 text-red-500" />,
    info: <ChevronRight className="size-3.5 text-muted-foreground" />,
  };
  return (
    <li className="flex gap-3 px-4 py-2.5 hover:bg-accent/30">
      <div className="flex flex-col items-center">
        <div className="mt-0.5">{iconMap[entry.status] || iconMap.info}</div>
        {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
      </div>
      <div className="flex-1 min-w-0 pb-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {NODE_TYPE_LABELS[entry.nodeType] || entry.nodeType}
          </span>
          <span className="text-sm font-medium">{entry.nodeLabel}</span>
          {entry.durationMs !== undefined && (
            <span className="text-[10px] text-muted-foreground">
              {entry.durationMs}ms
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 break-words">
          {entry.message}
        </p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
          {format(new Date(entry.timestamp), "HH:mm:ss.SSS")}
        </p>
      </div>
    </li>
  );
}
