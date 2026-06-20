// Agente IA de pagos para PayFlow SMT.
import type { PaymentStatus } from "./payments";

export type AIProvider = "Mock" | "Gemini" | "OpenAI";

export interface PaymentAgentInput {
  message: string; context: Record<string, unknown>;
  customer_phone?: string; customer_document?: string; customer_name?: string;
  payment_confirmation?: boolean; amount?: number; currency?: string;
  order_id?: string; payment_reason?: string; provider?: AIProvider;
}

export interface PaymentAgentResult {
  reply: string; customer_phone: string; customer_document: string;
  customer_name: string; payment_confirmation: boolean; amount: number;
  currency: string; order_id: string; payment_reason: string;
  next_action: "ask_phone" | "ask_document" | "ask_confirmation" | "create_payment" | "stop";
}

const MESSAGES = {
  ask_phone: "Por favor envíame tu número móvil registrado en PayPhone.",
  ask_document: "Gracias. Ahora envíame tu cédula o DNI para validar tus datos.",
  ask_confirmation: "¿Confirmas que deseas pagar este pedido? Responde sí para continuar.",
  sale_created: "Te enviamos una solicitud de cobro a PayPhone. Confirma el pago desde tu app PayPhone y te avisaremos aquí cuando esté aprobado.",
  success: "✅ Tu pago fue confirmado correctamente. Gracias por tu compra.",
  failed: "❌ El pago fue rechazado o no pudo completarse.",
  pending: "⏳ Tu pago está pendiente de confirmación en PayPhone.",
  error: "⚠️ Ocurrió un error procesando el pago.",
};

function resolveProvider(input?: AIProvider): AIProvider {
  if (input) return input;
  const env = process.env.AI_PROVIDER as AIProvider | undefined;
  if (env === "Gemini" || env === "OpenAI" || env === "Mock") return env;
  return "Mock";
}

export async function runPaymentAgent(input: PaymentAgentInput): Promise<PaymentAgentResult> {
  const provider = resolveProvider(input.provider);
  let customer_phone = input.customer_phone || "";
  let customer_document = input.customer_document || "";
  let customer_name = input.customer_name || "";
  let payment_confirmation = input.payment_confirmation ?? false;
  const amount = input.amount ?? 0;
  const currency = input.currency || "USD";
  const order_id = input.order_id || "";
  const payment_reason = input.payment_reason || "";
  const message = (input.message || "").trim();

  if (!customer_phone) { const m = message.match(/(?:\+?\d[\d\s-]{6,14}\d)/); if (m) customer_phone = m[0].replace(/[\s-]/g, ""); }
  if (!customer_document) { const allNums = message.match(/\b(\d{8,15})\b/g) || []; const candidates = allNums.filter((n) => n !== customer_phone); if (candidates.length > 0) customer_document = candidates[0]; }
  if (!payment_confirmation) { if (/^(s[iíí]|claro|acepto|confirmo|de acuerdo|ok|d[aá]le|por supuesto)/i.test(message.toLowerCase().trim())) payment_confirmation = true; }
  if (!customer_name) { const m = message.match(/(?:soy|me llamo|mi nombre es)\s+([a-záéíóúñüA-ZÁÉÍÓÚÑÜ]{3,40}(?:\s+[a-záéíóúñüA-ZÁÉÍÓÚÑÜ]{3,40}){0,2})/i); if (m) customer_name = m[1].trim(); }

  let reply = ""; let next_action: PaymentAgentResult["next_action"] = "stop";

  if (provider === "Gemini" || provider === "OpenAI") {
    const ai = await callLLM(provider, { message, customer_phone, customer_document, customer_name, payment_confirmation, amount, currency, order_id, payment_reason });
    if (ai) {
      reply = ai.reply;
      if (ai.customer_phone && !customer_phone) customer_phone = ai.customer_phone;
      if (ai.customer_document && !customer_document) customer_document = ai.customer_document;
      if (ai.customer_name && !customer_name) customer_name = ai.customer_name;
      if (ai.payment_confirmation) payment_confirmation = true;
      next_action = ai.next_action;
    }
  }

  if (!reply) {
    if (!customer_phone) { reply = MESSAGES.ask_phone; next_action = "ask_phone"; }
    else if (!customer_document) { reply = MESSAGES.ask_document; next_action = "ask_document"; }
    else if (!customer_name) { if (/^[a-záéíóúñüA-ZÁÉÍÓÚÑÜ\s]{3,40}$/.test(message.trim())) { customer_name = message.trim(); } else { reply = "¿Cuál es tu nombre completo?"; next_action = "stop"; } }
    if (!reply && !payment_confirmation) { reply = MESSAGES.ask_confirmation; next_action = "ask_confirmation"; }
    if (!reply) { reply = MESSAGES.sale_created; next_action = "create_payment"; }
  }

  return { reply, customer_phone, customer_document, customer_name, payment_confirmation, amount, currency, order_id, payment_reason, next_action };
}

async function callLLM(provider: "Gemini" | "OpenAI", ctx: any): Promise<any | null> {
  const systemPrompt = `Eres un agente de cobros por WhatsApp para PayFlow SMT en Ecuador. Recolecta: número móvil, cédula/DNI, nombre, confirmación. NUNCA confirmes pagos exitosos. Responde mensajes CORTOS. Devuelve SOLO JSON: {"reply":"","customer_phone":"","customer_document":"","customer_name":"","payment_confirmation":false,"next_action":"ask_phone|ask_document|ask_confirmation|create_payment|stop"}. Variables: phone=${ctx.customer_phone||"?"}, doc=${ctx.customer_document||"?"}, name=${ctx.customer_name||"?"}, confirm=${ctx.payment_confirmation}. Mensaje del cliente: "${ctx.message}"`;
  try {
    if (provider === "Gemini") {
      const apiKey = process.env.GEMINI_API_KEY; if (!apiKey) return null;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt }] }] }) });
      if (!res.ok) return null;
      const data = await res.json(); return parseAgentJSON(data?.candidates?.[0]?.content?.parts?.[0]?.text || "");
    }
    const apiKey = process.env.OPENAI_API_KEY; if (!apiKey) return null;
    const res = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: "Devuelves SOLO JSON." }, { role: "user", content: systemPrompt }], temperature: 0.3, max_tokens: 400 }) });
    if (!res.ok) return null;
    const data = await res.json(); return parseAgentJSON(data?.choices?.[0]?.message?.content || "");
  } catch { return null; }
}

function parseAgentJSON(text: string): any | null {
  try { const m = text.match(/\{[\s\S]*\}/); if (!m) return null; const obj = JSON.parse(m[0]); const valid = ["ask_phone","ask_document","ask_confirmation","create_payment","stop"]; return { reply: String(obj.reply||""), customer_phone: obj.customer_phone?String(obj.customer_phone):undefined, customer_document: obj.customer_document?String(obj.customer_document):undefined, customer_name: obj.customer_name?String(obj.customer_name):undefined, payment_confirmation: Boolean(obj.payment_confirmation), next_action: valid.includes(obj.next_action)?obj.next_action:"stop" }; } catch { return null; }
}

export { MESSAGES };
