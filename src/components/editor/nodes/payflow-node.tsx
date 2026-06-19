"use client";

import { Handle, Position, type NodeProps } from "reactflow";
import { memo } from "react";
import {
  Play,
  MessageSquare,
  HelpCircle,
  GitBranch,
  MessageCircle,
  CreditCard,
  Search,
  Hourglass,
  CheckCircle2,
  XCircle,
  Clock,
  Bot,
  Webhook,
  Square,
  X,
  type LucideIcon,
} from "lucide-react";
import { NODE_METADATA, type NodeType } from "@/lib/workflow-types";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  Play,
  MessageSquare,
  HelpCircle,
  GitBranch,
  MessageCircle,
  CreditCard,
  Search,
  Hourglass,
  CheckCircle2,
  XCircle,
  Clock,
  Bot,
  Webhook,
  Square,
};

export interface PayFlowNodeData {
  label: string;
  [key: string]: unknown;
}

function getNodeSummary(type: NodeType, data: PayFlowNodeData): string {
  switch (type) {
    case "start":
      return `Disparador: ${data.trigger || "manual"}`;
    case "message":
      return data.message ? String(data.message).slice(0, 40) : "Mensaje vacío";
    case "question":
      return data.question
        ? `→ {{${data.variable || "respuesta"}}}`
        : "Sin pregunta";
    case "condition":
      return `${data.variable || "?"} ${data.operator || "=="} "${data.value || ""}"`;
    case "whatsapp": {
      const phone = data.phoneNumber ? `A ${data.phoneNumber}` : "Sin destinatario";
      const out = data.outputVariable ? ` · → {{${data.outputVariable}}}` : "";
      return phone + out;
    }
    case "payment":
    case "create_payment": {
      const amt = data.amount ?? 0;
      const cur = data.currency || "USD";
      const prov = data.provider || "Mock";
      return `${amt} ${cur} · ${prov}`;
    }
    case "verify_payment":
      return data.orderId
        ? `Pedido ${String(data.orderId).slice(0, 20)}`
        : "Verificar estado";
    case "wait_confirmation":
      return data.timeout ? `Timeout ${data.timeout}s` : "Esperar webhook";
    case "payment_success":
      return "Estado → éxito";
    case "payment_failed":
      return "Estado → fallido";
    case "payment_pending":
      return "Estado → pendiente";
    case "ai_agent":
      return data.outputVariable ? `→ {{${data.outputVariable}}}` : "→ {{ai_response}}";
    case "api":
      return data.method ? `${data.method} ${data.url ? String(data.url).slice(0, 24) : ""}` : "Sin petición";
    case "end":
      return data.message ? String(data.message).slice(0, 40) : "Fin del flujo";
    default:
      return "";
  }
}

function PayFlowNodeInner({ id, data, selected }: NodeProps) {
  const nodeType = (data as { nodeType?: NodeType }).nodeType || "message";
  const meta = NODE_METADATA[nodeType];
  const Icon = ICONS[meta?.icon] || Square;
  const nodeData = data as PayFlowNodeData;
  const isRunning = (data as { __running?: boolean }).__running;
  const isDone = (data as { __done?: boolean }).__done;
  const isError = (data as { __error?: boolean }).__error;

  const showTarget = nodeType !== "start";
  const outputs = meta?.outputs || [];

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("payflow:delete-node", { detail: { id } })
      );
    }
  }

  return (
    <div
      className={cn(
        "relative min-w-[180px] max-w-[240px] rounded-xl border bg-card shadow-sm transition-all group",
        selected
          ? "border-primary ring-2 ring-primary/20 shadow-md"
          : "border-border hover:border-primary/40",
        isRunning && "pf-node-running border-primary",
        isError && "border-destructive",
        isDone && "border-emerald-500/60"
      )}
    >
      {showTarget && (
        <Handle
          type="target"
          position={Position.Left}
          className="!bg-muted-foreground/70 !border-2 !border-card"
          style={{ width: 10, height: 10 }}
        />
      )}

      {/* Botón eliminar (X) — visible al seleccionar o al pasar el cursor */}
      {nodeType !== "start" && (
        <button
          onClick={handleDelete}
          title="Eliminar nodo"
          className="absolute -top-2.5 -right-2.5 size-6 rounded-full bg-destructive text-destructive-foreground shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:scale-110 z-10"
        >
          <X className="size-3.5" />
        </button>
      )}

      {/* Cabecera */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-xl"
        style={{ backgroundColor: `${meta?.color}14` }}
      >
        <div
          className="size-7 rounded-md flex items-center justify-center shrink-0 text-white"
          style={{ backgroundColor: meta?.color }}
        >
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
            {meta?.label}
          </div>
          <div className="text-sm font-semibold truncate text-foreground leading-tight">
            {nodeData.label || meta?.label}
          </div>
        </div>
        {isRunning && (
          <span className="size-2 rounded-full bg-primary animate-pulse" />
        )}
        {isDone && !isError && (
          <span className="text-emerald-500 text-xs">✓</span>
        )}
      </div>

      {/* Cuerpo */}
      <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border/60">
        <p className="truncate">{getNodeSummary(nodeType, nodeData)}</p>
      </div>

      {/* Conectores de salida */}
      {outputs.map((out, idx) => {
        const top =
          outputs.length === 1
            ? "50%"
            : `${(idx + 1) * (100 / (outputs.length + 1))}%`;
        return (
          <div key={out.id}>
            {outputs.length > 1 && (
              <span
                className="absolute text-[9px] font-medium text-muted-foreground whitespace-nowrap bg-card px-1 rounded pointer-events-none"
                style={{
                  top,
                  right: 14,
                  transform: "translateY(-50%)",
                }}
              >
                {out.label}
              </span>
            )}
            <Handle
              id={out.id}
              type="source"
              position={Position.Right}
              className="!border-2 !border-card"
              style={{
                width: 11,
                height: 11,
                backgroundColor: meta?.color,
                top,
              }}
              isConnectable
            />
          </div>
        );
      })}
    </div>
  );
}

export const PayFlowNode = memo(PayFlowNodeInner);
