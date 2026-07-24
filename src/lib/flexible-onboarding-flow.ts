import type { FlowEdge, FlowNode } from "@/lib/workflow-types";

export type FlexibleTemplateId =
  | "solo_ia"
  | "ia_agenda"
  | "ia_catalogo"
  | "ia_payphone"
  | "ia_agenda_payphone"
  | "agente_completo";

export type FlexiblePaymentProvider = "none" | "payphone" | "external";
export type FlexibleConfirmationMode = "provider_webhook" | "merchant_manual";

export interface FlexibleOnboardingParams {
  templateId: FlexibleTemplateId;
  businessName: string;
  businessType: string;
  productOrService: string;
  welcomeMessage: string;
  whatsappNumber: string;
  businessHours: string;
  agentTone: string;
  agentMode: "vender" | "cobrar" | "agendar" | "completo";
  usesAgenda: boolean;
  usesCatalog: boolean;
  paymentProvider: FlexiblePaymentProvider;
  confirmationMode: FlexibleConfirmationMode;
  externalProviderName?: string;
  externalPaymentUrl?: string;
  amountMode: "fixed" | "variable";
  fixedAmount?: number;
  currency: string;
  knowledgeSummary?: string;
}

export interface FlexibleGeneratedFlow {
  name: string;
  description: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

let counter = 0;

function nodeId(prefix: string) {
  counter += 1;
  return `${prefix}_${counter}_${Math.random().toString(36).slice(2, 7)}`;
}

function edgeId() {
  counter += 1;
  return `edge_${counter}_${Math.random().toString(36).slice(2, 7)}`;
}

function connect(source: string, target: string, sourceHandle = "out"): FlowEdge {
  return { id: edgeId(), source, target, sourceHandle };
}

function startNode(x: number, y: number): FlowNode {
  return {
    id: nodeId("start"),
    type: "start",
    position: { x, y },
    data: { label: "Inicio", trigger: "manual" },
  };
}

function endNode(x: number, y: number, message = "Flujo completado"): FlowNode {
  return {
    id: nodeId("end"),
    type: "end",
    position: { x, y },
    data: { label: "Fin", message },
  };
}

function whatsappNode(
  label: string,
  message: string,
  phoneNumber: string,
  x: number,
  y: number
): FlowNode {
  return {
    id: nodeId("wa"),
    type: "whatsapp",
    position: { x, y },
    data: { label, message, phoneNumber },
  };
}

function aiNode(params: FlexibleOnboardingParams, x: number, y: number): FlowNode {
  const responsibilities = [
    params.agentMode === "agendar"
      ? "coordinar citas"
      : params.agentMode === "cobrar"
      ? "guiar al cliente hacia el enlace de pago"
      : params.agentMode === "vender"
      ? "ayudar a elegir productos o servicios"
      : "atender, vender y coordinar el siguiente paso",
    params.usesAgenda ? "gestionar solicitudes de agenda" : null,
    params.usesCatalog ? "usar la información del catálogo proporcionado" : null,
  ].filter(Boolean);

  const paymentRule =
    params.paymentProvider === "none"
      ? "Este negocio no usa pagos dentro del flujo."
      : params.paymentProvider === "external"
      ? "PayFlow solo comparte el enlace del comercio. Nunca afirmes que un pago fue aprobado sin una confirmación válida del proveedor o del comercio autorizado."
      : "PayFlow genera el enlace de PayPhone y espera la confirmación técnica del proveedor antes de avanzar.";

  return {
    id: nodeId("ai"),
    type: "ai_agent",
    position: { x, y },
    data: {
      label: "Agente IA",
      systemPrompt: [
        `Eres el asistente de ${params.businessName}.`,
        `Tu tarea es ${responsibilities.join(", ")}.`,
        `Mantén un tono ${params.agentTone || "amable"}, claro y breve.`,
        params.businessHours ? `Horario informado: ${params.businessHours}.` : "",
        params.productOrService ? `Oferta principal: ${params.productOrService}.` : "",
        params.knowledgeSummary ? `Contexto cargado: ${params.knowledgeSummary}.` : "",
        paymentRule,
        "Nunca solicites números de tarjeta, CVV, claves bancarias ni credenciales.",
      ]
        .filter(Boolean)
        .join(" "),
      prompt: "Cliente escribió: {{user_response}}",
      inputVariable: "user_response",
      outputVariable: "ai_response",
      onboardingVersion: "flexible-v1",
    },
  };
}

function appendNoPaymentEnding(
  params: FlexibleOnboardingParams,
  sourceId: string,
  x: number,
  y: number
) {
  const response = whatsappNode(
    "WhatsApp respuesta",
    "{{ai_response}}",
    params.whatsappNumber,
    x,
    y
  );
  const notify = whatsappNode(
    "Aviso al negocio",
    "Nueva solicitud de {{customer_name}}: {{user_response}}",
    params.whatsappNumber,
    x + 280,
    y + 120
  );
  const end = endNode(x + 560, y);
  return {
    nodes: [response, notify, end],
    edges: [connect(sourceId, response.id), connect(response.id, notify.id), connect(notify.id, end.id)],
  };
}

function appendPayPhoneSequence(
  params: FlexibleOnboardingParams,
  sourceId: string,
  x: number,
  y: number
) {
  const payment: FlowNode = {
    id: nodeId("payphone"),
    type: "create_payment",
    position: { x, y },
    data: {
      label: "Crear enlace PayPhone",
      provider: "PayPhone",
      amount: params.amountMode === "fixed" ? params.fixedAmount || 0 : 0,
      amountMode: params.amountMode,
      currency: params.currency,
      description: params.productOrService || "Pedido",
      customer: "{{customer_name}}",
      phoneNumber: "{{customer_phone}}",
      orderId: "ord_{{timestamp}}",
      payphoneIntegration: "API Link",
      confirmationMode: params.confirmationMode,
    },
  };
  const link = whatsappNode(
    "Enviar enlace PayPhone",
    "💳 Completa tu pago aquí: {{payment_url}}",
    params.whatsappNumber,
    x + 280,
    y
  );
  const wait: FlowNode = {
    id: nodeId("wait"),
    type: "wait_confirmation",
    position: { x: x + 560, y },
    data: {
      label:
        params.confirmationMode === "merchant_manual"
          ? "Esperar revisión del comercio"
          : "Esperar confirmación PayPhone",
      timeout: 900,
      confirmationMode: params.confirmationMode,
    },
  };

  if (params.confirmationMode === "merchant_manual") {
    const pending = whatsappNode(
      "Pago pendiente",
      "⏳ Recibimos tu pedido. El comercio revisará el pago antes de confirmarlo.",
      params.whatsappNumber,
      x + 840,
      y
    );
    const notify = whatsappNode(
      "Avisar al comercio",
      "Pedido pendiente de revisión. Confirma el pago en PayPhone antes de prepararlo.",
      params.whatsappNumber,
      x + 1120,
      y + 120
    );
    const end = endNode(x + 1400, y, "Pendiente de confirmación del comercio");
    return {
      nodes: [payment, link, wait, pending, notify, end],
      edges: [
        connect(sourceId, payment.id),
        connect(payment.id, link.id),
        connect(link.id, wait.id),
        connect(wait.id, pending.id),
        connect(pending.id, notify.id),
        connect(notify.id, end.id),
      ],
    };
  }

  const verify: FlowNode = {
    id: nodeId("verify"),
    type: "verify_payment",
    position: { x: x + 840, y },
    data: {
      label: "Registrar confirmación PayPhone",
      orderId: "{{payment_order_id}}",
      outputVariable: "payment_status",
      provider: "PayPhone",
      confirmationMode: "provider_webhook",
    },
  };
  return appendVerifiedBranches(params, sourceId, payment, link, wait, verify, x, y);
}

function appendVerifiedBranches(
  params: FlexibleOnboardingParams,
  sourceId: string,
  first: FlowNode,
  link: FlowNode,
  wait: FlowNode,
  verify: FlowNode,
  x: number,
  y: number
) {
  const success = whatsappNode(
    "Pago confirmado por proveedor",
    "✅ El proveedor confirmó el pago. Tu pedido continúa.",
    params.whatsappNumber,
    x + 1120,
    y - 180
  );
  const failed = whatsappNode(
    "Pago rechazado por proveedor",
    "❌ El proveedor informó que el pago fue rechazado.",
    params.whatsappNumber,
    x + 1120,
    y - 60
  );
  const pending = whatsappNode(
    "Pago pendiente en proveedor",
    "⏳ El proveedor todavía no confirma el pago.",
    params.whatsappNumber,
    x + 1120,
    y + 60
  );
  const error = whatsappNode(
    "Sin confirmación válida",
    "⚠️ No recibimos una confirmación válida. El comercio revisará el caso.",
    params.whatsappNumber,
    x + 1120,
    y + 180
  );
  const end = endNode(x + 1400, y);

  return {
    nodes: [first, link, wait, verify, success, failed, pending, error, end],
    edges: [
      connect(sourceId, first.id),
      connect(first.id, link.id),
      connect(link.id, wait.id),
      connect(wait.id, verify.id),
      connect(verify.id, success.id, "payment_success"),
      connect(verify.id, failed.id, "payment_failed"),
      connect(verify.id, pending.id, "payment_pending"),
      connect(verify.id, error.id, "error"),
      connect(success.id, end.id),
      connect(failed.id, end.id),
      connect(pending.id, end.id),
      connect(error.id, end.id),
    ],
  };
}

function appendExternalPaymentSequence(
  params: FlexibleOnboardingParams,
  sourceId: string,
  x: number,
  y: number
) {
  const providerName = params.externalProviderName?.trim() || "el proveedor del comercio";
  const paymentUrl = params.externalPaymentUrl?.trim() || "{{external_payment_url}}";
  const link = whatsappNode(
    "Enviar enlace del comercio",
    `💳 Completa tu pago con ${providerName}: ${paymentUrl}`,
    params.whatsappNumber,
    x,
    y
  );
  const wait: FlowNode = {
    id: nodeId("wait_external"),
    type: "wait_confirmation",
    position: { x: x + 280, y },
    data: {
      label:
        params.confirmationMode === "merchant_manual"
          ? "Esperar revisión del comercio"
          : `Esperar confirmación de ${providerName}`,
      timeout: 900,
      paymentProvider: "external",
      providerName,
      paymentUrl,
      confirmationMode: params.confirmationMode,
    },
  };

  if (params.confirmationMode === "merchant_manual") {
    const pending = whatsappNode(
      "Pedido pendiente",
      "⏳ Tu pedido fue recibido y queda pendiente de confirmación por el comercio.",
      params.whatsappNumber,
      x + 560,
      y
    );
    const notify = whatsappNode(
      "Avisar al comercio",
      `Nuevo pedido pendiente. Revisa ${providerName} antes de avanzar el pedido.`,
      params.whatsappNumber,
      x + 840,
      y + 120
    );
    const end = endNode(x + 1120, y, "Pendiente de confirmación del comercio");
    return {
      nodes: [link, wait, pending, notify, end],
      edges: [
        connect(sourceId, link.id),
        connect(link.id, wait.id),
        connect(wait.id, pending.id),
        connect(pending.id, notify.id),
        connect(notify.id, end.id),
      ],
    };
  }

  const verify: FlowNode = {
    id: nodeId("verify_external"),
    type: "verify_payment",
    position: { x: x + 560, y },
    data: {
      label: `Registrar señal de ${providerName}`,
      orderId: "{{payment_order_id}}",
      outputVariable: "payment_status",
      provider: "API externa",
      providerName,
      confirmationMode: "provider_webhook",
      integrationStatus: "requires_provider_adapter",
    },
  };

  const placeholder: FlowNode = {
    id: nodeId("external_link"),
    type: "message",
    position: { x, y },
    data: {
      label: "Enlace externo configurado",
      message: paymentUrl,
      provider: "API externa",
      providerName,
      disabledExecution: true,
    },
  };

  return appendVerifiedBranches(params, sourceId, placeholder, link, wait, verify, x, y);
}

export function generateFlexibleOnboardingFlow(
  params: FlexibleOnboardingParams
): FlexibleGeneratedFlow {
  counter = 0;
  const x = 60;
  const y = 320;
  const step = 280;
  const start = startNode(x, y);
  const welcome = whatsappNode(
    "WhatsApp bienvenida",
    params.welcomeMessage || `¡Hola! 👋 Bienvenido a ${params.businessName}.`,
    params.whatsappNumber,
    x + step,
    y
  );
  const ai = aiNode(params, x + step * 2, y);

  let tail:
    | { nodes: FlowNode[]; edges: FlowEdge[] }
    | undefined;

  if (params.paymentProvider === "payphone") {
    tail = appendPayPhoneSequence(params, ai.id, x + step * 3, y);
  } else if (params.paymentProvider === "external") {
    tail = appendExternalPaymentSequence(params, ai.id, x + step * 3, y);
  } else {
    tail = appendNoPaymentEnding(params, ai.id, x + step * 3, y);
  }

  const paymentLabel =
    params.paymentProvider === "payphone"
      ? "PayPhone"
      : params.paymentProvider === "external"
      ? params.externalProviderName?.trim() || "proveedor propio"
      : "sin pagos";

  return {
    name: `${params.businessName} · ${paymentLabel}`,
    description: `Flujo creado desde onboarding flexible para ${params.businessName}. Pago: ${paymentLabel}.`,
    nodes: [start, welcome, ai, ...tail.nodes],
    edges: [connect(start.id, welcome.id), connect(welcome.id, ai.id), ...tail.edges],
  };
}
