"use client";

import { useEffect, useRef, useState } from "react";
import { EditorView as BaseEditorView } from "./editor-view";
import type { WorkflowSummary } from "@/stores/app-store";

type AiDeliveryMode = "simulation" | "assisted" | "automatic";
const STATE_KEY = "__payflow_simulator_state";

function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function EditorView({ workflow }: { workflow: WorkflowSummary }) {
  const [mode, setMode] = useState<AiDeliveryMode>("simulation");
  const simulatorStateRef = useRef<unknown>(null);

  useEffect(() => {
    simulatorStateRef.current = null;
  }, [workflow.id]);

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
        let body: Record<string, unknown>;
        try {
          body = JSON.parse(String(init.body)) as Record<string, unknown>;
        } catch {
          return originalFetch(input, init);
        }

        body.aiMode = mode;
        if (typeof body.clientMessage === "string") {
          const questionResponses = safeObject(body.questionResponses);
          body.questionResponses = {
            ...questionResponses,
            [STATE_KEY]: JSON.stringify(simulatorStateRef.current),
          };
        }

        const response = await originalFetch(input, {
          ...init,
          body: JSON.stringify(body),
        });

        try {
          const payload = safeObject(await response.clone().json());
          const variables = safeObject(payload.variables);
          if (Object.prototype.hasOwnProperty.call(variables, "simulator_state")) {
            simulatorStateRef.current = variables.simulator_state;
          }
        } catch {
          // Keep the last valid temporary state if the response has no JSON body.
        }

        return response;
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
            ? "Gemini responde con el catálogo real, únicamente dentro del simulador."
            : "Gemini genera una sugerencia pendiente. No se envía por WhatsApp."}
        </p>
      </div>
    </div>
  );
}
