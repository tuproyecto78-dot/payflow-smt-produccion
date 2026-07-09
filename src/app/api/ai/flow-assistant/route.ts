import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

interface FlowAssistantRequest {
  userMessage?: string;
  currentStep?: string;
  currentForm?: Record<string, unknown>;
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

// ─── Local fallback suggestions by business type ─────────────────────

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
    reply: "Perfecto. Para una inmobiliaria te recomiendo la plantilla IA + Agenda + PayPhone Business. El asistente puede captar compradores, agendar visitas, filtrar por presupuesto y cobrar reservas con link seguro PayPhone. Sugiero un tono profesional y horario de lunes a sábado 9h-18h. ¿Quieres que incluya cobro de reservas con PayPhone?",
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
    reply: "Perfecto. Para una clínica recomiendo: plantilla IA + PayPhone Business, tipo de negocio Clínica, servicio 'Cita médica / consulta especializada', tono empático y horario de lunes a viernes 9h-18h. ¿Quieres que aplique estas sugerencias?",
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
    reply: "Para un consultorio médico sugiero: plantilla IA + PayPhone Business, tono empático, horario lunes a viernes 8h-17h. ¿Aplico estas sugerencias?",
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
    reply: "Para un restaurante recomiendo: plantilla IA + Catálogo, servicio 'Pedido de comida', tono comercial, horario todos los días 11h-22h. ¿Quieres que aplique estas sugerencias?",
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
    reply: "Para un spa sugiero: plantilla IA + Agenda + PayPhone, servicio 'Reserva de tratamiento', tono amable, horario lunes a sábado 9h-19h con anticipo. ¿Aplico estas sugerencias?",
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
    reply: "Para una tienda recomiendo: plantilla IA + Catálogo, servicio 'Venta de productos', tono comercial. ¿Quieres que aplique estas sugerencias?",
    nextQuestion: "¿Cuál es el número de WhatsApp de la tienda?",
  },
  comercio: {
    template: "ia_catalogo",
    businessType: "comercio",
    mainProductOrService: "Venta de productos",
    welcomeMessage: "¡Hola! 👋 Bienvenido/a. Estoy aquí para ayudarte con tus compras, disponibilidad de productos y pagos por WhatsApp.",
    agentTone: "comercial",
    scheduleDays: "lun-vie",
    scheduleHours: "09h00 - 18h00",
    modules: ["ai_agent", "catalog"],
    paymentProvider: "mock",
    reply: "Para un comercio recomiendo: plantilla IA + Catálogo, tono comercial. ¿Aplico estas sugerencias?",
    nextQuestion: "¿Cuál es el número de WhatsApp del negocio?",
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
    reply: "Entiendo. Te sugiero comenzar con la plantilla 'Solo IA' y un tono amable. Puedes ajustar los detalles en cada paso. ¿Quieres que aplique estas sugerencias?",
    nextQuestion: "¿Cuál es el nombre de tu negocio?",
  },
};

function detectBusinessType(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("inmobiliaria") || lower.includes("bienes raíces") || lower.includes("bienes raices") || lower.includes("propiedades") || lower.includes("casas") || lower.includes("departamentos") || lower.includes("terrenos") || lower.includes("alquil")) return "bienes_raices";
  if (lower.includes("clínica") || lower.includes("clinica")) return "clinica";
  if (lower.includes("médic") || lower.includes("medic") || lower.includes("consultorio") || lower.includes("doctor")) return "medica";
  if (lower.includes("restaurante") || lower.includes("comida") || lower.includes("pedido")) return "restaurante";
  if (lower.includes("spa") || lower.includes("tratamiento")) return "spa";
  if (lower.includes("belleza") || lower.includes("salón") || lower.includes("salon")) return "spa";
  if (lower.includes("tienda") || lower.includes("comercio") || lower.includes("vender") || lower.includes("venta")) return "tienda";
  if (lower.includes("abogado") || lower.includes("legal") || lower.includes("despacho")) return "default";
  if (lower.includes("educación") || lower.includes("educacion") || lower.includes("curso") || lower.includes("matrícula") || lower.includes("matricula")) return "default";
  return "default";
}

/**
 * POST /api/ai/flow-assistant
 *
 * AI-powered flow creation assistant. Uses the configured AI provider
 * (OpenRouter/Z.ai) to suggest flow configuration based on the user's
 * message. Falls back to local suggestions if AI is not available.
 *
 * SECURITY:
 *   - API keys are NEVER exposed to the frontend.
 *   - The AI can NEVER confirm payments.
 *   - No tokens, StoreID, or secrets are returned.
 *   - Uses "PayPhone API Link" and "link seguro PayPhone" terminology.
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

  // ─── Try AI provider if configured ────────────────────────────────
  const aiProvider = (process.env.AI_PROVIDER || "mock").toLowerCase();

  if (aiProvider !== "mock") {
    let apiKey: string | undefined;
    let endpoint: string;
    let model: string;

    if (aiProvider === "openrouter") {
      apiKey = process.env.OPENROUTER_API_KEY;
      const baseUrl = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
      model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.2-3b-instruct:free";
      endpoint = `${baseUrl}/chat/completions`;
    } else {
      apiKey = process.env.ZAI_API_KEY;
      const baseUrl = process.env.ZAI_BASE_URL || "https://api.z.ai/api/coding/paas/v4";
      model = process.env.ZAI_MODEL || "glm-5.1";
      endpoint = `${baseUrl}/chat/completions`;
    }

    if (apiKey) {
      try {
        const systemPrompt = `Eres "Asistente PayFlow", un copiloto IA que ayuda a configurar flujos de automatización de WhatsApp para PayFlow SMT.

ACTÚA COMO UN ASESOR HUMANO:
- Haz UNA pregunta a la vez, no todas juntas.
- Escucha la respuesta del usuario y adapta tu siguiente pregunta.
- Sé cálido, breve y específico.
- Cuando tengas suficiente información, genera sugerencias estructuradas.

FLUJO DE PREGUNTAS:
1. ¿Qué tipo de negocio tienes?
2. ¿Qué quieres automatizar por WhatsApp?
3. ¿Quieres responder preguntas, vender, agendar o cobrar?
4. ¿Tienes PayPhone Business o quieres cobrar con link seguro PayPhone?
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
7. Sugiere configuración basada en el tipo de negocio del usuario.
8. Incluye "Bienes raíces" como tipo de negocio (inmobiliaria, propiedades).

Devuelve SOLO JSON válido con esta estructura:
{"reply":"texto conversacional","suggestions":{"template":"...","businessType":"...","mainProductOrService":"...","welcomeMessage":"...","agentTone":"...","scheduleDays":"...","scheduleHours":"...","modules":[],"paymentProvider":"..."},"warnings":[],"missingFields":[],"nextQuestion":"..."}

Templates: solo_ia, ia_agenda, ia_catalogo, ia_payphone, ia_agenda_payphone, agente_completo
BusinessTypes: medica, clinica, abogado, comercio, ecommerce, belleza, spa, restaurante, educacion, profesional, bienes_raices, otro
AgentTones: amable, profesional, cercano, formal, comercial, empatico
ScheduleDays: lun-vie, lun-sab, todos, personalizado
PaymentProviders: payphone_api_link, mock, none

Si el usuario aún no ha dado suficiente información, devuelve suggestions vacío y nextQuestion con la siguiente pregunta.`;

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            ...(aiProvider === "openrouter" && {
              "HTTP-Referer": "https://payflow-smt.vercel.app",
              "X-Title": "PayFlow SMT",
            }),
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
            temperature: 0.3,
            max_tokens: 500,
          }),
          cache: "no-store",
        });

        if (res.ok) {
          const data = await res.json();
          const content = data?.choices?.[0]?.message?.content || "";
          // Try to parse JSON from the AI response
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[0]);
              return NextResponse.json({
                reply: String(parsed.reply || "").slice(0, 500),
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
              // JSON parse failed — fall through to local fallback
            }
          }
        }
        // AI failed — fall through to local fallback
        console.warn("[/api/ai/flow-assistant] AI provider failed, using local fallback");
      } catch (err) {
        console.warn("[/api/ai/flow-assistant] AI fetch failed:", err);
      }
    }
  }

  // ─── Local fallback ───────────────────────────────────────────────
  const detectedType = detectBusinessType(userMessage);
  const local = LOCAL_SUGGESTIONS[detectedType] || LOCAL_SUGGESTIONS.default;

  return NextResponse.json({
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
  } satisfies FlowAssistantResponse);
}
