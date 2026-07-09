import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAIConfig, logAIConfig } from "@/lib/ai/config";

export const dynamic = "force-dynamic";

interface FlowAssistantRequest {
  userMessage?: string;
  currentStep?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}

interface FlowSuggestions {
  template?: string;
  businessType?: string;
  mainProductOrService?: string;
  welcomeMessage?: string;
  agentTone?: string;
  scheduleDays?: string;
  scheduleHours?: string;
  modules?: string[];
  paymentProvider?: string;
}

interface FlowAssistantResponse {
  reply: string;
  suggestions: FlowSuggestions;
  warnings: string[];
  missingFields: string[];
  nextQuestion?: string;
}

// ─── System prompt ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres "Asistente PayFlow", un copiloto IA experto en crear flujos de WhatsApp con IA, agenda, catálogo y PayPhone API Link.

ACTÚA COMO UN ASESOR HUMANO:
- Haz UNA pregunta a la vez, no todas juntas.
- Escucha la respuesta del usuario y adapta tu siguiente pregunta.
- Sé cálido, breve y específico.
- Mantén el contexto de toda la conversación.
- Cuando tengas suficiente información, genera sugerencias estructuradas.

SI EL USUARIO PREGUNTA "¿En qué me puedes ayudar?":
Responde: "Puedo ayudarte a elegir la plantilla correcta, redactar mensajes de WhatsApp, definir preguntas para tus clientes, configurar agenda, catálogo o PayPhone, validar si falta información y dejar listo el flujo para probarlo."

FLUJO DE PREGUNTAS:
1. ¿Qué tipo de negocio tienes?
2. ¿Qué quieres automatizar por WhatsApp?
3. ¿Quieres responder preguntas, vender, agendar o cobrar?
4. ¿Quieres cobrar con link seguro PayPhone?
5. ¿Cuál es tu horario?
6. ¿Qué tono quieres que use el agente?
7. ¿Quieres que cree el flujo sugerido?

REGLAS:
1. NUNCA confirmes pagos exitosos.
2. NO pidas tokens ni StoreID al usuario.
3. NO muestres secretos ni credenciales.
4. Usa siempre "PayPhone API Link" o "link seguro PayPhone".
5. NO uses "API Sale" ni "cobro sin salir de WhatsApp".
6. Responde en español, de forma breve y amable.
7. Incluye "Bienes raíces" como tipo de negocio (inmobiliaria, propiedades).
8. Si el usuario saluda, responde explicando brevemente cómo puedes ayudar.

Devuelve SOLO JSON válido:
{"reply":"texto conversacional","suggestions":{"template":"...","businessType":"...","mainProductOrService":"...","welcomeMessage":"...","agentTone":"...","scheduleDays":"...","scheduleHours":"...","modules":[],"paymentProvider":"..."},"warnings":[],"missingFields":[],"nextQuestion":"..."}

Templates: solo_ia, ia_agenda, ia_catalogo, ia_payphone, ia_agenda_payphone, agente_completo
BusinessTypes: medica, clinica, abogado, comercio, ecommerce, belleza, spa, restaurante, educacion, profesional, bienes_raices, otro
AgentTones: amable, profesional, cercano, formal, comercial, empatico
ScheduleDays: lun-vie, lun-sab, todos, personalizado
PaymentProviders: payphone_api_link, mock, none

Si el usuario aún no ha dado suficiente información, devuelve suggestions vacío {} y nextQuestion con la siguiente pregunta.`;

// ─── Local fallback suggestions ───────────────────────────────────────

const LOCAL_SUGGESTIONS: Record<string, FlowSuggestions & { reply: string; nextQuestion: string }> = {
  bienes_raices: {
    template: "ia_agenda_payphone",
    businessType: "bienes_raices",
    mainProductOrService: "Captación de clientes / agenda de visitas / información de propiedades",
    welcomeMessage: "¡Hola! 👋 Bienvenido/a. Soy el asistente virtual de nuestra inmobiliaria. Puedo ayudarte con información de propiedades, agendar visitas y guiarte en el proceso de reserva.",
    agentTone: "profesional",
    scheduleDays: "lun-sab",
    scheduleHours: "09h00 - 18h00",
    modules: ["ai_agent", "agenda", "payphone"],
    paymentProvider: "payphone_api_link",
    reply: "Para una inmobiliaria te recomiendo IA + Agenda + PayPhone Business. El asistente puede captar compradores, agendar visitas, filtrar por presupuesto y cobrar reservas con link seguro PayPhone. ¿Quieres incluir cobro de reservas?",
    nextQuestion: "¿Quieres que el asistente también filtre compradores por presupuesto o ciudad?",
  },
  clinica: {
    template: "ia_payphone",
    businessType: "clinica",
    mainProductOrService: "Cita médica / consulta especializada",
    welcomeMessage: "¡Hola! 👋 Bienvenido/a a nuestra clínica. Estoy aquí para ayudarte con información, citas y pagos de forma rápida y segura.",
    agentTone: "empatico",
    scheduleDays: "lun-vie",
    scheduleHours: "09h00 - 18h00",
    modules: ["ai_agent", "payphone"],
    paymentProvider: "payphone_api_link",
    reply: "Para una clínica recomiendo IA + PayPhone, tono empático. ¿Quieres que aplique estas sugerencias?",
    nextQuestion: "¿Cuál es el número de WhatsApp de la clínica?",
  },
  medica: {
    template: "ia_payphone",
    businessType: "medica",
    mainProductOrService: "Consulta médica",
    welcomeMessage: "¡Hola! 👋 Bienvenido/a. Soy el asistente virtual de nuestro consultorio. Puedo ayudarte a agendar tu consulta, resolver dudas y guiarte con el pago.",
    agentTone: "empatico",
    scheduleDays: "lun-vie",
    scheduleHours: "08h00 - 17h00",
    modules: ["ai_agent", "payphone"],
    paymentProvider: "payphone_api_link",
    reply: "Para un consultorio médico sugiero IA + PayPhone, tono empático. ¿Aplico estas sugerencias?",
    nextQuestion: "¿Cuál es el número de WhatsApp del consultorio?",
  },
  restaurante: {
    template: "ia_catalogo",
    businessType: "restaurante",
    mainProductOrService: "Pedido de comida",
    welcomeMessage: "¡Hola! 👋 Bienvenido/a. Puedo ayudarte a tomar tu pedido, confirmar detalles y procesar tu pago por WhatsApp.",
    agentTone: "comercial",
    scheduleDays: "todos",
    scheduleHours: "11h00 - 22h00",
    modules: ["ai_agent", "catalog"],
    paymentProvider: "mock",
    reply: "Para un restaurante recomiendo IA + Catálogo, tono comercial. ¿Quieres que aplique estas sugerencias?",
    nextQuestion: "¿Cuál es el número de WhatsApp del restaurante?",
  },
  spa: {
    template: "ia_agenda_payphone",
    businessType: "spa",
    mainProductOrService: "Reserva de tratamiento",
    welcomeMessage: "¡Hola! 👋 Bienvenido/a a nuestro spa. Puedo ayudarte a reservar tu tratamiento, revisar horarios disponibles y gestionar tu pago.",
    agentTone: "amable",
    scheduleDays: "lun-sab",
    scheduleHours: "09h00 - 19h00",
    modules: ["ai_agent", "agenda", "payphone"],
    paymentProvider: "payphone_api_link",
    reply: "Para un spa sugiero IA + Agenda + PayPhone, tono amable. ¿Aplico estas sugerencias?",
    nextQuestion: "¿Cuál es el número de WhatsApp del spa?",
  },
  tienda: {
    template: "ia_catalogo",
    businessType: "comercio",
    mainProductOrService: "Venta de productos",
    welcomeMessage: "¡Hola! 👋 Bienvenido/a. Estoy aquí para ayudarte con tus compras, disponibilidad de productos y pagos por WhatsApp.",
    agentTone: "comercial",
    scheduleDays: "lun-vie",
    scheduleHours: "09h00 - 18h00",
    modules: ["ai_agent", "catalog"],
    paymentProvider: "mock",
    reply: "Para una tienda recomiendo IA + Catálogo, tono comercial. ¿Aplico estas sugerencias?",
    nextQuestion: "¿Cuál es el número de WhatsApp de la tienda?",
  },
  default: {
    template: "solo_ia",
    businessType: "otro",
    mainProductOrService: "Servicio principal",
    welcomeMessage: "¡Hola! 👋 Bienvenido/a. Soy el asistente virtual de nuestro negocio. Puedo ayudarte con información, atención y pagos por WhatsApp.",
    agentTone: "amable",
    scheduleDays: "lun-vie",
    scheduleHours: "09h00 - 18h00",
    modules: ["ai_agent"],
    paymentProvider: "none",
    reply: "Te sugiero comenzar con la plantilla 'Solo IA' y un tono amable. Puedes ajustar los detalles en cada paso. ¿Quieres que aplique estas sugerencias?",
    nextQuestion: "¿Cuál es el nombre de tu negocio?",
  },
};

function detectBusinessType(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("inmobiliaria") || lower.includes("bienes raíces") || lower.includes("bienes raices") || lower.includes("propiedades") || lower.includes("casas") || lower.includes("departamentos") || lower.includes("terrenos") || lower.includes("alquil")) return "bienes_raices";
  if (lower.includes("clínica") || lower.includes("clinica")) return "clinica";
  if (lower.includes("médic") || lower.includes("medic") || lower.includes("consultorio") || lower.includes("doctor")) return "medica";
  if (lower.includes("restaurante") || lower.includes("comida") || lower.includes("pedido")) return "restaurante";
  if (lower.includes("spa") || lower.includes("tratamiento") || lower.includes("belleza") || lower.includes("salón") || lower.includes("salon")) return "spa";
  if (lower.includes("tienda") || lower.includes("comercio") || lower.includes("vender") || lower.includes("venta")) return "tienda";
  if (lower.includes("abogado") || lower.includes("legal") || lower.includes("despacho")) return "default";
  if (lower.includes("educación") || lower.includes("educacion") || lower.includes("curso") || lower.includes("matrícula") || lower.includes("matricula")) return "default";
  return "default";
}

function localFallback(userMessage: string): FlowAssistantResponse {
  const detectedType = detectBusinessType(userMessage);
  const local = LOCAL_SUGGESTIONS[detectedType] || LOCAL_SUGGESTIONS.default;
  return {
    reply: local.reply,
    suggestions: {
      template: local.template,
      businessType: local.businessType,
      mainProductOrService: local.mainProductOrService,
      welcomeMessage: local.welcomeMessage,
      agentTone: local.agentTone,
      scheduleDays: local.scheduleDays,
      scheduleHours: local.scheduleHours,
      modules: local.modules,
      paymentProvider: local.paymentProvider,
    },
    warnings: [],
    missingFields: [],
    nextQuestion: local.nextQuestion,
  };
}

/**
 * POST /api/ai/flow-assistant
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Tu sesión expiró. Inicia sesión nuevamente." },
      { status: 401 }
    );
  }

  let body: FlowAssistantRequest = {};
  try {
    body = await req.json();
  } catch {
    // allow empty body
  }

  const userMessage = String(body.userMessage || "").trim();
  if (!userMessage) {
    return NextResponse.json({
      reply: "Cuéntame qué tipo de negocio tienes y qué quieres automatizar por WhatsApp.",
      suggestions: {},
      warnings: [],
      missingFields: ["userMessage"],
      nextQuestion: "¿Qué tipo de negocio tienes?",
    } satisfies FlowAssistantResponse);
  }

  // ─── Get AI config ─────────────────────────────────────────────────
  const cfg = getAIConfig();
  logAIConfig();

  // ─── If mock or no API key, use local fallback ─────────────────────
  if (cfg.provider === "mock" || !cfg.hasApiKey) {
    console.log("[/api/ai/flow-assistant] Using local fallback (no AI configured)");
    return NextResponse.json(localFallback(userMessage));
  }

  // ─── Build messages with conversation history ──────────────────────
  const historyMessages: Array<{ role: string; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  const history = body.conversationHistory || [];
  const recentHistory = history.slice(-10);
  for (const msg of recentHistory) {
    if (msg.role === "user" || msg.role === "assistant") {
      historyMessages.push({ role: msg.role, content: msg.content });
    }
  }

  // Add current user message if not already last in history
  const lastMsg = recentHistory[recentHistory.length - 1];
  if (!lastMsg || lastMsg.content !== userMessage) {
    historyMessages.push({ role: "user", content: userMessage });
  }

  console.log("[/api/ai/flow-assistant] calling AI:", {
    provider: cfg.provider,
    model: cfg.model,
    endpoint: cfg.endpoint,
    messageCount: historyMessages.length,
  });

  // ─── Call AI provider ──────────────────────────────────────────────
  // Helper function to call any AI provider
  async function callProvider(providerCfg: { provider: string; apiKey: string; endpoint: string; model: string; }): Promise<{ ok: boolean; content: string; status: number; statusText: string; }> {
    const res = await fetch(providerCfg.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${providerCfg.apiKey}`,
        "Content-Type": "application/json",
        ...(providerCfg.provider === "openrouter" && {
          "HTTP-Referer": "https://payflow-smt.vercel.app",
          "X-Title": "PayFlow SMT",
        }),
      },
      body: JSON.stringify({
        model: providerCfg.model,
        messages: historyMessages,
        temperature: 0.4,
        max_tokens: 600,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      return { ok: false, content: "", status: res.status, statusText: res.statusText };
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || "";
    return { ok: true, content, status: res.status, statusText: "OK" };
  }

  // ─── Try primary provider ──────────────────────────────────────────
  try {
    console.log("[/api/ai/flow-assistant] calling primary AI:", {
      provider: cfg.provider,
      model: cfg.model,
      endpoint: cfg.endpoint,
      messageCount: historyMessages.length,
    });

    const result = await callProvider({
      provider: cfg.provider,
      apiKey: cfg.apiKey!,
      endpoint: cfg.endpoint,
      model: cfg.model,
    });

    if (result.ok) {
      console.log("[/api/ai/flow-assistant] primary AI success:", {
        contentLength: result.content.length,
        contentPreview: result.content.slice(0, 200),
      });

      // Try to parse JSON from the AI response
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return NextResponse.json({
            reply: String(parsed.reply || result.content.slice(0, 500)).slice(0, 500),
            suggestions: {
              template: parsed.suggestions?.template,
              businessType: parsed.suggestions?.businessType,
              mainProductOrService: parsed.suggestions?.mainProductOrService,
              welcomeMessage: parsed.suggestions?.welcomeMessage,
              agentTone: parsed.suggestions?.agentTone,
              scheduleDays: parsed.suggestions?.scheduleDays,
              scheduleHours: parsed.suggestions?.scheduleHours,
              modules: Array.isArray(parsed.suggestions?.modules) ? parsed.suggestions.modules : [],
              paymentProvider: parsed.suggestions?.paymentProvider || "none",
            },
            warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
            missingFields: Array.isArray(parsed.missingFields) ? parsed.missingFields : [],
            nextQuestion: parsed.nextQuestion,
          } satisfies FlowAssistantResponse);
        } catch {
          // JSON parse failed — use raw content
        }
      }

      // No JSON — use raw content as reply (this is a REAL AI response)
      return NextResponse.json({
        reply: result.content.slice(0, 500) || "Lo siento, no pude procesar tu solicitud.",
        suggestions: {},
        warnings: [],
        missingFields: [],
      } satisfies FlowAssistantResponse);
    }

    // ─── Primary failed — try fallback providers ─────────────────────
    console.warn("[/api/ai/flow-assistant] primary AI failed:", result.status);

    // If primary was OpenRouter and ZAI_API_KEY exists, try Z.ai
    if (cfg.provider === "openrouter") {
      const zaiKey = process.env.ZAI_API_KEY?.trim();
      if (zaiKey) {
        const zaiBase = process.env.ZAI_BASE_URL?.trim() || "https://api.z.ai/api/coding/paas/v4";
        const zaiModel = process.env.ZAI_MODEL?.trim() || "glm-4-flash";
        console.log("[/api/ai/flow-assistant] falling back to Z.ai:", { model: zaiModel });

        try {
          const zaiResult = await callProvider({
            provider: "zai",
            apiKey: zaiKey,
            endpoint: `${zaiBase}/chat/completions`,
            model: zaiModel,
          });

          if (zaiResult.ok) {
            console.log("[/api/ai/flow-assistant] Z.ai fallback success:", {
              contentLength: zaiResult.content.length,
            });

            const jsonMatch = zaiResult.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                const parsed = JSON.parse(jsonMatch[0]);
                return NextResponse.json({
                  reply: String(parsed.reply || zaiResult.content.slice(0, 500)).slice(0, 500),
                  suggestions: {
                    template: parsed.suggestions?.template,
                    businessType: parsed.suggestions?.businessType,
                    mainProductOrService: parsed.suggestions?.mainProductOrService,
                    welcomeMessage: parsed.suggestions?.welcomeMessage,
                    agentTone: parsed.suggestions?.agentTone,
                    scheduleDays: parsed.suggestions?.scheduleDays,
                    scheduleHours: parsed.suggestions?.scheduleHours,
                    modules: Array.isArray(parsed.suggestions?.modules) ? parsed.suggestions.modules : [],
                    paymentProvider: parsed.suggestions?.paymentProvider || "none",
                  },
                  warnings: [],
                  missingFields: [],
                  nextQuestion: parsed.nextQuestion,
                } satisfies FlowAssistantResponse);
              } catch {}
            }

            return NextResponse.json({
              reply: zaiResult.content.slice(0, 500) || "Lo siento, no pude procesar tu solicitud.",
              suggestions: {},
              warnings: [],
              missingFields: [],
            } satisfies FlowAssistantResponse);
          }
          console.warn("[/api/ai/flow-assistant] Z.ai also failed:", zaiResult.status);
        } catch (zaiErr) {
          console.warn("[/api/ai/flow-assistant] Z.ai fetch failed:", zaiErr);
        }
      }
    }

    // If primary was Z.ai and OPENROUTER_API_KEY exists, try OpenRouter
    if (cfg.provider === "zai") {
      const orKey = process.env.OPENROUTER_API_KEY?.trim();
      if (orKey) {
        const orBase = process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1";
        let orModel = process.env.OPENROUTER_MODEL?.trim() || "meta-llama/llama-3.2-3b-instruct:free";
        if (orModel === "openrouter/free" || orModel === "free") {
          orModel = "meta-llama/llama-3.2-3b-instruct:free";
        }
        console.log("[/api/ai/flow-assistant] falling back to OpenRouter:", { model: orModel });

        try {
          const orResult = await callProvider({
            provider: "openrouter",
            apiKey: orKey,
            endpoint: `${orBase}/chat/completions`,
            model: orModel,
          });

          if (orResult.ok) {
            const jsonMatch = orResult.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                const parsed = JSON.parse(jsonMatch[0]);
                return NextResponse.json({
                  reply: String(parsed.reply || orResult.content.slice(0, 500)).slice(0, 500),
                  suggestions: {
                    template: parsed.suggestions?.template,
                    businessType: parsed.suggestions?.businessType,
                    mainProductOrService: parsed.suggestions?.mainProductOrService,
                    welcomeMessage: parsed.suggestions?.welcomeMessage,
                    agentTone: parsed.suggestions?.agentTone,
                    scheduleDays: parsed.suggestions?.scheduleDays,
                    scheduleHours: parsed.suggestions?.scheduleHours,
                    modules: Array.isArray(parsed.suggestions?.modules) ? parsed.suggestions.modules : [],
                    paymentProvider: parsed.suggestions?.paymentProvider || "none",
                  },
                  warnings: [],
                  missingFields: [],
                  nextQuestion: parsed.nextQuestion,
                } satisfies FlowAssistantResponse);
              } catch {}
            }

            return NextResponse.json({
              reply: orResult.content.slice(0, 500) || "Lo siento, no pude procesar tu solicitud.",
              suggestions: {},
              warnings: [],
              missingFields: [],
            } satisfies FlowAssistantResponse);
          }
        } catch (orErr) {
          console.warn("[/api/ai/flow-assistant] OpenRouter fallback failed:", orErr);
        }
      }
    }

    // ─── All AI providers failed — use local fallback ────────────────
    console.warn("[/api/ai/flow-assistant] All AI providers failed, using local fallback");
    const fallback = localFallback(userMessage);
    return NextResponse.json({
      reply: "No pude conectar con la IA en este momento, pero te ayudo con sugerencias locales.\n\n" + fallback.reply,
      suggestions: fallback.suggestions,
      warnings: ["AI_UNAVAILABLE"],
      missingFields: [],
      nextQuestion: fallback.nextQuestion,
    } satisfies FlowAssistantResponse);

  } catch (err) {
    console.warn("[/api/ai/flow-assistant] AI fetch failed:", err instanceof Error ? err.message : String(err));
    const fallback = localFallback(userMessage);
    return NextResponse.json({
      reply: "No pude conectar con la IA en este momento, pero te ayudo con sugerencias locales.\n\n" + fallback.reply,
      suggestions: fallback.suggestions,
      warnings: ["AI_UNAVAILABLE"],
      missingFields: [],
      nextQuestion: fallback.nextQuestion,
    } satisfies FlowAssistantResponse);
  }
}
