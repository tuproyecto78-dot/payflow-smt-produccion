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
  template?: string | null;
  businessType?: string | null;
  mainProductOrService?: string | null;
  welcomeMessage?: string | null;
  agentTone?: string | null;
  scheduleDays?: string | null;
  scheduleHours?: string | null;
  modules?: string[];
  paymentProvider?: string | null;
}

interface FlowAssistantResponse {
  source: string;
  reply: string;
  suggestions: FlowSuggestions;
  warnings: string[];
  missingFields: string[];
  nextQuestion?: string | null;
  fallbackUsed: boolean;
  fallbackReason?: string;
}

const SYSTEM_PROMPT = `Eres el Asistente PayFlow, un asesor experto en automatización de WhatsApp para negocios.

Tu trabajo es ayudar al usuario a crear flujos automáticos con WhatsApp, IA, Agenda, Catálogo y PayPhone API Link.

Hablas como un consultor humano, claro y práctico. No eres un bot genérico. No respondes con frases vacías. No sugieres una plantilla sin entender primero el negocio.

REGLAS DE COMPORTAMIENTO:
1. Si el usuario hace una pregunta, RESPONDE LA PREGUNTA PRIMERO. No sugieras plantillas.
2. No sugieras una plantilla hasta entender el negocio del usuario.
3. Nunca respondas "Te sugiero Solo IA" como respuesta genérica.
4. Haz preguntas de seguimiento cortas, una a la vez.
5. Habla claro, simple y práctico.
6. Cuando el usuario describe su negocio, sugiere el flujo más conveniente.
7. Sugerir solo cuando tengas contexto suficiente del negocio.
8. Si el usuario pregunta qué tipos de negocios atienden, lista: clínicas, médicos, abogados, restaurantes, ecommerce, comercios, salones de belleza, spas, educación, servicios profesionales y bienes raíces.
9. Si el usuario pregunta qué puedes hacer, explica: elegir plantilla, redactar mensajes, configurar agenda/catálogo/PayPhone, validar datos.
10. Si el usuario pregunta por número de contacto o información de PayFlow, responde que no tienes acceso a datos internos y enfócalo en crear su flujo.

REGLAS DE SEGURIDAD:
- Nunca muestres claves, tokens, StoreID ni variables de entorno.
- Nunca confirmes payment_success.
- La IA solo puede confirmar intención de pago.
- PayPhone API Link siempre inicia como payment_pending.
- No uses API Sale.
- No digas "cobro sin salir de WhatsApp".
- Usa "link seguro PayPhone".
- El usuario siempre debe aprobar antes de aplicar sugerencias.

NEGOCIOS SOPORTADOS Y SUS FLUJOS:
- Médica: IA + Agenda, tono empático
- Clínica: IA + Agenda + PayPhone opcional
- Abogado: IA + Agenda, tono profesional
- Comercio: IA + Catálogo + PayPhone
- Ecommerce: IA + Catálogo + PayPhone
- Salón de belleza: IA + Agenda + PayPhone
- Spa: IA + Agenda + PayPhone
- Restaurante: IA + Catálogo
- Educación: IA + PayPhone
- Servicios profesionales: IA + Agenda + PayPhone
- Bienes raíces: IA + Agenda + PayPhone (captar compradores, agendar visitas, cobrar reservas)

Devuelve SOLO JSON válido (sin markdown, sin backticks):
{"reply":"respuesta conversacional humana","suggestions":{"template":null,"businessType":null,"mainProductOrService":null,"welcomeMessage":null,"agentTone":null,"scheduleDays":null,"scheduleHours":null,"modules":[],"paymentProvider":null},"warnings":[],"missingFields":[],"nextQuestion":"pregunta corta o null"}

IMPORTANTE: Si el usuario solo pregunta información o saluda, suggestions debe tener todos los campos en null. Solo llena suggestions cuando el usuario haya descrito su negocio Y quieras proponer una configuración.

Templates: solo_ia, ia_agenda, ia_catalogo, ia_payphone, ia_agenda_payphone, agente_completo
BusinessTypes: medica, clinica, abogado, comercio, ecommerce, belleza, spa, restaurante, educacion, profesional, bienes_raices, otro
AgentTones: amable, profesional, cercano, formal, comercial, empatico
PaymentProviders: payphone_api_link, mock, none`;

function localFallback(userMessage: string, reason: string): FlowAssistantResponse {
  const l = userMessage.toLowerCase().trim();

  if (l === "hola" || l === "buenos" || l === "buenas" || l === "hi" || l === "hello" || l === "saludos") {
    return { source: "fallback", reply: "¡Hola! Te ayudo a crear tu flujo paso a paso. Primero dime: ¿qué tipo de negocio tienes y qué quieres automatizar por WhatsApp?", suggestions: {}, warnings: [], missingFields: [], nextQuestion: "¿Qué tipo de negocio tienes?", fallbackUsed: true, fallbackReason: reason };
  }

  if (l.includes("qué tipo") || l.includes("que tipo") || l.includes("negocios atienden") || l.includes("negocios soportan") || l.includes("para qué sirve") || l.includes("para que sirve") || l.includes("negocio puedo") || l.includes("tipo de negocio")) {
    return { source: "fallback", reply: "PayFlow SMT puede servir para negocios que atienden clientes por WhatsApp. Los principales son: clínicas, médicos, abogados, restaurantes, ecommerce, comercios, salones de belleza, spas, educación, servicios profesionales y bienes raíces. También puede adaptarse a otros negocios.\n\nPara ayudarte mejor dime: ¿tu negocio vende productos, agenda citas, atiende consultas o necesita cobrar por WhatsApp?", suggestions: {}, warnings: [], missingFields: [], nextQuestion: "¿Tu negocio vende productos, agenda citas o necesita cobrar?", fallbackUsed: true, fallbackReason: reason };
  }

  if (l.includes("ayudar") || l.includes("qué puedes") || l.includes("que puedes") || l.includes("cómo funciona") || l.includes("como funciona") || l.includes("qué haces") || l.includes("que haces")) {
    return { source: "fallback", reply: "Puedo ayudarte a elegir la plantilla correcta, redactar mensajes de WhatsApp, definir preguntas para tus clientes, configurar agenda, catálogo o PayPhone, validar si falta información y dejar listo el flujo para probarlo.\n\n¿Qué tipo de negocio tienes?", suggestions: {}, warnings: [], missingFields: [], nextQuestion: "¿Qué tipo de negocio tienes?", fallbackUsed: true, fallbackReason: reason };
  }

  if (l.includes("número de contacto") || l.includes("numero de contacto") || l.includes("teléfono") || l.includes("telefono") || l.includes("contacto")) {
    return { source: "fallback", reply: "No tengo acceso a datos internos de contactos. Soy el asistente para crear flujos de WhatsApp. ¿Qué tipo de negocio tienes? Así te ayudo a configurar tu automatización.", suggestions: {}, warnings: [], missingFields: [], nextQuestion: "¿Qué tipo de negocio tienes?", fallbackUsed: true, fallbackReason: reason };
  }

  if (l.includes("cobrar") || l.includes("pago")) {
    return { source: "fallback", reply: "Para cobrar por WhatsApp te conviene un flujo con IA + PayPhone API Link. El asistente puede confirmar la intención del cliente y generar un link seguro PayPhone. El pago quedará como pendiente hasta confirmación.\n\n¿Qué tipo de negocio tienes?", suggestions: { template: "ia_payphone", paymentProvider: "payphone_api_link", modules: ["ai_agent", "payphone"] }, warnings: [], missingFields: [], nextQuestion: "¿Qué tipo de negocio tienes?", fallbackUsed: true, fallbackReason: reason };
  }

  if (l.includes("agendar") || l.includes("cita")) {
    return { source: "fallback", reply: "Para agendar citas por WhatsApp te conviene un flujo con IA + Agenda. El asistente puede coordinar disponibilidad y confirmar la cita.\n\n¿Qué tipo de negocio tienes?", suggestions: { template: "ia_agenda", modules: ["ai_agent", "agenda"] }, warnings: [], missingFields: [], nextQuestion: "¿Qué tipo de negocio tienes?", fallbackUsed: true, fallbackReason: reason };
  }

  if (l.includes("vender") || l.includes("producto") || l.includes("venta")) {
    return { source: "fallback", reply: "Para vender productos por WhatsApp te conviene un flujo con IA + Catálogo + PayPhone. El asistente puede mostrar productos, tomar pedidos y generar links de pago.\n\n¿Qué tipo de negocio tienes?", suggestions: { template: "ia_catalogo", modules: ["ai_agent", "catalog", "payphone"], paymentProvider: "payphone_api_link" }, warnings: [], missingFields: [], nextQuestion: "¿Qué tipo de negocio tienes?", fallbackUsed: true, fallbackReason: reason };
  }

  let suggestions: FlowSuggestions = {};
  let reply = "";
  let nextQuestion = "";

  if (l.includes("inmobiliaria") || l.includes("bienes raíces") || l.includes("bienes raices") || l.includes("propiedades") || l.includes("casas") || l.includes("departamentos") || l.includes("alquil") || l.includes("terrenos")) {
    suggestions = { template: "ia_agenda_payphone", businessType: "bienes_raices", mainProductOrService: "Captación de clientes / agenda de visitas / información de propiedades", welcomeMessage: "¡Hola! 👋 Bienvenido/a. Soy el asistente virtual de nuestra inmobiliaria. Puedo ayudarte con información de propiedades, agendar visitas y guiarte en el proceso de reserva.", agentTone: "profesional", scheduleDays: "lun-sab", scheduleHours: "09h00 - 18h00", modules: ["ai_agent", "agenda", "payphone"], paymentProvider: "payphone_api_link" };
    reply = "Perfecto. Para bienes raíces puedes usar PayFlow para captar compradores, filtrar por presupuesto, enviar información de propiedades, agendar visitas y cobrar reservas con un link seguro PayPhone. ¿Quieres enfocarte en compradores, vendedores, alquileres o visitas?";
    nextQuestion = "¿Quieres enfocarte en compradores, vendedores o alquileres?";
  } else if (l.includes("clínica") || l.includes("clinica") || l.includes("médic") || l.includes("medic") || l.includes("doctor") || l.includes("consultorio")) {
    suggestions = { template: "ia_agenda", businessType: "clinica", mainProductOrService: "Cita médica / consulta especializada", welcomeMessage: "¡Hola! 👋 Bienvenido/a a nuestra clínica. Estoy aquí para ayudarte con información, citas y pagos de forma rápida y segura.", agentTone: "empatico", scheduleDays: "lun-vie", scheduleHours: "09h00 - 18h00", modules: ["ai_agent", "agenda"], paymentProvider: "none" };
    reply = "Para una clínica te recomiendo IA + Agenda con tono empático. El asistente puede agendar citas, responder consultas y gestionar pagos. ¿Quieres incluir cobros con PayPhone?";
    nextQuestion = "¿Quieres incluir cobros con PayPhone API Link?";
  } else if (l.includes("restaurante") || l.includes("comida") || l.includes("pedido")) {
    suggestions = { template: "ia_catalogo", businessType: "restaurante", mainProductOrService: "Pedido de comida", welcomeMessage: "¡Hola! 👋 Bienvenido/a. Puedo ayudarte a tomar tu pedido, confirmar detalles y procesar tu pago por WhatsApp.", agentTone: "comercial", scheduleDays: "todos", scheduleHours: "11h00 - 22h00", modules: ["ai_agent", "catalog"], paymentProvider: "mock" };
    reply = "Para un restaurante te recomiendo IA + Catálogo con tono comercial. El asistente puede tomar pedidos, mostrar el menú y gestionar pagos. ¿Quieres incluir cobros con PayPhone?";
    nextQuestion = "¿Quieres incluir cobros con PayPhone API Link?";
  } else if (l.includes("ecommerce") || l.includes("tienda online") || l.includes("online store")) {
    suggestions = { template: "ia_catalogo", businessType: "ecommerce", mainProductOrService: "Compra online", welcomeMessage: "¡Hola! 👋 Bienvenido/a a nuestra tienda online. Puedo ayudarte a elegir productos, confirmar tu pedido y completar el pago.", agentTone: "comercial", scheduleDays: "todos", scheduleHours: "24h", modules: ["ai_agent", "catalog", "payphone"], paymentProvider: "payphone_api_link" };
    reply = "Para ecommerce te recomiendo IA + Catálogo + PayPhone con tono comercial. El asistente puede mostrar productos, tomar pedidos y generar links seguros PayPhone.";
    nextQuestion = "¿Cuál es el nombre de tu tienda?";
  } else if (l.includes("spa") || l.includes("belleza") || l.includes("salón") || l.includes("salon")) {
    suggestions = { template: "ia_agenda_payphone", businessType: "spa", mainProductOrService: "Reserva de tratamiento", welcomeMessage: "¡Hola! 👋 Bienvenido/a a nuestro spa. Puedo ayudarte a reservar tu tratamiento, revisar horarios disponibles y gestionar tu pago.", agentTone: "amable", scheduleDays: "lun-sab", scheduleHours: "09h00 - 19h00", modules: ["ai_agent", "agenda", "payphone"], paymentProvider: "payphone_api_link" };
    reply = "Para un spa te recomiendo IA + Agenda + PayPhone con tono amable. El asistente puede reservar citas, confirmar tratamientos y cobrar anticipos.";
    nextQuestion = "¿Cuál es el número de WhatsApp del spa?";
  } else if (l.includes("abogado") || l.includes("legal") || l.includes("despacho")) {
    suggestions = { template: "ia_agenda", businessType: "abogado", mainProductOrService: "Consulta legal", welcomeMessage: "¡Hola! 👋 Bienvenido/a. Soy el asistente virtual del despacho. Puedo ayudarte a coordinar una consulta legal y gestionar el pago de forma segura.", agentTone: "profesional", scheduleDays: "lun-vie", scheduleHours: "09h00 - 18h00", modules: ["ai_agent", "agenda"], paymentProvider: "none" };
    reply = "Para un abogado te recomiendo IA + Agenda con tono profesional. El asistente puede coordinar consultas y gestionar pagos.";
    nextQuestion = "¿Quieres incluir cobros con PayPhone API Link?";
  } else if (l.includes("tienda") || l.includes("comercio")) {
    suggestions = { template: "ia_catalogo", businessType: "comercio", mainProductOrService: "Venta de productos", welcomeMessage: "¡Hola! 👋 Bienvenido/a. Estoy aquí para ayudarte con tus compras, disponibilidad de productos y pagos por WhatsApp.", agentTone: "comercial", scheduleDays: "lun-vie", scheduleHours: "09h00 - 18h00", modules: ["ai_agent", "catalog"], paymentProvider: "mock" };
    reply = "Para una tienda te recomiendo IA + Catálogo con tono comercial. El asistente puede mostrar productos y gestionar pedidos.";
    nextQuestion = "¿Quieres incluir cobros con PayPhone API Link?";
  } else {
    return { source: "fallback", reply: "Entiendo. Para ayudarte a crear el flujo correcto, dime: ¿qué tipo de negocio tienes y qué quieres automatizar por WhatsApp?", suggestions: {}, warnings: [], missingFields: [], nextQuestion: "¿Qué tipo de negocio tienes?", fallbackUsed: true, fallbackReason: reason };
  }

  return { source: "fallback", reply, suggestions, warnings: [], missingFields: [], nextQuestion, fallbackUsed: true, fallbackReason: reason };
}

function parseAIResponse(content: string, source: string): FlowAssistantResponse {
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
          template: parsed.suggestions?.template ?? null,
          businessType: parsed.suggestions?.businessType ?? null,
          mainProductOrService: parsed.suggestions?.mainProductOrService ?? null,
          welcomeMessage: parsed.suggestions?.welcomeMessage ?? null,
          agentTone: parsed.suggestions?.agentTone ?? null,
          scheduleDays: parsed.suggestions?.scheduleDays ?? null,
          scheduleHours: parsed.suggestions?.scheduleHours ?? null,
          modules: Array.isArray(parsed.suggestions?.modules) ? parsed.suggestions.modules : [],
          paymentProvider: parsed.suggestions?.paymentProvider ?? null,
        },
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
        missingFields: Array.isArray(parsed.missingFields) ? parsed.missingFields : [],
        nextQuestion: parsed.nextQuestion ?? null,
        fallbackUsed: false,
      };
    } catch {}
  }
  return { source, reply: content.slice(0, 500) || "Lo siento, no pude procesar tu solicitud.", suggestions: {}, warnings: [], missingFields: [], fallbackUsed: false };
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tu sesión expiró. Inicia sesión nuevamente." }, { status: 401 });

  let body: FlowAssistantRequest = {};
  try { body = await req.json(); } catch {}

  const userMessage = String(body.userMessage || body.message || "").trim();
  if (!userMessage) {
    return NextResponse.json({
      source: "fallback", reply: "Cuéntame qué tipo de negocio tienes y qué quieres automatizar por WhatsApp.",
      suggestions: {}, warnings: [], missingFields: ["message"],
      nextQuestion: "¿Qué tipo de negocio tienes?",
      fallbackUsed: true, fallbackReason: "empty_message",
    } satisfies FlowAssistantResponse);
  }

  const history = body.conversationHistory || body.conversation || [];
  const cfg = getAIConfig();
  logAIConfig();

  if (cfg.provider === "mock" || !cfg.hasApiKey) {
    console.log("[/api/ai/flow-assistant] No AI configured, using local fallback");
    return NextResponse.json(localFallback(userMessage, "no_ai_configured"));
  }

  console.log("[/api/ai/flow-assistant] calling AI:", { provider: cfg.provider, model: cfg.model, mode: cfg.mode, messageCount: history.length });

  try {
    let content = "";

    if (cfg.mode === "gemini") {
      const FALLBACK_MODELS = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-flash"];
      const modelsToTry = [cfg.model, ...FALLBACK_MODELS.filter(m => m !== cfg.model)];
      let geminiSuccess = false;
      let geminiError = "";

      for (const tryModel of modelsToTry) {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${tryModel}:generateContent?key=${cfg.apiKey}`;
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
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents, generationConfig: { temperature: 0.4, maxOutputTokens: 800 } }),
            cache: "no-store",
          });

          if (res.ok) {
            const data = await res.json();
            content = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (data?.candidates?.[0]?.finishReason === "SAFETY") content = "Lo siento, no puedo responder a eso. ¿Puedes reformular tu pregunta?";
            console.log("[/api/ai/flow-assistant] Gemini success:", tryModel, "len:", content.length);
            geminiSuccess = true;
            break;
          }

          const errText = await res.text().catch(() => "");
          console.warn("[/api/ai/flow-assistant] Gemini error:", tryModel, res.status);
          if (res.status === 404) { geminiError = "model_not_found"; continue; }
          if (res.status === 429) { geminiError = "quota_exceeded"; break; }
          geminiError = "api_error"; break;
        } catch { geminiError = "network_error"; continue; }
      }

      if (!geminiSuccess || !content) {
        console.warn("[/api/ai/flow-assistant] Gemini failed:", geminiError);
        let friendlyMsg = geminiError === "quota_exceeded" ? "La IA avanzada no está disponible temporalmente por límite de cuota. Activé el asistente local inteligente para ayudarte a crear el flujo."
          : geminiError === "model_not_found" ? "El modelo de IA configurado no está disponible. Activé el asistente local inteligente."
          : geminiError === "network_error" ? "No pude conectar con la IA avanzada. Activé el asistente local inteligente."
          : "La IA avanzada no está disponible en este momento. Activé el asistente local inteligente.";
        const fallback = localFallback(userMessage, geminiError);
        return NextResponse.json({ ...fallback, reply: `${friendlyMsg}\n\n${fallback.reply}`, warnings: [geminiError === "quota_exceeded" ? "AI_QUOTA_EXCEEDED" : "AI_ERROR"] });
      }
    } else {
      // OpenAI-compatible (Groq/NIM/OpenRouter/Z.ai)
      const messages: Array<{ role: string; content: string }> = [{ role: "system", content: SYSTEM_PROMPT }];
      for (const msg of history.slice(-10)) {
        if (msg.role === "user" || msg.role === "assistant") messages.push({ role: msg.role, content: msg.content });
      }
      const lastMsg = messages[messages.length - 1];
      if (!lastMsg || lastMsg.content !== userMessage) messages.push({ role: "user", content: userMessage });

      const headers: Record<string, string> = { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" };
      if (cfg.provider === "openrouter") { headers["HTTP-Referer"] = "https://payflow-smt.vercel.app"; headers["X-Title"] = "PayFlow SMT"; }

      console.log("[/api/ai/flow-assistant] calling", cfg.provider, "at", cfg.endpoint);
      const res = await fetch(cfg.endpoint, {
        method: "POST", headers,
        body: JSON.stringify({ model: cfg.model, messages, temperature: 0.4, max_tokens: 800 }),
        cache: "no-store",
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn(`[/api/ai/flow-assistant] ${cfg.provider} error:`, res.status, errText.slice(0, 300));
        let friendlyMsg = res.status === 429 ? "La IA avanzada no está disponible temporalmente por límite de cuota. Activé el asistente local inteligente."
          : res.status === 401 || res.status === 403 ? "La IA avanzada no está disponible. Activé el asistente local inteligente."
          : res.status === 404 ? "El modelo de IA configurado no está disponible. Activé el asistente local inteligente."
          : "La IA avanzada no está disponible en este momento. Activé el asistente local inteligente.";
        let errorType = res.status === 429 ? "quota_exceeded" : res.status === 401 || res.status === 403 ? "invalid_api_key" : res.status === 404 ? "model_not_found" : "api_error";
        const fallback = localFallback(userMessage, errorType);
        return NextResponse.json({ ...fallback, reply: `${friendlyMsg}\n\n${fallback.reply}`, warnings: [errorType === "quota_exceeded" ? "AI_QUOTA_EXCEEDED" : "AI_ERROR"] });
      }

      const data = await res.json();
      content = data?.choices?.[0]?.message?.content || "";
      console.log(`[/api/ai/flow-assistant] ${cfg.provider} success: len=${content.length}, preview=${content.slice(0, 150)}`);
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
    return NextResponse.json({ ...fallback, reply: `No pude conectar con la IA en este momento, pero te ayudo con sugerencias locales.\n\n${fallback.reply}` });
  }
}
