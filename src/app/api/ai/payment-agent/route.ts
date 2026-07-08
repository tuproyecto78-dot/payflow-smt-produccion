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
  source: "openrouter" | "zai" | "mock";
  error?: string;
}

/**
 * POST /api/ai/payment-agent
 *
 * Calls the AI provider configured via AI_PROVIDER env var.
 * Supported providers: "openrouter", "zai", "mock" (default).
 *
 * When AI_PROVIDER=openrouter, calls OpenRouter exclusively (never Z.ai).
 * When AI_PROVIDER=zai, calls Z.ai.
 * When AI_PROVIDER=mock (or unset), returns a mock response.
 *
 * SECURITY:
 *   - API keys are NEVER exposed to the frontend.
 *   - No NEXT_PUBLIC_* variables are used for API keys.
 *   - The AI agent can NEVER mark payment_success.
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

  // ─── Dynamic AI provider routing ──────────────────────────────────
  const aiProvider = (process.env.AI_PROVIDER || "mock").toLowerCase();
  const mockReply = "Confirmo que deseas continuar con el pago.";

  let providerName: "openrouter" | "zai" | "mock";
  let apiKey: string | undefined;
  let endpoint: string;
  let model: string;

  if (aiProvider === "openrouter") {
    providerName = "openrouter";
    apiKey = process.env.OPENROUTER_API_KEY;
    const baseUrl = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
    model = process.env.OPENROUTER_MODEL || "openrouter/free";
    endpoint = `${baseUrl}/chat/completions`;
  } else if (aiProvider === "zai") {
    providerName = "zai";
    apiKey = process.env.ZAI_API_KEY;
    const baseUrl = process.env.ZAI_BASE_URL || "https://api.z.ai/api/coding/paas/v4";
    model = process.env.ZAI_MODEL || "glm-5.1";
    endpoint = `${baseUrl}/chat/completions`;
  } else {
    providerName = "mock";
    apiKey = undefined;
    endpoint = "";
    model = "mock";
  }

  console.log("[/api/ai/payment-agent] execution:", {
    provider: providerName,
    model,
    endpoint,
    hasApiKey: !!apiKey,
  });

  // Mock provider — no external call.
  if (providerName === "mock") {
    const intentToPay = /s[ií]|confirmar|pagar|continuar|acepto|quiero|yes|y/i.test(userResponse);
    return NextResponse.json({
      intent_to_pay: intentToPay,
      reply: intentToPay ? mockReply : "¿Podrías confirmar si deseas continuar con el pago?",
      next_action: intentToPay ? "create_payment" : "clarify",
      source: "mock",
    });
  }

  // Missing API key for the selected provider.
  if (!apiKey) {
    const keyName = providerName === "openrouter" ? "OPENROUTER_API_KEY" : "ZAI_API_KEY";
    console.warn(`[/api/ai/payment-agent] Missing ${keyName}`);
    return NextResponse.json({
      intent_to_pay: true,
      reply: mockReply,
      next_action: "create_payment",
      source: "mock",
      error: `Falta ${keyName}. Se usó respuesta simulada.`,
    });
  }

  // Call the selected provider.
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
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
      const reply = data?.choices?.[0]?.message?.content || mockReply;
      const intentToPay = /s[ií]|confirmar|pagar|continuar|acepto|quiero/i.test(userResponse);

      console.log(`[/api/ai/payment-agent] ${providerName} success:`, {
        provider: providerName,
        model,
        httpStatus: res.status,
        responseLength: reply.length,
      });

      return NextResponse.json({
        intent_to_pay: intentToPay,
        reply: String(reply).slice(0, 500),
        next_action: intentToPay ? "create_payment" : "clarify",
        source: providerName,
      });
    }

    // Provider returned an error.
    const errText = await res.text().catch(() => "");
    console.error(`[/api/ai/payment-agent] ${providerName} error:`, {
      provider: providerName,
      status: res.status,
      body: errText.slice(0, 500),
    });

    let errorMsg: string;
    if (res.status === 401 || res.status === 403) {
      errorMsg = providerName === "openrouter"
        ? "OPENROUTER_API_KEY inválida."
        : "ZAI_API_KEY inválida.";
    } else if (res.status === 429) {
      errorMsg = providerName === "openrouter"
        ? "Límite de uso en OpenRouter."
        : "Saldo insuficiente en Z.ai.";
    } else {
      errorMsg = `Falló ${providerName} (HTTP ${res.status}).`;
    }

    return NextResponse.json({
      intent_to_pay: true,
      reply: mockReply,
      next_action: "create_payment",
      source: "mock",
      error: `${errorMsg} Se usó respuesta simulada.`,
    });
  } catch (err) {
    console.error(`[/api/ai/payment-agent] ${providerName} fetch failed:`, err);
    return NextResponse.json({
      intent_to_pay: true,
      reply: mockReply,
      next_action: "create_payment",
      source: "mock",
      error: `No se pudo conectar con ${providerName}. Se usó respuesta simulada.`,
    });
  }
}
