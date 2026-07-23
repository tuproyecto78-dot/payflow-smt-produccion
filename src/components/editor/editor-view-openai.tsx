"use client";

import { useEffect, useState } from "react";
import { EditorView as BaseEditorView } from "./editor-view";
import type { WorkflowSummary } from "@/stores/app-store";

type AiDeliveryMode = "simulation" | "assisted" | "automatic";

export function EditorView({ workflow }: { workflow: WorkflowSummary }) {
  const [mode, setMode] = useState<AiDeliveryMode>("simulation");

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    const patchedFetch: typeof window.fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : input.url;

      if (url.includes("/api/workflows/execute") && init?.body) {
        try {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          body.aiMode = mode;
          return originalFetch(input, {
            ...init,
            body: JSON.stringify(body),
          });
        } catch {
          return originalFetch(input, init);
        }
      }

      return originalFetch(input, init);
    };

    window.fetch = patchedFetch;
    return () => {
      if (window.fetch === patchedFetch) window.fetch = originalFetch;
    };
  }, [mode]);

  return (
    <div className="relative h-full min-h-0">
      <BaseEditorView workflow={workflow} />

      <div className="absolute right-3 top-16 z-40 w-56 rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur md:right-[21rem]">
        <label htmlFor="payflow-ai-mode" className="block text-xs font-semibold text-foreground">
          Modo del agente IA
        </label>
        <select
          id="payflow-ai-mode"
          value={mode}
          onChange={(event) => setMode(event.target.value as AiDeliveryMode)}
          className="mt-2 h-9 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="simulation">Simulación real</option>
          <option value="assisted">Asistido · requiere aprobación</option>
          <option value="automatic" disabled>
            Automático · bloqueado
          </option>
        </select>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          {mode === "simulation"
            ? "OpenAI responde con el catálogo real, únicamente dentro del simulador."
            : "OpenAI genera una sugerencia marcada como pendiente. No se envía por WhatsApp."}
        </p>
      </div>
    </div>
  );
}
