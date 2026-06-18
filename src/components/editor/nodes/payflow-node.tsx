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
  Bot,
  Webhook,
  Square,
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
      return `Trigger: ${data.trigger || "manual"}`;
    case "message":
      return data.message ? String(data.message).slice(0, 40) : "Empty message";
    case "question":
      return data.question
        ? `→ {{${data.variable || "response"}}}`
        : "No question set";
    case "condition":
      return `${data.variable || "?"} ${data.operator || "=="} "${data.value || ""}"`;
    case "whatsapp":
      return data.phoneNumber ? `To ${data.phoneNumber}` : "No recipient";
    case "payment": {
      const amt = data.amount ?? 0;
      const cur = data.currency || "USD";
      return `${amt} ${cur}`;
    }
    case "ai_agent":
      return data.outputVariable ? `→ {{${data.outputVariable}}}` : "→ {{ai_response}}";
    case "api":
      return data.method ? `${data.method} ${data.url ? String(data.url).slice(0, 24) : ""}` : "No request";
    case "end":
      return data.message ? String(data.message).slice(0, 40) : "End of flow";
    default:
      return "";
  }
}

function PayFlowNodeInner({ id, type, data, selected }: NodeProps) {
  const meta = NODE_METADATA[type as NodeType];
  const Icon = ICONS[meta?.icon] || Square;
  const nodeData = data as PayFlowNodeData;
  const isRunning = (data as { __running?: boolean }).__running;
  const isDone = (data as { __done?: boolean }).__done;
  const isError = (data as { __error?: boolean }).__error;

  const showTarget = type !== "start";
  const outputs = meta?.outputs || [];

  return (
    <div
      className={cn(
        "relative min-w-[180px] max-w-[240px] rounded-xl border bg-card shadow-sm transition-all",
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

      {/* Header */}
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

      {/* Body */}
      <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border/60">
        <p className="truncate">{getNodeSummary(type as NodeType, nodeData)}</p>
      </div>

      {/* Source handles */}
      {outputs.map((out, idx) => {
        // Position multiple handles vertically on the right edge.
        const top =
          outputs.length === 1
            ? "50%"
            : `${(idx + 1) * (100 / (outputs.length + 1))}%`;
        return (
          <div
            key={out.id}
            className="absolute right-0 flex items-center"
            style={{ top, transform: "translateY(-50%)" }}
          >
            {outputs.length > 1 && (
              <span className="text-[9px] font-medium text-muted-foreground mr-0.5 whitespace-nowrap bg-card px-1 rounded">
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
                position: "relative",
                transform: "none",
                left: "auto",
                top: "auto",
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
