import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAIConfig, logAIConfig } from "@/lib/ai/config";

export const dynamic = "force-dynamic";

interface FlowAssistantRequest {
  userMessage?: string;
  message?: string;
  currentStep?: string;
  conversation?: Array<{ role: string; content: string }>;
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

const SYSTEM_PROMPT = `Eres el Asistente PayFlow, un copiloto experto en crear flujos de automatización por WhatsApp para negocios. Ayudas a configurar flujos con IA, agenda, catálogo y PayPhone API Link. Actúas como asesor humano: haces preguntas paso a paso, entiendes el negocio del usuario, sugieres plantillas, redactas mensajes, recomiendas módulos y validas datos faltantes.

Reglas:
- Nunca expones claves, tokens, StoreID ni datos sensibles.
- Nunca confirmas pagos exitosos.
- PayPhone API Link siempre genera payment_pending hasta confirmación externa o revisión admin.
- No usas API Sale.
- No dices "cobro sin salir de WhatsApp".
- Usas "link seguro PayPhone" y "PayPhone API Link".
- La IA solo sugiere; el usuario debe aprobar antes de aplicar cambios.
- Si el usuario solo dice "hola", no sugieras Solo IA todavía. Primero pregunta qué tipo de negocio tiene y qué quiere automatizar.

Flujo de preguntas:
1. ¿Qué tipo de negocio tienes?
2. ¿Qué quieres automatizar por WhatsApp?
3. ¿Quieres responder preguntas, vender, agendar o cobrar?
4. ¿Quieres cobrar con link seguro PayPhone?
5. ¿Cuál es tu horario?
6. ¿Qué tono quieres que use el agente?
7. ¿Quieres que cree el flujo sugerido?

Si el usuario saluda o pregunta qué puedes hacer, responde: "Puedo ayudarte a elegir la plantilla correcta, redactar mensajes de WhatsApp, definir preguntas para tus clientes, configurar agenda, catálogo o PayPhone, validar si falta información y dejar listo el flujo para probarlo."

Devuelve SOLO JSON válido (sin markdown, sin backticks):
{"reply":"texto conversacional","suggestions":{"template":"...","businessType":"...","mainProductOrService":"...","welcomeMessage":"...","agentTone":"...","scheduleDays":"...","scheduleHours":"...","modules":[],"paymentProvider":"..."},"warnings":[],"missingFields":[],"nextQuestion":"..."}

Templates: solo_ia, ia_agenda, ia_catalogo, ia_payphone, ia_agenda_payphone, agente_completo
BusinessTypes: medica, clinica, abogado, comercio, ecommerce, belleza, spa, restaurante, educacion, profesional, bienes_raices, otro
AgentTones: amable, profesional, cercano, formal, comercial, empatico
ScheduleDays: lun-vie, lun-sab, todos, personalizado
PaymentProviders: payphone_api_link, mock, none

Si el usuario aún no ha dado suficiente información, devuelve suggestions vacío {} y nextQuestion con la siguiente pregunta.`;

// ─── Local fallback ───────────────────────────────────────────────────

function localFallback(userMessage: string, reason: string): FlowAssistantResponse {
  const l = userMessage.toLowerCase().trim();

  // Greeting — don't suggest Solo IA
  if (l === "hola" || l === "buenos" || l === "buenas" || l === "hi" || l === "hello" || l === "saludos") {
    return { source: "fallback", reply: "¡Hola! Te ayudo a crear tu flujo paso a paso. Primero dime: ¿qué tipo de negocio tienes y qué quieres automatizar por WhatsApp?", suggestions: {}, warnings: [], missingFields: [], nextQuestion: "¿Qué tipo de negocio tienes?", fallbackUsed: true, fallbackReason: reason };
  }
  // Help question
  if (l.includes("ayudar") || l.includes("qué puedes") || l.includes("que puedes") || l.includes("cómo funciona") || l.includes("como funciona")) {
    return { source: "fallback", reply: "Puedo ayudarte a elegir la plantilla correcta, redactar mensajes de WhatsApp, definir preguntas para tus clientes, configurar agenda, catálogo o PayPhone, validar si falta información y dejar listo el flujo para probarlo. ¿Qué tipo de negocio tienes?", suggestions: {}, warnings: [], missingFields: [], nextQuestion: "¿Qué tipo de negocio tienes?", fallbackUsed: true, fallbackReason: reason };
  }

  let suggestions: FlowSuggestions = { template: "solo_ia", businessType: "otro", mainProductOrService: "Servicio principal", welcomeMessage: "¡Hola! 👋 Bienvenido/a. Soy el asistente virtual de nuestro negocio. Puedo ayudarte con información, atención y pagos por WhatsApp.", agentTone: "amable", scheduleDays: "lun-vie", scheduleHours: "09h00 - 18h00", modules: ["ai_agent"], paymentProvider: "none" };
  let reply = "Te sugiero comenzar con la plantilla 'Solo IA' y un tono amable. ¿Quieres que aplique estas sugerencias?";
  let nextQuestion = "¿Cuál es el nombre de tu negocio?";

  if (l.includes("inmobiliaria") || l.includes("bienes raíces") || l.includes("bienes raices") || l.includes("propiedades") || l.includes("casas") || l.includes("departamentos") || l.includes("alquil") || l.includes("terrenos")) {
    suggestions = { template: "ia_agenda_payphone", businessType: "bienes_raices", mainProductOrService: "Captación de clientes / agenda de visitas / información de propiedades", welcomeMessage: "¡Hola! 👋 Bienvenido/a. Soy el asistente virtual de nuestra inmobiliaria. Puedo ayudarte con información de propiedades, agendar visitas y guiarte en el proceso de reserva.", agentTone: "profesional", scheduleDays: "lun-sab", scheduleHours: "09h00 - 18h00", modules: ["ai_agent", "agenda", "payphone"], paymentProvider: "payphone_api_link" };
    reply = "Para una inmobiliaria te recomiendo IA + Agenda + PayPhone Business. El asistente puede captar compradores, agendar visitas, filtrar por presupuesto y cobrar reservas con link seguro PayPhone.";
    nextQuestion = "¿Quieres captar compradores, vendedores o ambos?";
  } else if (l.includes("clínica") || l.includes("clinica") || l.includes("médic") || l.includes("medic") || l.includes("doctor") || l.includes("consultorio")) {
    suggestions = { template: "ia_agenda", businessType: "clinica", mainProductOrService: "Cita médica / consulta especializada", welcomeMessage: "¡Hola! 👋 Bienvenido/a a nuestra clínica. Estoy aquí para ayudarte con información, citas y pagos de forma rápida y segura.", agentTone: "empatico", scheduleDays: "lun-vie", scheduleHours: "09h00 - 18h00", modules: ["ai_agent", "agenda"], paymentProvider: "none" };
    reply = "Para una clínica recomiendo IA + Agenda, tono empático.";
    nextQuestion = "¿Cuál es el número de WhatsApp de la clínica?";
  } else if (l.includes("restaurante") || l.includes("comida") || l.includes("pedido")) {
    suggestions = { template: "ia_catalogo", businessType: "restaurante", mainProductOrService: "Pedido de comida", welcomeMessage: "¡Hola! 👋 Bienvenido/a. Puedo ayudarte a tomar tu pedido, confirmar detalles y procesar tu pago por WhatsApp.", agentTone: "comercial", scheduleDays: "todos", scheduleHours: "11h00 - 22h00", modules: ["ai_agent", "catalog"], paymentProvider: "mock" };
    reply = "Para un restaurante recomiendo IA + Catálogo, tono comercial.";
    nextQuestion = "¿Cuál es el número de WhatsApp del restaurante?";
  } else if (l.includes("ecommerce") || l.includes("tienda online") || l.includes("online store")) {
    suggestions = { template: "ia_catalogo", businessType: "ecommerce", mainProductOrService: "Compra online", welcomeMessage: "¡Hola! 👋 Bienvenido/a a nuestra tienda online. Puedo ayudarte a elegir productos, confirmar tu pedido y completar el pago.", agentTone: "comercial", scheduleDays: "todos", scheduleHours: "24h", modules: ["ai_agent", "catalog", "payphone"], paymentProvider: "payphone_api_link" };
    reply = "Para ecommerce recomiendo IA + Catálogo + PayPhone, tono comercial.";
    nextQuestion = "¿Cuál es el número de WhatsApp de la tienda?";
  } else if (l.includes("spa") || l.includes("belleza") || l.includes("salón") || l.includes("salon")) {
    suggestions = { template: "ia_agenda_payphone", businessType: "spa", mainProductOrService: "Reserva de tratamiento", welcomeMessage: "¡Hola! 👋 Bienvenido/a a nuestro spa. Puedo ayudarte a reservar tu tratamiento, revisar horarios disponibles y gestionar tu pago.", agentTone: "amable", scheduleDays: "lun-sab", scheduleHours: "09h00 - 19h00", modules: ["ai_agent", "agenda", "payphone"], paymentProvider: "payphone_api_link" };
    reply = "Para un spa sugiero IA + Agenda + PayPhone, tono amable.";
    nextQuestion = "¿Cuál es el número de WhatsApp del spa?";
  } else if (l.includes("abogado") || l.includes("legal") || l.includes("despacho")) {
    suggestions = { template: "ia_agenda", businessType: "abogado", mainProductOrService: "Consulta legal", welcomeMessage: "¡Hola! 👋 Bienvenido/a. Soy el asistente virtual del despacho. Puedo ayudarte a coordinar una consulta legal y gestionar el pago de forma segura.", agentTone: "profesional", scheduleDays: "lun-vie", scheduleHours: "09h00 - 18h00", modules: ["ai_agent", "agenda"], paymentProvider: "none" };
    reply = "Para un abogado sugiero IA + Agenda, tono profesional.";
    nextQuestion = "¿Cuál es el número de WhatsApp del despacho?";
  } else if (l.includes("tienda") || l.includes("comercio") || l.includes("vender") || l.includes("venta")) {
    suggestions = { template: "ia_catalogo", businessType: "comercio", mainProductOrService: "Venta de productos", welcomeMessage: "¡Hola! 👋 Bienvenido/a. Estoy aquí para ayudarte con tus compras, disponibilidad de productos y pagos por WhatsApp.", agentTone: "comercial", scheduleDays: "lun-vie", scheduleHours: "09h00 - 18h00", modules: ["ai_agent", "catalog"], paymentProvider: "mock" };
    reply = "Para una tienda recomiendo IA + Catálogo, tono comercial.";
    nextQuestion = "¿Cuál es el número de WhatsApp de la tienda?";
  }

  return { source: "fallback", reply, suggestions, warnings: [], missingFields: [], nextQuestion, fallbackUsed: true, fallbackReason: reason };
}

/** Parse AI response content */
function parseAIResponse(content: string, source: string): FlowAssistantResponse {
  // Remove markdown code blocks if present
  let clean = content.trim();
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
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
  return {
    source,
    reply: content.slice(0, 500) || "Lo siento, no pude procesar tu solicitud.",
    suggestions: {}, warnings: [], missingFields: [],
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

  // Accept both userMessage and message field names
  const userMessage = String(body.userMessage || body.message || "").trim();
  if (!userMessage) {
    return NextResponse.json({
      source: "fallback",
      reply: "Cuéntame qué tipo de negocio tienes y qué quieres automatizar por WhatsApp.",
      suggestions: {}, warnings: [], missingFields: ["message"],
      nextQuestion: "¿Qué tipo de negocio tienes?",
      fallbackUsed: true, fallbackReason: "empty_message",
    } satisfies FlowAssistantResponse);
  }

  // Accept both conversationHistory and conversation field names
  const history = body.conversationHistory || body.conversation || [];

  const cfg = getAIConfig();
  logAIConfig();

  if (cfg.provider === "mock" || !cfg.hasApiKey) {
    console.log("[/api/ai/flow-assistant] No AI configured, using local fallback");
    return NextResponse.json(localFallback(userMessage, "no_ai_configured"));
  }

  console.log("[/api/ai/flow-assistant] calling AI:", {
    provider: cfg.provider, model: cfg.model, mode: cfg.mode,
    messageCount: history.length,
  });

  try {
    let content = "";

    if (cfg.mode === "gemini") {
      // ─── Gemini API call with model fallback ──────────────────────
      const FALLBACK_MODELS = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-flash"];
      const modelsToTry = [cfg.model, ...FALLBACK_MODELS.filter((m) => m !== cfg.model)];
      let geminiSuccess = false;
      let geminiError = "";

      for (const tryModel of modelsToTry) {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${tryModel}:generateContent?key=${cfg.apiKey}`;

        // Build contents for this attempt
        const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
        if (history.length === 0) {
          contents.push({ role: "user", parts: [{ text: `${SYSTEM_PROMPT}\n\nUsuario: ${userMessage}` }] });
        } else {
          for (const msg of history.slice(-10)) {
            if (msg.role === "user" || msg.role === "assistant") {
              contents.push({ role: msg.role === "assistant" ? "model" : "user", parts: [{ text: msg.content }] });
            }
          }
          const last = contents[contents.length - 1];
          if (!last || last.role !== "user" || last.parts[0]?.text !== userMessage) {
            contents.push({ role: "user", parts: [{ text: userMessage }] });
          }
        }

        console.log("[/api/ai/flow-assistant] trying Gemini model:", tryModel);

        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents,
              generationConfig: { temperature: 0.4, maxOutputTokens: 800 },
            }),
            cache: "no-store",
          });

          if (res.ok) {
            const data = await res.json();
            content = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (data?.candidates?.[0]?.finishReason === "SAFETY") {
              content = "Lo siento, no puedo responder a eso. ¿Puedes reformular tu pregunta?";
            }
            console.log("[/api/ai/flow-assistant] Gemini success with model:", tryModel, "length:", content.length);
            geminiSuccess = true;
            break; // Success, stop trying
          }

          const errText = await res.text().catch(() => "");
          console.warn("[/api/ai/flow-assistant] Gemini error with model:", tryModel, "status:", res.status);

          // If 404 (model not found), try next model
          if (res.status === 404) {
            geminiError = "model_not_found";
            continue;
          }

          // If 429 (quota exceeded), stop trying — all models share the same quota
          if (res.status === 429) {
            geminiError = "quota_exceeded";
            break;
          }

          // For other errors, stop and report
          geminiError = "api_error";
          break;
        } catch (fetchErr) {
          console.warn("[/api/ai/flow-assistant] Gemini fetch error with model:", tryModel, fetchErr);
          geminiError = "network_error";
          continue;
        }
      }

      if (!geminiSuccess || !content) {
        console.warn("[/api/ai/flow-assistant] Gemini failed:", geminiError);

        // Build friendly message based on error type
        let friendlyMsg: string;
        if (geminiError === "quota_exceeded") {
          friendlyMsg = "La IA avanzada no está disponible temporalmente por límite de cuota. Activé el asistente local inteligente para ayudarte a crear el flujo.";
        } else if (geminiError === "model_not_found") {
          friendlyMsg = "El modelo de IA configurado no está disponible. Activé el asistente local inteligente para ayudarte.";
        } else if (geminiError === "network_error") {
          friendlyMsg = "No pude conectar con la IA avanzada. Activé el asistente local inteligente para ayudarte.";
        } else {
          friendlyMsg = "La IA avanzada no está disponible en este momento. Activé el asistente local inteligente para ayudarte.";
        }

        const fallback = localFallback(userMessage, geminiError);
        return NextResponse.json({
          ...fallback,
          reply: `${friendlyMsg}\n\n${fallback.reply}`,
          warnings: [geminiError === "quota_exceeded" ? "AI_QUOTA_EXCEEDED" : "AI_ERROR"],
        });
      }

    } else {
      // ─── OpenAI-compatible call (OpenRouter/Z.ai) ─────────────────
      const messages: Array<{ role: string; content: string }> = [
        { role: "system", content: SYSTEM_PROMPT },
      ];
      for (const msg of history.slice(-10)) {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
      const lastMsg = messages[messages.length - 1];
      if (!lastMsg || lastMsg.content !== userMessage) {
        messages.push({ role: "user", content: userMessage });
      }

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
        body: JSON.stringify({ model: cfg.model, messages, temperature: 0.4, max_tokens: 800 }),
        cache: "no-store",
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn(`[/api/ai/flow-assistant] ${cfg.provider} error:`, res.status, errText.slice(0, 300));
        const fallback = localFallback(userMessage, `${cfg.provider}_error`);
        return NextResponse.json({
          ...fallback,
          reply: `[Error ${cfg.provider} ${res.status}] ${errText.slice(0, 200)}\n\n${fallback.reply}`,
          warnings: ["AI_ERROR"],
        });
      }

      const data = await res.json();
      content = data?.choices?.[0]?.message?.content || "";
      console.log(`[/api/ai/flow-assistant] ${cfg.provider} success:`, { contentLength: content.length });
    }

    if (!content) {
      console.warn("[/api/ai/flow-assistant] Empty AI response, using fallback");
      return NextResponse.json(localFallback(userMessage, "empty_response"));
    }

    console.log("[/api/ai/flow-assistant] AI source:", cfg.provider);
    return NextResponse.json(parseAIResponse(content, cfg.provider));

  } catch (err) {
    console.warn("[/api/ai/flow-assistant] AI fetch failed:", err instanceof Error ? err.message : String(err));
    const fallback = localFallback(userMessage, "network_error");
    return NextResponse.json({
      ...fallback,
      reply: `[Error de red] ${err instanceof Error ? err.message : "desconocido"}\n\n${fallback.reply}`,
    });
  }
}
