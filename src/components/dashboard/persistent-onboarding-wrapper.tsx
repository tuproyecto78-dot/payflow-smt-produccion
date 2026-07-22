"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { CreateFlowDialog as FlexibleOnboardingDialog } from "./flexible-onboarding-dialog";

type Props = ComponentProps<typeof FlexibleOnboardingDialog>;

type KnowledgeSource = {
  source_id?: string;
  type?: string;
  name?: string;
  rawText?: string;
  rows?: Record<string, string>[];
  headers?: string[];
};

function detectedPromotions(sources: KnowledgeSource[]) {
  return sources
    .map((source) => String(source.rawText || "").trim())
    .filter((text) => /promoci[oó]n|descuento|oferta|2x1|happy hour/i.test(text))
    .join("\n\n")
    .slice(0, 12000);
}

/**
 * Repairs the data hand-off without changing the approved visual wizard. The
 * original dialog only retained counters after processing; this wrapper keeps
 * the structured products and source text until the final persistent request.
 */
export function CreateFlowDialog(props: Props) {
  const detectedRef = useRef<Record<string, unknown> | null>(null);
  const sourcesRef = useRef<KnowledgeSource[]>([]);

  useEffect(() => {
    if (!props.open) {
      detectedRef.current = null;
      sourcesRef.current = [];
      return;
    }

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : input.url;

      // Enrich before sending, so the onboarding endpoint is called exactly once.
      if (url.includes("/api/workflows/create-flexible-onboarding") && init?.body) {
        try {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          const businessName = String(body.businessName || "");
          body.detectedKnowledge = detectedRef.current;
          body.knowledgeSources = sourcesRef.current;
          body.isDemo = /\b(demo|prueba|test)\b/i.test(businessName);

          const response = await originalFetch(input, {
            ...init,
            body: JSON.stringify(body),
          });

          if (response.ok) {
            try {
              const payload = await response.clone().json();
              const clientId = typeof payload.client_id === "string" ? payload.client_id : "";
              const promotions = detectedPromotions(sourcesRef.current);
              if (clientId && promotions) {
                const promotionResponse = await originalFetch(
                  `/api/admin/clients/${encodeURIComponent(clientId)}/promotions`,
                  {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ promotions }),
                  }
                );
                if (!promotionResponse.ok) {
                  console.warn("[persistent-onboarding] promotions could not be linked to AI");
                }
              }
            } catch (promotionError) {
              console.warn("[persistent-onboarding] promotions hand-off failed", promotionError);
            }
          }

          return response;
        } catch {
          return originalFetch(input, init);
        }
      }

      if (url.includes("/api/knowledge/process") && init?.body) {
        try {
          const requestPayload = JSON.parse(String(init.body)) as {
            sources?: KnowledgeSource[];
          };
          sourcesRef.current = Array.isArray(requestPayload.sources)
            ? requestPayload.sources
            : [];
        } catch {
          sourcesRef.current = [];
        }
      }

      const response = await originalFetch(input, init);
      if (url.includes("/api/knowledge/process") && response.ok) {
        try {
          const payload = await response.clone().json();
          if (payload?.merged && typeof payload.merged === "object") {
            detectedRef.current = payload.merged as Record<string, unknown>;
          }
        } catch {
          // The original response remains untouched; the dialog handles errors.
        }
      }
      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [props.open]);

  return <FlexibleOnboardingDialog {...props} />;
}
