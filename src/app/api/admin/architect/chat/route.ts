import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-server";
import { getAIConfig } from "@/lib/ai/config";
import { getSupabaseAdmin } from "@/lib/clickup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RiskLevel = "low" | "medium" | "high";
type SuggestionType = "bug" | "mejora" | "decision" | "investigacion";

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

interface ArchitectReply {
  reply: string;
  title: string;
  diagnostic: string;
  actions: string[];
  riskLevel: RiskLevel;
  suggestionType: SuggestionType;
  requiresApproval: boolean;
  source: string;
}

const SYSTEM_PROMPT = `Eres Arquitecto PayFlow SMT, un asesor técnico interno para una plataforma SaaS de automatización, WhatsApp, PayPhone, Supabase, Vercel, ClickUp e inteligencia artificial.

Tu tarea es conversar con el administrador, diagnosticar problemas y proponer mejoras concretas. Habla en español claro y práctico.

REGLAS:
- Responde primero la pregunta del administrador.
- No inventes que revisaste archivos, logs o datos que no recibiste.
- Nunca muestres ni solicites tokens, claves privadas o secretos.
- No confirmes pagos por cuenta propia.
- Si el usuario pide corregir, implementar, ejecutar, modificar o desplegar, prepara una propuesta y marca requiresApproval=true.
- No afirmes que una implementación fue ejecutada. La aprobación humana es obligatoria.
- Prioriza seguridad, idempotencia, RLS, auditoría y cambios reversibles.
- Da entre 1 y 6 acciones concretas.

Devuelve SOLO JSON válido, sin markdown ni backticks:
{"reply":"respuesta conversacional","title":"título corto","diagnostic":"diagnóstico","actions":["acción 1"],"riskLevel":"low|medium|high","suggestionType":"bug|mejora|decision|investigacion","requiresApproval":true|false}`;

function fallbackReply(message: string): ArchitectReply {
  const text = message.toLowerCase();
  const requiresApproval = /(implement|corrig|arregl|ejecut|aplic|modific|despleg)/i.test(text);
  let diagnostic = "Necesito revisar el objetivo, el módulo afectado y el resultado esperado antes de recomendar un cambio.";
  let actions = [
    "Identificar el módulo y el comportamiento actual.",
    "Definir el resultado esperado y los criterios de validación.",
    "Preparar una propuesta segura para aprobación.",
  ];
  let suggestionType: SuggestionType = requiresApproval ? "mejora" : "investigacion";
  let riskLevel: RiskLevel = requiresApproval ? "medium" : "low";

  if (text.includes("payphone") || text.includes("pago")) {
    diagnostic = "La revisión debe cubrir creación del pago, estado pendiente, webhook, idempotencia y auditoría antes de modificar el flujo.";
    actions = [
      "Validar credenciales y configuración del comercio sin exponer secretos.",
      "Revisar creación del pago y manejo de payment_pending.",
      "Comprobar firma, idempotencia y trazabilidad del webhook.",
      "Probar el flujo completo en un caso controlado.",
    ];
    riskLevel = "high";
  } else if (text.includes("clickup")) {
    diagnostic = "La integración debe validar conexión, firma del webhook, eventos duplicados y persistencia en Supabase.";
    actions = [
      "Comprobar la conexión activa y el webhook registrado.",
      "Validar la firma de los eventos recibidos.",
      "Confirmar idempotencia y registro en clickup_events.",
      "Presentar cualquier acción para aprobación humana.",
    ];
  } else if (text.includes("supabase") || text.includes("base de datos")) {
    diagnostic = "El cambio debe revisar esquema, relaciones, índices, RLS y uso exclusivo de service role en backend.";
    actions = [
      "Revisar tablas y relaciones afectadas.",
      "Validar políticas RLS y permisos administrativos.",
      "Comprobar índices e idempotencia.",
      "Registrar la modificación en audit_logs.",
    ];
    riskLevel = "high";
  }

  return {
    reply: requiresApproval
      ? "Preparé una propuesta inicial. Revísala y apruébala antes de implementar cualquier cambio."
      : "Puedo ayudarte a revisar esa parte. Este es el enfoque inicial recomendado.",
    title: message.slice(0, 80) || "Consulta del Arquitecto IA",
    diagnostic,
    actions,
    riskLevel,
    suggestionType,
    requiresApproval,
    source: "local",
  };
}

function parseReply(content: string, source: string, originalMessage: string): ArchitectReply {
  const clean = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) {
    return { ...fallbackReply(originalMessage), reply: clean.slice(0, 2500) || fallbackReply(originalMessage).reply, source };
  }

  try {
    const parsed = JSON.parse(match[0]);
    const risks: RiskLevel[] = ["low", "medium", "high"];
    const types: SuggestionType[] = ["bug", "mejora", "decision", "investigacion"];
    return {
      reply: String(parsed.reply || "Preparé una recomendación para revisión.").slice(0, 2500),
      title: String(parsed.title || originalMessage || "Propuesta del Arquitecto IA").slice(0, 120),
      diagnostic: String(parsed.diagnostic || "Sin diagnóstico adicional.").slice(0, 2000),
      actions: Array.isArray(parsed.actions)
        ? parsed.actions.slice(0, 6).map((action: unknown) => String(action).slice(0, 500))
        : [],
      riskLevel: risks.includes(parsed.riskLevel) ? parsed.riskLevel : "medium",
      suggestionType: types.includes(parsed.suggestionType) ? parsed.suggestionType : "investigacion",
      requiresApproval: Boolean(parsed.requiresApproval),
      source,
    };
  } catch {
    return { ...fallbackReply(originalMessage), reply: clean.slice(0, 2500), source };
  }
}

async function callAI(message: string, history: HistoryMessage[]): Promise<ArchitectReply> {
  const cfg = getAIConfig();
  if (!cfg.hasApiKey || !cfg.apiKey || cfg.provider === "mock") return fallbackReply(message);

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
        contents: [{ role: "user", parts: [{ text: `${SYSTEM_PROMPT}\n\n${conversation}\nAdministrador: ${message}` }] }],
        generationConfig: { temperature: 0.25, maxOutputTokens: 1400 },
      }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Proveedor IA HTTP ${response.status}`);
    const data = await response.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return parseReply(content, cfg.provider, message);
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
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
    body: JSON.stringify({ model: cfg.model, messages, temperature: 0.25, max_tokens: 1400 }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Proveedor IA HTTP ${response.status}`);
  const data = await response.json();
  return parseReply(data?.choices?.[0]?.message?.content || "", cfg.provider, message);
}

async function saveSuggestion(reply: ArchitectReply, actorUserId: string): Promise<string | null> {
  if (!reply.requiresApproval) return null;
  try {
    const supabase = getSupabaseAdmin();
    const priority = reply.riskLevel === "high" ? "critico" : reply.riskLevel === "medium" ? "importante" : "mejora";
    const { data, error } = await supabase
      .from("architecture_suggestions")
      .insert({
        title: reply.title,
        suggestion_type: reply.suggestionType,
        diagnostic: reply.diagnostic,
        proposed_actions: reply.actions,
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
      metadata: { actor_user_id: actorUserId, risk_level: reply.riskLevel, source: reply.source },
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

    let reply: ArchitectReply;
    try {
      reply = await callAI(message, history);
    } catch (error) {
      console.error("[architect/chat] provider", error);
      reply = fallbackReply(message);
    }

    const suggestionId = await saveSuggestion(reply, admin.userId);
    return NextResponse.json({ ok: true, ...reply, suggestionId, approvalStatus: suggestionId ? "pending" : null });
  } catch (error) {
    console.error("[architect/chat]", error);
    return NextResponse.json({ error: "No se pudo procesar la consulta del Arquitecto IA." }, { status: 500 });
  }
}
