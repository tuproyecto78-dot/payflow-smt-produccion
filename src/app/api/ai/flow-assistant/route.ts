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
  source: string;
  reply: string;
  suggestions: FlowSuggestions;
  warnings: string[];
  missingFields: string[];
  nextQuestion?: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
}

// ─── System prompt ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres el Asistente PayFlow, un copiloto experto en crear flujos de automatización por WhatsApp para negocios. Ayudas a configurar flujos con IA, agenda, catálogo y PayPhone API Link.

Actúas como asesor humano: haces preguntas paso a paso, sugieres plantillas, redactas mensajes, recomiendas módulos y validas datos faltantes.

REGLAS:
- Nunca expones claves, tokens, StoreID ni datos sensibles.
- Nunca confirmas pagos exitosos.
- Los pagos con PayPhone API Link siempre quedan payment_pending hasta confirmación externa o revisión admin.
- No usas API Sale.
- No dices "cobro sin salir de WhatsApp".
- Usas "link seguro PayPhone" y "PayPhone API Link".
- La IA solo sugiere; el usuario debe aprobar antes de aplicar cambios.
- Incluye "Bienes raíces" como tipo de negocio (inmobiliaria, propiedades).

FLUJO DE PREGUNTAS:
1. ¿Qué tipo de negocio tienes?
2. ¿Qué quieres automatizar por WhatsApp?
3. ¿Quieres responder preguntas, vender, agendar o cobrar?
4. ¿Quieres cobrar con link seguro PayPhone?
5. ¿Cuál es tu horario?
6. ¿Qué tono quieres que use el agente?
7. ¿Quieres que cree el flujo sugerido?

Si el usuario saluda o pregunta qué puedes hacer, responde: "Puedo ayudarte a elegir la plantilla correcta, redactar mensajes de WhatsApp, definir preguntas para tus clientes, configurar agenda, catálogo o PayPhone, validar si falta información y dejar listo el flujo para probarlo."

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
    template: "ia_agenda_payphone", businessType: "bienes_raices",
    mainProductOrService: "Captación de clientes / agenda de visitas / información de propiedades",
    welcomeMessage: "¡Hola! 👋 Bienvenido/a. Soy el asistente virtual de nuestra inmobiliaria. Puedo ayudarte con información de propiedades, agendar visitas y guiarte en el proceso de reserva.",
    agentTone: "profesional", scheduleDays: "lun-sab", scheduleHours: "09h00 - 18h00",
    modules: ["ai_agent", "agenda", "payphone"], paymentProvider: "payphone_api_link",
    reply: "Para una inmobiliaria te recomiendo IA + Agenda + PayPhone Business. ¿Quieres incluir cobro de reservas?",
    nextQuestion: "¿Quieres que el asistente también filtre compradores por presupuesto o ciudad?",
  },
  clinica: {
    template: "ia_payphone", businessType: "clinica",
    mainProductOrService: "Cita médica / consulta especializada",
    welcomeMessage: "¡Hola! 👋 Bienvenido/a a nuestra clínica. Estoy aquí para ayudarte con información, citas y pagos de forma rápida y segura.",
    agentTone: "empatico", scheduleDays: "lun-vie", scheduleHours: "09h00 - 18h00",
    modules: ["ai_agent", "payphone"], paymentProvider: "payphone_api_link",
    reply: "Para una clínica recomiendo IA + PayPhone, tono empático. ¿Quieres que aplique estas sugerencias?",
    nextQuestion: "¿Cuál es el número de WhatsApp de la clínica?",
  },
  medica: {
    template: "ia_payphone", businessType: "medica",
    mainProductOrService: "Consulta médica",
    welcomeMessage: "¡Hola! 👋 Bienvenido/a. Soy el asistente virtual de nuestro consultorio. Puedo ayudarte a agendar tu consulta, resolver dudas y guiarte con el pago.",
    agentTone: "empatico", scheduleDays: "lun-vie", scheduleHours: "08h00 - 17h00",
    modules: ["ai_agent", "payphone"], paymentProvider: "payphone_api_link",
    reply: "Para un consultorio médico sugiero IA + PayPhone, tono empático. ¿Aplico estas sugerencias?",
    nextQuestion: "¿Cuál es el número de WhatsApp del consultorio?",
  },
  restaurante: {
    template: "ia_catalogo", businessType: "restaurante",
    mainProductOrService: "Pedido de comida",
    welcomeMessage: "¡Hola! 👋 Bienvenido/a. Puedo ayudarte a tomar tu pedido, confirmar detalles y procesar tu pago por WhatsApp.",
    agentTone: "comercial", scheduleDays: "todos", scheduleHours: "11h00 - 22h00",
    modules: ["ai_agent", "catalog"], paymentProvider: "mock",
    reply: "Para un restaurante recomiendo IA + Catálogo, tono comercial. ¿Aplico estas sugerencias?",
    nextQuestion: "¿Cuál es el número de WhatsApp del restaurante?",
  },
  spa: {
    template: "ia_agenda_payphone", businessType: "spa",
    mainProductOrService: "Reserva de tratamiento",
    welcomeMessage: "¡Hola! 👋 Bienvenido/a a nuestro spa. Puedo ayudarte a reservar tu tratamiento, revisar horarios disponibles y gestionar tu pago.",
    agentTone: "amable", scheduleDays: "lun-sab", scheduleHours: "09h00 - 19h00",
    modules: ["ai_agent", "agenda", "payphone"], paymentProvider: "payphone_api_link",
    reply: "Para un spa sugiero IA + Agenda + PayPhone, tono amable. ¿Aplico estas sugerencias?",
    nextQuestion: "¿Cuál es el número de WhatsApp del spa?",
  },
  ecommerce: {
    template: "ia_catalogo", businessType: "ecommerce",
    mainProductOrService: "Compra online",
    welcomeMessage: "¡Hola! 👋 Bienvenido/a a nuestra tienda online. Puedo ayudarte a elegir productos, confirmar tu pedido y completar el pago.",
    agentTone: "comercial", scheduleDays: "todos", scheduleHours: "24h",
    modules: ["ai_agent", "catalog", "payphone"], paymentProvider: "payphone_api_link",
    reply: "Para ecommerce recomiendo IA + Catálogo + PayPhone, tono comercial. ¿Aplico estas sugerencias?",
    nextQuestion: "¿Cuál es el número de WhatsApp de la tienda?",
  },
  abogado: {
    template: "solo_ia", businessType: "abogado",
    mainProductOrService: "Consulta legal",
    welcomeMessage: "¡Hola! 👋 Bienvenido/a. Soy el asistente virtual del despacho. Puedo ayudarte a coordinar una consulta legal y gestionar el pago de forma segura.",
    agentTone: "formal", scheduleDays: "lun-vie", scheduleHours: "09h00 - 18h00",
    modules: ["ai_agent"], paymentProvider: "none",
    reply: "Para un abogado sugiero Solo IA o IA + Agenda, tono formal. ¿Aplico estas sugerencias?",
    nextQuestion: "¿Cuál es el número de WhatsApp del despacho?",
  },
  tienda: {
    template: "ia_catalogo", businessType: "comercio",
    mainProductOrService: "Venta de productos",
    welcomeMessage: "¡Hola! 👋 Bienvenido/a. Estoy aquí para ayudarte con tus compras, disponibilidad de productos y pagos por WhatsApp.",
    agentTone: "comercial", scheduleDays: "lun-vie", scheduleHours: "09h00 - 18h00",
    modules: ["ai_agent", "catalog"], paymentProvider: "mock",
    reply: "Para una tienda recomiendo IA + Catálogo, tono comercial. ¿Aplico estas sugerencias?",
    nextQuestion: "¿Cuál es el número de WhatsApp de la tienda?",
  },
  default: {
    template: "solo_ia", businessType: "otro",
    mainProductOrService: "Servicio principal",
    welcomeMessage: "¡Hola! 👋 Bienvenido/a. Soy el asistente virtual de nuestro negocio. Puedo ayudarte con información, atención y pagos por WhatsApp.",
    agentTone: "amable", scheduleDays: "lun-vie", scheduleHours: "09h00 - 18h00",
    modules: ["ai_agent"], paymentProvider: "none",
    reply: "Te sugiero comenzar con la plantilla 'Solo IA' y un tono amable. ¿Quieres que aplique estas sugerencias?",
    nextQuestion: "¿Cuál es el nombre de tu negocio?",
  },
};

function detectBusinessType(message: string): string {
  const l = message.toLowerCase();
  if (l.includes("inmobiliaria") || l.includes("bienes raíces") || l.includes("bienes raices") || l.includes("propiedades") || l.includes("casas") || l.includes("departamentos") || l.includes("terrenos") || l.includes("alquil")) return "bienes_raices";
  if (l.includes("clínica") || l.includes("clinica")) return "clinica";
  if (l.includes("médic") || l.includes("medic") || l.includes("consultorio") || l.includes("doctor")) return "medica";
  if (l.includes("restaurante") || l.includes("comida") || l.includes("pedido")) return "restaurante";
  if (l.includes("spa") || l.includes("tratamiento") || l.includes("belleza") || l.includes("salón") || l.includes("salon")) return "spa";
  if (l.includes("ecommerce") || l.includes("tienda online") || l.includes("online store")) return "ecommerce";
  if (l.includes("tienda") || l.includes("comercio") || l.includes("vender") || l.includes("venta")) return "tienda";
  if (l.includes("abogado") || l.includes("legal") || l.includes("despacho")) return "abogado";
  return "default";
}

function localFallback(userMessage: string): FlowAssistantResponse {
  const detected = detectBusinessType(userMessage);
  const local = LOCAL_SUGGESTIONS[detected] || LOCAL_SUGGESTIONS.default;
  return {
    source: "fallback",
    reply: local.reply,
    suggestions: {
      template: local.template, businessType: local.businessType,
      mainProductOrService: local.mainProductOrService, welcomeMessage: local.welcomeMessage,
      agentTone: local.agentTone, scheduleDays: local.scheduleDays,
      scheduleHours: local.scheduleHours, modules: local.modules,
      paymentProvider: local.paymentProvider,
    },
    warnings: [], missingFields: [],
    nextQuestion: local.nextQuestion,
    fallbackUsed: true, fallbackReason: "gemini_error",
  };
}

/** Build Gemini API request body */
function buildGeminiBody(systemPrompt: string, userMessage: string, history: Array<{ role: string; content: string }>) {
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  // Add conversation history
  for (const msg of history.slice(-10)) {
    if (msg.role === "user" || msg.role === "assistant") {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }
  }

  // Add system prompt as first user message if no history
  if (contents.length === 0) {
    contents.push({
      role: "user",
      parts: [{ text: `${systemPrompt}\n\nUsuario: ${userMessage}` }],
    });
  } else {
    // Add current user message
    const last = contents[contents.length - 1];
    if (last.role !== "user" || last.parts[0]?.text !== userMessage) {
      contents.push({ role: "user", parts: [{ text: userMessage }] });
    }
  }

  return {
    contents,
    generationConfig: { temperature: 0.4, maxOutputTokens: 600 },
    systemInstruction: { parts: [{ text: systemPrompt }] },
  };
}

/** Build OpenAI-compatible request body */
function buildOpenAIBody(systemPrompt: string, userMessage: string, history: Array<{ role: string; content: string }>) {
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt },
  ];
  for (const msg of history.slice(-10)) {
    if (msg.role === "user" || msg.role === "assistant") {
      messages.push({ role: msg.role, content: msg.content });
    }
  }
  const last = messages[messages.length - 1];
  if (!last || last.content !== userMessage) {
    messages.push({ role: "user", content: userMessage });
  }
  return { model: "", messages, temperature: 0.4, max_tokens: 600 };
}

/** Parse AI response content into structured FlowAssistantResponse */
function parseAIResponse(content: string, source: string): FlowAssistantResponse {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        source,
        reply: String(parsed.reply || content.slice(0, 500)).slice(0, 500),
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
        fallbackUsed: false,
      };
    } catch {}
  }
  // No JSON — use raw content as reply
  return {
    source,
    reply: content.slice(0, 500) || "Lo siento, no pude procesar tu solicitud.",
    suggestions: {},
    warnings: [], missingFields: [],
    fallbackUsed: false,
  };
}

/**
 * POST /api/ai/flow-assistant
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tu sesión expiró. Inicia sesión nuevamente." }, { status: 401 });
  }

  let body: FlowAssistantRequest = {};
  try { body = await req.json(); } catch {}

  const userMessage = String(body.userMessage || "").trim();
  if (!userMessage) {
    return NextResponse.json({
      source: "fallback",
      reply: "Cuéntame qué tipo de negocio tienes y qué quieres automatizar por WhatsApp.",
      suggestions: {}, warnings: [], missingFields: ["userMessage"],
      nextQuestion: "¿Qué tipo de negocio tienes?",
      fallbackUsed: true, fallbackReason: "empty_message",
    } satisfies FlowAssistantResponse);
  }

  const cfg = getAIConfig();
  logAIConfig();

  // If mock or no API key, use local fallback
  if (cfg.provider === "mock" || !cfg.hasApiKey) {
    console.log("[/api/ai/flow-assistant] No AI configured, using local fallback");
    return NextResponse.json(localFallback(userMessage));
  }

  const history = body.conversationHistory || [];

  console.log("[/api/ai/flow-assistant] calling AI:", {
    provider: cfg.provider, model: cfg.model, mode: cfg.mode,
    messageCount: history.length,
  });

  try {
    let content = "";

    if (cfg.mode === "gemini") {
      // ─── Gemini API call ──────────────────────────────────────────
      const geminiBody = buildGeminiBody(SYSTEM_PROMPT, userMessage, history);
      const res = await fetch(`${cfg.endpoint}?key=${cfg.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
        cache: "no-store",
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn("[/api/ai/flow-assistant] Gemini error:", res.status, errText.slice(0, 300));
        return NextResponse.json(localFallback(userMessage));
      }

      const data = await res.json();
      content = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      console.log("[/api/ai/flow-assistant] Gemini success:", { contentLength: content.length, preview: content.slice(0, 150) });

    } else {
      // ─── OpenAI-compatible call (OpenRouter/Z.ai) ─────────────────
      const openaiBody = buildOpenAIBody(SYSTEM_PROMPT, userMessage, history);
      openaiBody.model = cfg.model;

      const headers: Record<string, string> = {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      };
      if (cfg.provider === "openrouter") {
        headers["HTTP-Referer"] = "https://payflow-smt.vercel.app";
        headers["X-Title"] = "PayFlow SMT";
      }

      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(openaiBody),
        cache: "no-store",
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn(`[/api/ai/flow-assistant] ${cfg.provider} error:`, res.status, errText.slice(0, 300));
        return NextResponse.json(localFallback(userMessage));
      }

      const data = await res.json();
      content = data?.choices?.[0]?.message?.content || "";
      console.log(`[/api/ai/flow-assistant] ${cfg.provider} success:`, { contentLength: content.length, preview: content.slice(0, 150) });
    }

    if (!content) {
      console.warn("[/api/ai/flow-assistant] Empty AI response, using fallback");
      return NextResponse.json(localFallback(userMessage));
    }

    // Parse AI response
    return NextResponse.json(parseAIResponse(content, cfg.provider));

  } catch (err) {
    console.warn("[/api/ai/flow-assistant] AI fetch failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(localFallback(userMessage));
  }
}
