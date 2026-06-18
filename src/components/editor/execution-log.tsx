"use client";

import { useEffect, useRef } from "react";
import {
  Circle,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Loader2,
  Terminal,
} from "lucide-react";
import type { LogEntry } from "@/lib/workflow-types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

export function ExecutionLog({
  entries,
  running,
  result,
}: {
  entries: LogEntry[];
  running: boolean;
  result: { status: string; variables: Record<string, unknown> } | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between bg-card">
        <div className="flex items-center gap-2">
          <Terminal className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Execution log</h3>
        </div>
        {running && (
          <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400">
            <Loader2 className="size-3 mr-1 animate-spin" />
            running
          </Badge>
        )}
        {result && !running && (
          <Badge
            className={cn(
              result.status === "success" &&
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
              result.status === "failed" &&
                "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
              result.status === "stopped" &&
                "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
            )}
          >
            {result.status}
          </Badge>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto pf-scroll p-3 space-y-1 font-mono text-xs"
      >
        {entries.length === 0 && !running && (
          <div className="text-center text-muted-foreground py-8 font-sans">
            <Terminal className="size-6 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No execution yet</p>
            <p className="text-xs mt-1">
              Click <span className="font-semibold">Run</span> to execute the
              workflow.
            </p>
          </div>
        )}
        {entries.length === 0 && running && (
          <div className="text-center text-muted-foreground py-8 font-sans">
            <Loader2 className="size-5 mx-auto mb-2 animate-spin text-primary" />
            <p className="text-sm">Starting execution…</p>
          </div>
        )}
        {entries.map((entry, i) => (
          <LogLine key={i} entry={entry} />
        ))}
      </div>

      {result && Object.keys(result.variables).length > 0 && !running && (
        <div className="border-t border-border p-3 bg-card max-h-44 overflow-y-auto pf-scroll">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 font-sans">
            Final variables
          </div>
          <div className="space-y-0.5 font-mono text-[11px]">
            {Object.entries(result.variables).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="text-primary shrink-0">{k}:</span>
                <span className="text-muted-foreground break-all">
                  {typeof v === "string"
                    ? `"${v.slice(0, 100)}${v.length > 100 ? "…" : ""}"`
                    : JSON.stringify(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  const iconMap: Record<string, React.ReactNode> = {
    started: <Circle className="size-3 text-sky-500 fill-sky-500" />,
    success: <CheckCircle2 className="size-3.5 text-emerald-500" />,
    error: <XCircle className="size-3.5 text-red-500" />,
    info: <ChevronRight className="size-3.5 text-muted-foreground" />,
  };
  return (
    <div className="flex gap-2 leading-relaxed">
      <span className="text-muted-foreground/50 shrink-0">
        {format(new Date(entry.timestamp), "HH:mm:ss")}
      </span>
      <span className="shrink-0 mt-0.5">{iconMap[entry.status] || iconMap.info}</span>
      <span className="shrink-0 text-primary/80 uppercase text-[10px] font-semibold mt-0.5">
        {entry.nodeType}
      </span>
      <span className="text-foreground/80 break-words">{entry.message}</span>
    </div>
  );
}
