// Flow template generator for PayFlow SMT.
// Generates complete visual workflows from simple parameters.
// Payment is OPTIONAL — if payment_required=false, no payment nodes are created.

import type { FlowNode, FlowEdge } from "@/lib/workflow-types";

export type FlowTemplateId =
  | "solo_ia"
  | "ia_agenda"
  | "ia_catalogo"
  | "ia_payphone"
  | "ia_agenda_payphone"
  | "agente_completo"
  // Legacy IDs (still work, mapped to new ones)
  | "venta"
  | "cobro"
  | "agenda"
  | "venta_cobro"
  | "agenda_cobro";

export interface FlowTemplateParams {
  templateId: FlowTemplateId;
  business_name: string;
  business_type: string;
  product_or_service: string;
  amount_mode: "fixed" | "variable";
  fixed_amount?: number;
  currency: string;
  welcome_message: string;
  business_hours: string;
  whatsapp_number: string;
  payment_provider: "none" | "payphone" | "mock";
  payment_required: boolean;
  agent_mode: "vender" | "cobrar" | "agendar" | "completo";
}

export interface GeneratedFlow {
  name: string;
  description: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export const FLOW_TEMPLATES: Array<{
  id: FlowTemplateId;
  name: string;
  description: string;
}> = [
  { id: "solo_ia", name: "1. Solo IA (sin pagos)", description: "WhatsApp + Agente IA + respuesta + humano. Sin PayPhone." },
  { id: "ia_agenda", name: "2. IA + Agenda", description: "WhatsApp + Agente IA + agenda de citas. Sin pagos." },
  { id: "ia_catalogo", name: "3. IA + Catálogo", description: "WhatsApp + Agente IA + búsqueda de productos. Sin pagos." },
  { id: "ia_payphone", name: "4. IA + PayPhone", description: "WhatsApp + Agente IA + Crear pago PayPhone API Link." },
  { id: "ia_agenda_payphone", name: "5. IA + Agenda + PayPhone", description: "WhatsApp + Agente IA + agenda + cobro con PayPhone." },
  { id: "agente_completo", name: "6. Agente comercial completo", description: "Responde, vende, agenda, cobra y deriva a humano." },
];

let _counter = 0;
function nid() {
  _counter += 1;
  return `ft_${_counter}_${Math.random().toString(36).slice(2, 6)}`;
}
function eid() {
  _counter += 1;
  return `fe_${_counter}_${Math.random().toString(36).slice(2, 6)}`;
}

function edge(source: string, target: string, handle?: string): FlowEdge {
  return { id: eid(), source, target, sourceHandle: handle || "out" };
}

function waNode(label: string, message: string, phone: string, x: number, y: number): FlowNode {
  return { id: nid(), type: "whatsapp", position: { x, y }, data: { label, phoneNumber: phone, message } };
}

function startNode(x: number, y: number): FlowNode {
  return { id: nid(), type: "start", position: { x, y }, data: { label: "Inicio", trigger: "manual" } };
}

function endNode(x: number, y: number): FlowNode {
  return { id: nid(), type: "end", position: { x, y }, data: { label: "Fin", message: "Flujo completado" } };
}

function aiNode(params: FlowTemplateParams, x: number, y: number): FlowNode {
  return {
    id: nid(),
    type: "ai_agent",
    position: { x, y },
    data: {
      label: "Agente IA",
      systemPrompt: `Eres el agente comercial de ${params.business_name}. ${params.agent_mode === "vender" ? "Ayudas a vender productos." : params.agent_mode === "cobrar" ? "Ayudas a cobrar." : params.agent_mode === "agendar" ? "Ayudas a agendar citas." : "Ayudas a vender, cobrar y agendar."} Sé amable y conciso. NO pidas datos de tarjeta ni CVV.`,
      prompt: "Cliente escribió: {{user_response}}",
      inputVariable: "user_response",
      outputVariable: "ai_response",
    },
  };
}

function createPaymentNode(params: FlowTemplateParams, x: number, y: number): FlowNode | null {
  if (!params.payment_required || params.payment_provider === "none") return null;
  const provider = params.payment_provider === "mock" ? "Mock" : "PayPhone";
  return {
    id: nid(),
    type: "create_payment",
    position: { x, y },
    data: {
      label: "Crear pago",
      provider,
      amount: params.fixed_amount || 0,
      currency: params.currency || "USD",
      description: params.product_or_service,
      customer: "{{customer_name}}",
      phoneNumber: "{{customer_phone}}",
      orderId: "ord_{{timestamp}}",
      ...(provider === "PayPhone" ? { payphoneIntegration: "API Link", countryCode: "593" } : {}),
    },
  };
}

function paymentSequence(
  params: FlowTemplateParams,
  sourceId: string,
  x: number,
  y: number,
  successMessage = "✅ Pago confirmado. ¡Gracias!"
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const step = 280;
  const pay = createPaymentNode(params, x, y)!;
  const waLink = waNode("WhatsApp link", "✅ Tu enlace de pago: {{payment_url}}", params.whatsapp_number, x + step, y);
  const wait: FlowNode = {
    id: nid(),
    type: "wait_confirmation",
    position: { x: x + step * 2, y },
    data: { label: "Esperar webhook", timeout: 900 },
  };
  const verify: FlowNode = {
    id: nid(),
    type: "verify_payment",
    position: { x: x + step * 3, y },
    data: { label: "Verificar pago", orderId: "{{payment_order_id}}", outputVariable: "payment_status" },
  };
  const success = waNode("WhatsApp confirmado", successMessage, params.whatsapp_number, x + step * 4, y - 180);
  const failed = waNode("WhatsApp rechazado", "❌ Pago rechazado. Puedes intentar nuevamente.", params.whatsapp_number, x + step * 4, y - 60);
  const pending = waNode("WhatsApp pendiente", "⏳ Tu pago sigue pendiente. Te avisaremos cuando sea confirmado.", params.whatsapp_number, x + step * 4, y + 60);
  const error = waNode("WhatsApp error", "⚠️ No pudimos verificar el pago. Un asesor revisará el caso.", params.whatsapp_number, x + step * 4, y + 180);
  const end = endNode(x + step * 5, y);

  return {
    nodes: [pay, waLink, wait, verify, success, failed, pending, error, end],
    edges: [
      edge(sourceId, pay.id),
      edge(pay.id, waLink.id, "out"),
      edge(waLink.id, wait.id),
      edge(wait.id, verify.id),
      edge(verify.id, success.id, "payment_success"),
      edge(verify.id, failed.id, "payment_failed"),
      edge(verify.id, pending.id, "payment_pending"),
      edge(verify.id, error.id, "error"),
      edge(success.id, end.id),
      edge(failed.id, end.id),
      edge(pending.id, end.id),
      edge(error.id, end.id),
    ],
  };
}

// ─── Template: Solo IA (sin pagos) ──────────────────────────────────
function generateSoloIA(params: FlowTemplateParams): GeneratedFlow {
  const x = 60, y = 320, step = 280;
  const start = startNode(x, y);
  const wa1 = waNode("WhatsApp bienvenida", params.welcome_message, params.whatsapp_number, x + step, y);
  const ai = aiNode(params, x + step * 2, y);
  const waReply = waNode("WhatsApp respuesta", "{{ai_response}}", params.whatsapp_number, x + step * 3, y);
  const waNotify = waNode("WhatsApp notificación negocio", `Nueva consulta de {{customer_name}}: {{user_response}}`, params.whatsapp_number, x + step * 3, y + 150);
  const end = endNode(x + step * 4, y);

  return {
    name: "Solo IA (sin pagos)",
    description: `Flujo de IA sin pagos para ${params.business_name}`,
    nodes: [start, wa1, ai, waReply, waNotify, end],
    edges: [
      edge(start.id, wa1.id),
      edge(wa1.id, ai.id),
      edge(ai.id, waReply.id),
      edge(waReply.id, waNotify.id),
      edge(waNotify.id, end.id),
    ],
  };
}

// ─── Template: Venta (con o sin pago) ───────────────────────────────
function generateVenta(params: FlowTemplateParams): GeneratedFlow {
  if (!params.payment_required || params.payment_provider === "none") {
    return generateSoloIA(params);
  }
  const x = 60, y = 320, step = 280;
  const start = startNode(x, y);
  const wa1 = waNode("WhatsApp bienvenida", params.welcome_message, params.whatsapp_number, x + step, y);
  const ai = aiNode(params, x + step * 2, y);
  const payment = paymentSequence(params, ai.id, x + step * 3, y);

  return {
    name: "Venta por WhatsApp",
    description: `Venta con ${params.payment_provider} para ${params.business_name}`,
    nodes: [start, wa1, ai, ...payment.nodes],
    edges: [
      edge(start.id, wa1.id),
      edge(wa1.id, ai.id),
      ...payment.edges,
    ],
  };
}

// ─── Template: Cobro ────────────────────────────────────────────────
function generateCobro(params: FlowTemplateParams): GeneratedFlow {
  return generateVenta({ ...params, agent_mode: "cobrar", templateId: "cobro" });
}

// ─── Template: Agenda (con o sin pago) ──────────────────────────────
function generateAgenda(params: FlowTemplateParams): GeneratedFlow {
  const x = 60, y = 320, step = 280;
  const start = startNode(x, y);
  const wa1 = waNode("WhatsApp bienvenida", params.welcome_message, params.whatsapp_number, x + step, y);
  const ai = aiNode({ ...params, agent_mode: "agendar" }, x + step * 2, y);
  const waConfirm = waNode("WhatsApp cita", "✅ Tu cita quedó agendada para {{appointment_date}} a las {{appointment_time}}.", params.whatsapp_number, x + step * 3, y);
  const end = endNode(x + step * 4, y);

  return {
    name: "Agenda de citas",
    description: `Agenda de citas para ${params.business_name}`,
    nodes: [start, wa1, ai, waConfirm, end],
    edges: [
      edge(start.id, wa1.id),
      edge(wa1.id, ai.id),
      edge(ai.id, waConfirm.id),
      edge(waConfirm.id, end.id),
    ],
  };
}

// ─── Template: Venta + cobro ────────────────────────────────────────
function generateVentaCobro(params: FlowTemplateParams): GeneratedFlow {
  if (!params.payment_required || params.payment_provider === "none") {
    return generateSoloIA(params);
  }
  return generateVenta({ ...params, templateId: "venta_cobro" });
}

// ─── Template: Agenda + cobro ───────────────────────────────────────
function generateAgendaCobro(params: FlowTemplateParams): GeneratedFlow {
  const x = 60, y = 320, step = 280;
  const start = startNode(x, y);
  const wa1 = waNode("WhatsApp bienvenida", params.welcome_message, params.whatsapp_number, x + step, y);
  const ai = aiNode({ ...params, agent_mode: "agendar" }, x + step * 2, y);
  const waCita = waNode("WhatsApp cita", "✅ Cita confirmada: {{appointment_date}} {{appointment_time}}", params.whatsapp_number, x + step * 3, y);

  const nodes: FlowNode[] = [start, wa1, ai, waCita];
  const edges: FlowEdge[] = [
    edge(start.id, wa1.id),
    edge(wa1.id, ai.id),
    edge(ai.id, waCita.id),
  ];

  if (params.payment_required && params.payment_provider !== "none") {
    const payment = paymentSequence(
      params,
      waCita.id,
      x + step * 4,
      y,
      "✅ Pago confirmado. Tu cita quedó garantizada."
    );
    nodes.push(...payment.nodes);
    edges.push(...payment.edges);
  } else {
    const end = endNode(x + step * 4, y);
    nodes.push(end);
    edges.push(edge(waCita.id, end.id));
  }

  return {
    name: "Agenda + cobro",
    description: `Agenda${params.payment_required ? " + cobro" : ""} para ${params.business_name}`,
    nodes,
    edges,
  };
}

// ─── Template: Agente completo (con o sin pago) ─────────────────────
function generateAgenteCompleto(params: FlowTemplateParams): GeneratedFlow {
  const x = 60, y = 320, step = 280;
  const start = startNode(x, y);
  const wa1 = waNode("WhatsApp bienvenida", params.welcome_message, params.whatsapp_number, x + step, y);
  const ai = aiNode({ ...params, agent_mode: "completo" }, x + step * 2, y);
  const waReply = waNode("WhatsApp respuesta", "{{ai_response}}", params.whatsapp_number, x + step * 3, y);

  const nodes: FlowNode[] = [start, wa1, ai, waReply];
  const edges: FlowEdge[] = [
    edge(start.id, wa1.id),
    edge(wa1.id, ai.id),
    edge(ai.id, waReply.id),
  ];

  if (params.payment_required && params.payment_provider !== "none") {
    const payment = paymentSequence(params, waReply.id, x + step * 4, y - 100);
    nodes.push(...payment.nodes);
    edges.push(...payment.edges);
  } else {
    const end = endNode(x + step * 4, y);
    nodes.push(end);
    edges.push(edge(waReply.id, end.id));
  }

  return {
    name: "Agente comercial completo",
    description: `Agente completo${params.payment_required ? " con pagos" : " sin pagos"} para ${params.business_name}`,
    nodes,
    edges,
  };
}

export function generateFlowFromTemplate(params: FlowTemplateParams): GeneratedFlow {
  _counter = 0;
  switch (params.templateId) {
    // New template IDs
    case "solo_ia": return generateSoloIA(params);
    case "ia_agenda": return generateAgenda({ ...params, payment_required: false, payment_provider: "none" });
    case "ia_catalogo": return generateSoloIA({ ...params, agent_mode: "vender" });
    case "ia_payphone": return generateVenta({ ...params, payment_required: true, payment_provider: "payphone" });
    case "ia_agenda_payphone": return generateAgendaCobro({ ...params, payment_required: true, payment_provider: "payphone" });
    case "agente_completo": return generateAgenteCompleto(params);
    // Legacy IDs (still work)
    case "venta": return generateVenta(params);
    case "cobro": return generateCobro(params);
    case "agenda": return generateAgenda(params);
    case "venta_cobro": return generateVentaCobro(params);
    case "agenda_cobro": return generateAgendaCobro(params);
    default: return generateSoloIA(params);
  }
}
