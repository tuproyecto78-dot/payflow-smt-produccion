import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

interface PaymentAgentRequest {
  user_response?: string;
  systemPrompt?: string;
  userPrompt?: string;
}

interface PaymentAgentResponse {
  intent_to_pay: boolean;
  reply: string;
  next_action: "create_payment" | "cancel" | "clarify";
  source: "zai" | "mock";
  error?: string;
}

/**
 * POST /api/ai/payment-agent
 *
 * Calls Z.ai (if configured) to process a user's payment intent.
 * If Z.ai is not configured or fails, returns a safe mock response.
 *
 * SECURITY:
 *   - ZAI_API_KEY is NEVER exposed to the frontend.
 *   - No NEXT_PUBLIC_ZAI_* variables are used.
 *   - The AI agent can NEVER mark payment_success — it only confirms
 *     the user's intent to pay.
 *
 * Response:
 *   {
 *     intent_to_pay: true,
 *     reply: "Confirmo que deseas continuar con el pago.",
 *     next_action: "create_payment",
 *     source: "zai" | "mock"
 *   }
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Tu sesión expiró. Inicia sesión nuevamente." },
      { status: 401 }
    );
  }

  let body: PaymentAgentRequest = {};
  try {
    body = await req.json();
  } catch {
    // allow empty body
  }

  const userResponse = String(body.user_response || "").trim();
  const systemPrompt =
    body.systemPrompt ||
    "Eres un agente de cobros por WhatsApp. Confirmas la intención de pago del cliente de forma amable y breve. REGLA: nunca confirmas pagos exitosos, solo confirmas la intención del cliente.";
  const userPrompt =
    body.userPrompt ||
    `El cliente respondió: ${userResponse}\n\nConfirma si el cliente tiene intención de pagar.`;

  // ─── Try Z.ai if configured ───────────────────────────────────────
  const zaiApiKey = process.env.ZAI_API_KEY;
  const zaiBaseUrl = process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4";
  const zaiModel = process.env.ZAI_MODEL || "glm-4-flash";

  if (zaiApiKey) {
    try {
      const res = await fetch(`${zaiBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${zaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: zaiModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 200,
        }),
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        const reply =
          data?.choices?.[0]?.message?.content ||
          "Confirmo que deseas continuar con el pago.";

        // The AI can only confirm intent — it can NEVER mark payment_success.
        const intentToPay = /s[ií]|confirmar|pagar|continuar|acepto|quiero/i.test(
          userResponse
        );

        const agentResponse: PaymentAgentResponse = {
          intent_to_pay: intentToPay,
          reply: String(reply).slice(0, 500),
          next_action: intentToPay ? "create_payment" : "clarify",
          source: "zai",
        };

        return NextResponse.json(agentResponse);
      }

      // Z.ai returned an error — fall back to mock.
      console.warn("[/api/ai/payment-agent] Z.ai error:", res.status);
      return NextResponse.json({
        intent_to_pay: true,
        reply: "Confirmo que deseas continuar con el pago.",
        next_action: "create_payment",
        source: "mock",
        error: "No se pudo contactar la IA. Se usó respuesta simulada.",
      });
    } catch (err) {
      console.warn("[/api/ai/payment-agent] Z.ai fetch failed:", err);
      return NextResponse.json({
        intent_to_pay: true,
        reply: "Confirmo que deseas continuar con el pago.",
        next_action: "create_payment",
        source: "mock",
        error: "No se pudo contactar la IA. Se usó respuesta simulada.",
      });
    }
  }

  // ─── Mock fallback (Z.ai not configured) ──────────────────────────
  const intentToPay = /s[ií]|confirmar|pagar|continuar|acepto|quiero|yes|y/i.test(
    userResponse
  );

  const agentResponse: PaymentAgentResponse = {
    intent_to_pay: intentToPay,
    reply: intentToPay
      ? "Confirmo que deseas continuar con el pago."
      : "¿Podrías confirmar si deseas continuar con el pago?",
    next_action: intentToPay ? "create_payment" : "clarify",
    source: "mock",
  };

  return NextResponse.json(agentResponse);
}
