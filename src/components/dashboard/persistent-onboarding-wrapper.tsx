"use client";

import { useEffect, useRef } from "react";
import { CreateFlowDialog as FlexibleOnboardingDialog } from "./flexible-onboarding-dialog";

type Props = React.ComponentProps<typeof FlexibleOnboardingDialog>;

/**
 * Keeps the structured result returned by /api/knowledge/process and adds it to
 * the final onboarding request. The visual wizard remains unchanged; this
 * wrapper only repairs the data hand-off that previously kept counts but threw
 * away the actual products and knowledge before saving.
 */
export function CreateFlowDialog(props: Props) {
  const detectedRef = useRef<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!props.open) {
      detectedRef.current = null;
      return;
    }

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const response = await originalFetch(input, init);

      if (url.includes("/api/knowledge/process") && response.ok) {
        try {
          const payload = await response.clone().json();
          if (payload?.merged && typeof payload.merged === "object") {
            detectedRef.current = payload.merged as Record<string, unknown>;
          }
        } catch {
          // The original response remains untouched; the wizard will show its own error.
        }
      }

      if (url.includes("/api/workflows/create-flexible-onboarding") && init?.body) {
        try {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          const businessName = String(body.businessName || "");
          body.detectedKnowledge = detectedRef.current;
          body.isDemo = /\b(demo|prueba|test)\b/i.test(businessName);
          return originalFetch(input, { ...init, body: JSON.stringify(body) });
        } catch {
          return response;
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
