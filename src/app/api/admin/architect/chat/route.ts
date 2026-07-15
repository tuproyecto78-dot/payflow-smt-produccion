import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-server";
import { getAIConfig } from "@/lib/ai/config";
import { getSupabaseAdmin } from "@/lib/clickup";
import { collectArchitectContext, type ArchitectSystemContext } from "@/lib/architect-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RiskLevel = "low" | "medium" | "high";
type SuggestionType = "bug" | "mejora" | "decision" | "investigacion";
type ExecutionAction = "retry_clickup_events" | "queue_clickup_analysis" | "none";
type ChangeScope = "analysis" | "automation" | "integration" | "workflow" | "database" | "code" | "configuration";

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

interface ArchitectReply {
  reply: string;
  understoodRequest: string;
  title: string;
  diagnostic: string;
  actions: string[];
  nextQuestion: string | null;
  riskLevel: RiskLevel;
  suggestionType: SuggestionType;
  changeScope: ChangeScope;
  executionAction: ExecutionAction;
  requiresApproval: boolean;
  source: string;
}

const SYSTEM_PROMPT = `Eres el Arquitecto PayFlow SMT: un colaborador técnico senior, cercano y paciente. Dominas automatización de negocios, arquitectura y desarrollo de software, Next.js/TypeScript, WhatsApp Business, agentes de IA, diseño de flujos, webhooks, APIs, pagos, PayPhone, PlaceToPay, Supabase/Postgres/RLS, Vercel, ClickUp, seguridad, idempotencia, auditoría y experiencia de usuario.

El administrador puede escribir con errores, frases cortas o lenguaje no técnico. Interpreta su intención sin corregirlo ni hacerlo repetir información que ya aparece en el contexto. Explica como una persona experta que quiere ayudar, no como un formulario ni como un manual.

FORMA DE RESPONDER:
- Empieza con una confirmación breve de lo que entendiste y responde de inmediato.
- Usa palabras sencillas, frases claras y pasos concretos. Explica cualquier término técnico indispensable.
- Di qué observas en el contexto real, qué recomiendas y cuál es el siguiente paso.
- Haz como máximo UNA pregunta, solo cuando la respuesta cambie materialmente la solución. Debe ser específica y fácil de contestar.
- Si puedes avanzar con una suposición segura, indícala y continúa; no hagas preguntas genéricas como "¿qué tipo de configuración necesitas?".
- Si el administrador pide una opinión, sugiere la mejor opción y explica brevemente por qué.

AUTORIZACIÓN Y EJECUCIÓN:
- Puedes analizar y proponer sin autorización.
- Si pide crear, configurar, corregir, implementar, modificar, instalar, borrar, ejecutar o desplegar, prepara el plan y marca requiresApproval=true.
- Nunca afirmes que cambiaste código, base de datos, configuración, despliegue o estado de pago si no existe evidencia de ejecución.
- executionAction solo puede ser retry_clickup_events para reintentar eventos fallidos de ClickUp, queue_clickup_analysis para poner eventos detectados de ClickUp en análisis, o none para todo lo demás.
- Si todavía necesitas una respuesta imprescindible del administrador, incluye nextQuestion y no presentes el plan como listo para autorización.
- Cuando executionAction=none, la aprobación registra y autoriza el plan, pero no equivale a que el código ya fue modificado.
- Nunca pidas ni muestres tokens, contraseñas, claves privadas o service role. Indica que los secretos se colocan en el servidor/Vercel.
- Nunca confirmes un pago por cuenta propia: solo el proveedor y el webhook validado pueden hacerlo.
- Prioriza seguridad, idempotencia, RLS, auditoría, pruebas y cambios reversibles.
- Propón entre 2 y 6 acciones concretas y ordenadas.

CONOCIMIENTO DE PAYFLOW:
- El objetivo es automatizar conversaciones y procesos de cualquier negocio, incluyendo WhatsApp, generación de links de pago, confirmación por webhook y derivación a una persona.
- En PayPhone, para cobros conversacionales normalmente conviene API Link: crear solicitud, mantenerla pendiente y confirmar únicamente por webhook/notificación externa. No recomiendes capturar tarjetas dentro del chat.
- Las integraciones viven en backend; Supabase persiste y aplica RLS; Vercel guarda secretos; ClickUp recibe eventos/tareas; el panel administra aprobaciones.

Devuelve SOLO JSON válido, sin markdown ni backticks:
{"reply":"respuesta humana y directa","understoodRequest":"lo que entendiste en una frase","title":"título corto","diagnostic":"lo que observas o falta","actions":["paso 1","paso 2"],"nextQuestion":"una sola pregunta concreta o cadena vacía","riskLevel":"low|medium|high","suggestionType":"bug|mejora|decision|investigacion","changeScope":"analysis|automation|integration|workflow|database|code|configuration","executionAction":"retry_clickup_events|queue_clickup_analysis|none","requiresApproval":true|false}`;

function moduleDetail(context: ArchitectSystemContext | undefined, moduleId: string): string | null {
  const systemModule = context?.modules.find((item) => item.id === moduleId);
  return systemModule ? `${systemModule.label}: ${systemModule.detail}` : null;
}

function fallbackReply(message: string, context?: ArchitectSystemContext, history: HistoryMessage[] = []): ArchitectReply {
  const text = message.toLowerCase();
  const recentConversation = history.slice(-4).map((item) => item.content.toLowerCase()).join("\n");
  const hasExplicitTopic = /(payphone|pago|clickup|supabase|base de datos|whatsapp|chatbot|asistente|\bbot\b|flujo|automatiza|proceso)/i.test(text);
  const scopeText = hasExplicitTopic ? text : `${recentConversation}\n${text}`;
  let requiresApproval = /(implement|corrig|arregl|ejecut|aplic|modific|despleg|configur|instal|crea|agreg|elimin|borr)/i.test(
    text.length < 80 ? scopeText : text
  );
  let understoodRequest = `Quieres ayuda para ${message.trim().replace(/[.!?]+$/, "")}.`;
  let diagnostic = "Todavía no identifico con precisión el módulo afectado, pero puedo convertir tu objetivo en un flujo claro y comprobable.";
  let actions = [
    "Ubicar el módulo relacionado y revisar su estado actual.",
    "Definir el resultado esperado y una prueba sencilla para comprobarlo.",
    "Preparar el cambio reversible y dejar evidencia en el historial.",
  ];
  let nextQuestion: string | null = "¿Qué resultado quieres ver al final, explicado con un ejemplo sencillo?";
  let suggestionType: SuggestionType = requiresApproval ? "mejora" : "investigacion";
  let riskLevel: RiskLevel = requiresApproval ? "medium" : "low";
  let changeScope: ChangeScope = requiresApproval ? "configuration" : "analysis";
  let executionAction: ExecutionAction = "none";

  if (context?.alerts.length && /(arquitectura|sistema|mejor|alert|revis)/i.test(scopeText)) {
    const topAlerts = context.alerts.slice(0, 5);
    diagnostic = `El mapa detectó ${context.alerts.length} alertas. Las prioritarias son: ${topAlerts.map((alert) => alert.title).join("; ")}.`;
    actions = topAlerts.map((alert) => alert.suggestedPrompt);
    riskLevel = topAlerts.some((alert) => alert.severity === "high") ? "high" : "medium";
    suggestionType = "investigacion";
    understoodRequest = "Quieres que revise PayFlow completo, encuentre lo importante y te diga por dónde empezar.";
    nextQuestion = null;
  }

  if (scopeText.includes("payphone") || scopeText.includes("pago")) {
    const currentStatus = moduleDetail(context, "payphone");
    understoodRequest = "Quieres dejar los cobros de PayPhone listos para que PayFlow genere un link desde WhatsApp y confirme el resultado correctamente.";
    diagnostic = `${currentStatus ? `${currentStatus}. ` : ""}Para este caso la ruta más simple es API Link: PayFlow crea el enlace, el cliente paga fuera de WhatsApp y el sistema espera la notificación validada de PayPhone.`;
    actions = [
      "Comprobar en el servidor que Store ID, token y permisos estén activos, sin mostrar los secretos en el chat.",
      "Generar el link con monto, referencia única y datos del comercio; guardar la transacción como pendiente.",
      "Validar la notificación externa con idempotencia y actualizar el pago solo con la respuesta oficial de PayPhone.",
      "Probar un cobro pequeño de punta a punta: WhatsApp → link → pago → webhook → confirmación al cliente.",
    ];
    const answeredCredentialQuestion = recentConversation.includes("token de producción y el store id") && /^(sí|si|ya|correcto|listo|los tengo|no|todavía no|aún no)/i.test(text.trim());
    const answeredTestChoice = recentConversation.includes("creación del link o revisar la confirmación") && /(link|webhook|confirmación|confirmacion|notificación|notificacion)/i.test(text);
    const credentialsUnavailable = answeredCredentialQuestion && /^(no|todavía no|aún no)/i.test(text.trim());
    if (credentialsUnavailable) {
      diagnostic = "Todavía faltan las credenciales comerciales de PayPhone. No conviene tocar el flujo de producción hasta que PayPhone entregue el token, Store ID y permisos requeridos.";
      actions = [
        "Completar la aprobación comercial de Comercio aliado y Notificación Externa.",
        "Recibir token y Store ID y guardarlos únicamente como secretos de Vercel.",
        "Después ejecutar la prueba controlada de API Link y webhook.",
      ];
      nextQuestion = null;
      requiresApproval = false;
    } else if (answeredCredentialQuestion || answeredTestChoice) {
      nextQuestion = null;
    } else {
      nextQuestion = context?.modules.find((item) => item.id === "payphone")?.status === "healthy"
        ? "PayPhone aparece configurado. ¿Quieres probar primero la creación del link o revisar la confirmación por webhook?"
        : "¿PayPhone ya te entregó el token de producción y el Store ID? No los pegues aquí; solo dime si ya los tienes.";
    }
    riskLevel = "medium";
    changeScope = "integration";
  } else if (scopeText.includes("clickup")) {
    understoodRequest = "Quieres revisar o mejorar la conexión entre ClickUp y PayFlow.";
    diagnostic = `${moduleDetail(context, "clickup") || "ClickUp requiere revisión"}. La integración debe validar conexión, firma del webhook, eventos duplicados y persistencia en Supabase.`;
    actions = [
      "Comprobar la conexión activa y el webhook registrado.",
      "Validar la firma de los eventos recibidos.",
      "Confirmar idempotencia y registro en clickup_events.",
      "Presentar cualquier acción para aprobación humana.",
    ];
    if (/(reintent|recuper|fallid)/i.test(scopeText)) executionAction = "retry_clickup_events";
    else if (/(analiz|proces|pendiente|cola)/i.test(scopeText)) executionAction = "queue_clickup_analysis";
    nextQuestion = executionAction === "none" ? "¿Quieres revisar la conexión, los webhooks o las tareas que genera PayFlow?" : null;
    changeScope = "integration";
  } else if (scopeText.includes("supabase") || scopeText.includes("base de datos")) {
    understoodRequest = "Quieres revisar o cambiar la base de datos de PayFlow sin afectar la información existente.";
    diagnostic = `${moduleDetail(context, "supabase") || "Supabase está conectado"}. El cambio debe revisar esquema, relaciones, índices, RLS y uso exclusivo de service role en backend.`;
    actions = [
      "Revisar tablas y relaciones afectadas.",
      "Validar políticas RLS y permisos administrativos.",
      "Comprobar índices e idempotencia.",
      "Registrar la modificación en audit_logs.",
    ];
    nextQuestion = "¿Qué dato o proceso quieres guardar, consultar o corregir en Supabase?";
    riskLevel = "high";
    changeScope = "database";
  } else if (/(código|codigo|frontend|backend|endpoint|archivo|repositorio|despliegue)/i.test(scopeText)) {
    understoodRequest = "Quieres que prepare un cambio de código y que no se aplique hasta contar con tu autorización.";
    diagnostic = "El cambio debe indicar exactamente qué parte se modifica, cómo se valida y cómo se revierte. La autorización del plan no se confundirá con una implementación ya completada.";
    actions = [
      "Identificar los archivos, endpoints o componentes afectados.",
      "Preparar el cambio mínimo con controles de seguridad y manejo de errores.",
      "Validar lint, compilación y el caso funcional solicitado.",
      "Aplicar mediante control de versiones y verificar el despliegue antes de marcarlo como ejecutado.",
    ];
    nextQuestion = "¿Qué comportamiento ves ahora y cómo quieres que funcione después del cambio?";
    riskLevel = "medium";
    changeScope = "code";
  } else if (/(whatsapp|chatbot|asistente|\bbot\b)/i.test(scopeText)) {
    understoodRequest = "Quieres que el asistente de WhatsApp entienda mejor al cliente y conduzca la conversación sin trabarse.";
    diagnostic = `${moduleDetail(context, "whatsapp") || "WhatsApp requiere revisión"}. Conviene diseñar intención, contexto, respuesta, pago o agenda y salida a una persona como un solo flujo.`;
    actions = [
      "Definir las preguntas mínimas que el bot necesita para entender la solicitud.",
      "Diseñar respuestas naturales con memoria corta y opciones claras.",
      "Conectar las acciones reales del negocio: catálogo, agenda, pagos y atención humana.",
      "Probar casos normales, mensajes incompletos y errores antes de activarlo.",
    ];
    nextQuestion = "¿Qué debe lograr primero el cliente en WhatsApp: comprar, pagar, agendar o pedir ayuda?";
    changeScope = "automation";
  } else if (/(flujo|automatiza|proceso)/i.test(scopeText)) {
    understoodRequest = "Quieres convertir un proceso del negocio en un flujo automático y fácil de operar.";
    diagnostic = "El flujo debe tener un inicio claro, recopilar solo los datos necesarios, ejecutar acciones verificables y derivar a una persona cuando no pueda continuar.";
    actions = [
      "Definir qué evento inicia el flujo y cuál es el resultado final.",
      "Ordenar preguntas, validaciones y decisiones sin repetir datos.",
      "Conectar módulos externos con reintentos, idempotencia y auditoría.",
      "Agregar una salida humana y una prueba completa antes de publicarlo.",
    ];
    nextQuestion = "Cuéntame un ejemplo real: ¿qué dice el cliente al inicio y qué debería ocurrir al final?";
    changeScope = "workflow";
  }

  return {
    reply: requiresApproval
      ? "Sí, puedo ayudarte con esto. Ya organicé una ruta concreta; primero confirmamos el punto clave y después podrás autorizar el plan antes de tocar la configuración o el código."
      : "Entendí la idea. Te explico lo que veo y la mejor forma de avanzar sin complicarte.",
    understoodRequest,
    title: message.slice(0, 80) || "Consulta del Arquitecto IA",
    diagnostic,
    actions,
    nextQuestion,
    riskLevel,
    suggestionType,
    changeScope,
    executionAction,
    requiresApproval,
    source: "local",
  };
}

function parseReply(
  content: string,
  source: string,
  originalMessage: string,
  context: ArchitectSystemContext,
  history: HistoryMessage[]
): ArchitectReply {
  const clean = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) {
    const fallback = fallbackReply(originalMessage, context, history);
    return { ...fallback, reply: clean.slice(0, 2500) || fallback.reply, source };
  }

  try {
    const parsed = JSON.parse(match[0]);
    const risks: RiskLevel[] = ["low", "medium", "high"];
    const types: SuggestionType[] = ["bug", "mejora", "decision", "investigacion"];
    const scopes: ChangeScope[] = ["analysis", "automation", "integration", "workflow", "database", "code", "configuration"];
    const executionActions: ExecutionAction[] = ["retry_clickup_events", "queue_clickup_analysis", "none"];
    return {
      reply: String(parsed.reply || "Preparé una recomendación para revisión.").slice(0, 2500),
      understoodRequest: String(parsed.understoodRequest || `Quieres ayuda con: ${originalMessage}`).slice(0, 700),
      title: String(parsed.title || originalMessage || "Propuesta del Arquitecto IA").slice(0, 120),
      diagnostic: String(parsed.diagnostic || "Sin diagnóstico adicional.").slice(0, 2000),
      actions: Array.isArray(parsed.actions)
        ? parsed.actions.slice(0, 6).map((action: unknown) => String(action).slice(0, 500))
        : [],
      nextQuestion: parsed.nextQuestion ? String(parsed.nextQuestion).slice(0, 700) : null,
      riskLevel: risks.includes(parsed.riskLevel) ? parsed.riskLevel : "medium",
      suggestionType: types.includes(parsed.suggestionType) ? parsed.suggestionType : "investigacion",
      changeScope: scopes.includes(parsed.changeScope) ? parsed.changeScope : "analysis",
      executionAction: executionActions.includes(parsed.executionAction) ? parsed.executionAction : "none",
      requiresApproval: Boolean(parsed.requiresApproval),
      source,
    };
  } catch {
    return { ...fallbackReply(originalMessage, context, history), reply: clean.slice(0, 2500), source };
  }
}

async function callAI(message: string, history: HistoryMessage[], context: ArchitectSystemContext): Promise<ArchitectReply> {
  const cfg = getAIConfig();
  if (!cfg.hasApiKey || !cfg.apiKey || cfg.provider === "mock") return fallbackReply(message, context, history);

  const liveContext = JSON.stringify({
    generatedAt: context.generatedAt,
    modules: context.modules,
    alerts: context.alerts,
    metrics: context.metrics,
  });
  const groundedPrompt = `${SYSTEM_PROMPT}\n\nCONTEXTO REAL DEL SISTEMA (sin secretos):\n${liveContext}\n\nUsa este contexto. Si todavía falta un dato imprescindible, haz una sola pregunta concreta.`;

  if (cfg.mode === "gemini") {
    const conversation = history
      .slice(-8)
      .map((item) => `${item.role === "assistant" ? "Arquitecto" : "Administrador"}: ${item.content}`)
      .join("\n");
    const endpoint = `${cfg.endpoint}?key=${cfg.apiKey}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${groundedPrompt}\n\n${conversation}\nAdministrador: ${message}` }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 1800 },
      }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Proveedor IA HTTP ${response.status}`);
    const data = await response.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return parseReply(content, cfg.provider, message, context, history);
  }

  const messages = [
    { role: "system", content: groundedPrompt },
    ...history.slice(-8).map((item) => ({ role: item.role, content: item.content })),
    { role: "user", content: message },
  ];
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.apiKey}`,
    "Content-Type": "application/json",
  };
  if (cfg.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://tuproyecto78-dot-payflow-smt-produc.vercel.app";
    headers["X-Title"] = "Arquitecto PayFlow SMT";
  }
  const response = await fetch(cfg.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: cfg.model, messages, temperature: 0.35, max_tokens: 1800 }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Proveedor IA HTTP ${response.status}`);
  const data = await response.json();
  return parseReply(data?.choices?.[0]?.message?.content || "", cfg.provider, message, context, history);
}

async function saveSuggestion(reply: ArchitectReply, actorUserId: string): Promise<string | null> {
  if (!reply.requiresApproval || reply.nextQuestion) return null;
  try {
    const supabase = getSupabaseAdmin();
    const priority = reply.riskLevel === "high" ? "critico" : reply.riskLevel === "medium" ? "importante" : "mejora";
    const { data, error } = await supabase
      .from("architecture_suggestions")
      .insert({
        title: reply.title,
        suggestion_type: reply.suggestionType,
        diagnostic: reply.diagnostic,
        proposed_actions: {
          understood_request: reply.understoodRequest,
          steps: reply.actions,
          next_question: reply.nextQuestion,
          change_scope: reply.changeScope,
          execution_action: reply.executionAction,
        },
        priority,
        approval_status: "pending",
      })
      .select("id")
      .single();
    if (error) throw error;

    await supabase.from("audit_logs").insert({
      entity_type: "architecture_suggestion",
      entity_id: String(data.id),
      action: "suggestion_generated_from_chat",
      metadata: {
        actor_user_id: actorUserId,
        risk_level: reply.riskLevel,
        change_scope: reply.changeScope,
        source: reply.source,
      },
    });
    return String(data.id);
  } catch (error) {
    console.error("[architect/chat] save suggestion", error);
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const message = String(body.message || "").trim();
    if (!message) return NextResponse.json({ error: "Escribe una consulta para el Arquitecto IA." }, { status: 400 });

    const history: HistoryMessage[] = Array.isArray(body.history)
      ? body.history
          .filter((item: HistoryMessage) => item?.role === "user" || item?.role === "assistant")
          .slice(-8)
          .map((item: HistoryMessage) => ({ role: item.role, content: String(item.content || "").slice(0, 2000) }))
      : [];

    const context = await collectArchitectContext();
    let reply: ArchitectReply;
    try {
      reply = await callAI(message, history, context);
    } catch (error) {
      console.error("[architect/chat] provider", error);
      reply = fallbackReply(message, context, history);
    }

    const suggestionId = await saveSuggestion(reply, admin.userId);
    return NextResponse.json({ ok: true, ...reply, suggestionId, approvalStatus: suggestionId ? "pending" : null });
  } catch (error) {
    console.error("[architect/chat]", error);
    return NextResponse.json({ error: "No se pudo procesar la consulta del Arquitecto IA." }, { status: 500 });
  }
}
