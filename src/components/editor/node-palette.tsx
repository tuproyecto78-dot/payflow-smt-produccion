"use client";

import {
  NODE_METADATA,
  NODE_PALETTE_ORDER,
  PALETTE_CATEGORY_ORDER,
  type NodeCategory,
  type NodeType,
} from "@/lib/workflow-types";
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
  type LucideIcon,
} from "lucide-react";
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

const CATEGORY_LABELS: Record<NodeCategory, string> = {
  channel: "Canales",
  payment: "Pagos",
  intelligence: "Inteligencia",
  integration: "Integraciones",
  flow: "Flujo",
};

const CATEGORY_ACCENT: Record<NodeCategory, string> = {
  channel: "border-l-emerald-400",
  payment: "border-l-indigo-400",
  intelligence: "border-l-pink-400",
  integration: "border-l-teal-400",
  flow: "border-l-slate-300",
};

export function NodePalette({
  onAddNode,
}: {
  onAddNode: (type: NodeType) => void;
}) {
  // Agrupar nodos por categoría respetando el orden de la paleta.
  const groups: { category: NodeCategory; items: NodeType[] }[] =
    PALETTE_CATEGORY_ORDER.map((category) => ({
      category,
      items: NODE_PALETTE_ORDER.filter(
        (t) => NODE_METADATA[t].category === category
      ),
    }));

  return (
    <div className="w-56 shrink-0 border-r border-border bg-card/50 flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-border shrink-0">
        <h3 className="text-sm font-semibold">Nodos</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Haz clic para añadir al lienzo
        </p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pf-scroll p-2 space-y-4">
        {groups.map((group) => (
          <div
            key={group.category}
            className={cn("pl-2 border-l-2", CATEGORY_ACCENT[group.category])}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1.5">
              {CATEGORY_LABELS[group.category]}
            </div>
            <div className="space-y-1">
              {group.items.map((type) => {
                const meta = NODE_METADATA[type];
                const Icon = ICONS[meta.icon] || Square;
                return (
                  <button
                    key={type}
                    onClick={() => onAddNode(type)}
                    className={cn(
                      "w-full flex items-center gap-2.5 rounded-lg border border-border bg-background px-2.5 py-2 text-left hover:border-primary/50 hover:shadow-sm transition-all group"
                    )}
                  >
                    <div
                      className="size-7 rounded-md flex items-center justify-center shrink-0 text-white"
                      style={{ backgroundColor: meta.color }}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold truncate">
                        {meta.label}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {meta.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-border text-[10px] text-muted-foreground leading-relaxed shrink-0">
        <span className="font-medium text-foreground">Consejo:</span> arrastra
        desde el conector derecho de un nodo hacia el conector izquierdo de otro
        para conectarlos.
      </div>
    </div>
  );
}
