/**
 * PayFlow SMT — Arquitecto IA module (server-only).
 *
 * Detects events, proposes solutions, and waits for admin approval
 * before executing any critical action.
 *
 * SECURITY:
 *   - CLICKUP_API_TOKEN is NEVER exposed to the frontend.
 *   - All sensitive data is masked before display.
 *   - Critical actions require explicit admin approval.
 */

import "server-only";

export type EventSeverity = "low" | "medium" | "high" | "critical";
export type EventType =
  | "payphone_not_configured"
  | "payment_pending_24h"
  | "payment_failed"
  | "payment_expired"
  | "chatbot_error"
  | "client_requests_human"
  | "flow_save_error"
  | "webhook_error"
  | "supabase_error"
  | "client_pending_activation";

export type ProposalStatus = "detected" | "analyzed" | "pending_approval" | "approved" | "rejected" | "executed" | "failed";
export type RiskLevel = "low" | "medium" | "high";

export interface ArchitectEvent {
  id: string;
  eventType: EventType;
  source: string;
  severity: EventSeverity;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  status: ProposalStatus;
  createdAt: string;
}

export interface ArchitectProposal {
  id: string;
  eventId: string;
  diagnosis: string;
  recommendedAction: string;
  actionSteps: string[];
  riskLevel: RiskLevel;
  zaiPrompt: string;
  requiresApproval: boolean;
  approvalStatus: ProposalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface ArchitectAction {
  id: string;
  proposalId: string;
  actionType: string;
  status: "pending" | "executing" | "completed" | "failed";
  result: string | null;
  clickupTaskId: string | null;
  clickupTaskUrl: string | null;
  executedBy: string | null;
  executedAt: string | null;
  createdAt: string;
}

// ─── In-memory store (no DB required) ─────────────────────────────────

const events: ArchitectEvent[] = [];
const proposals: ArchitectProposal[] = [];
const actions: ArchitectAction[] = [];

// ─── Demo events (seeded on first load) ───────────────────────────────

function seedDemoEvents() {
  if (events.length > 0) return;

  const demoEvents: Array<Omit<ArchitectEvent, "id" | "createdAt">> = [
    {
      eventType: "payphone_not_configured",
      source: "system",
      severity: "high",
      title: "PayPhone no configurado",
      description: "PAYPHONE_TOKEN o PAYPHONE_STORE_ID faltan en variables de entorno. Los cobros no funcionarán.",
      metadata: { env: "production", missing: ["PAYPHONE_TOKEN", "PAYPHONE_STORE_ID"] },
      status: "detected",
    },
    {
      eventType: "payment_pending_24h",
      source: "payment",
      severity: "medium",
      title: "Pago pendiente más de 24 horas",
      description: "Una transacción lleva más de 24h en estado payment_pending sin confirmación.",
      metadata: { transactionId: "tx_****1234", amount: 49.99, hoursPending: 26 },
      status: "detected",
    },
    {
      eventType: "chatbot_error",
      source: "ai_assistant",
      severity: "medium",
      title: "Chatbot no pudo responder",
      description: "El asistente IA no pudo procesar 3 mensajes consecutivos. Posible problema de cuota o configuración.",
      metadata: { provider: "groq", errorCount: 3, lastError: "quota_exceeded" },
      status: "detected",
    },
    {
      eventType: "client_requests_human",
      source: "whatsapp",
      severity: "low",
      title: "Cliente solicita atención humana",
      description: "Un cliente escribió 'quiero hablar con una persona' durante una conversación automatizada.",
      metadata: { phoneMasked: "****4321", conversationId: "conv_****5678" },
      status: "detected",
    },
  ];

  for (const e of demoEvents) {
    events.push({
      ...e,
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    });
  }
}

seedDemoEvents();

// ─── Analyze event and create proposal ────────────────────────────────

export function analyzeEvent(event: ArchitectEvent): Omit<ArchitectProposal, "id" | "eventId" | "createdAt" | "approvedBy" | "approvedAt"> {
  const analyses: Record<EventType, {
    diagnosis: string;
    recommendedAction: string;
    actionSteps: string[];
    riskLevel: RiskLevel;
    zaiPrompt: string;
  }> = {
    payphone_not_configured: {
      diagnosis: "Credenciales PayPhone faltantes en el servidor.",
      recommendedAction: "Agregar PAYPHONE_TOKEN y PAYPHONE_STORE_ID en Vercel.",
      actionSteps: ["Ir a Vercel > Settings > Environment Variables", "Agregar PAYPHONE_TOKEN y PAYPHONE_STORE_ID", "Hacer redeploy"],
      riskLevel: "high",
      zaiPrompt: "Generar guía paso a paso para configurar PayPhone API Link en Vercel.",
    },
    payment_pending_24h: {
      diagnosis: "Transacción sin confirmación por más de 24 horas.",
      recommendedAction: "Verificar estado en PayPhone y contactar al cliente.",
      actionSteps: ["Consultar estado del pago en PayPhone", "Si fue pagado, actualizar a payment_success vía webhook", "Si no, contactar al cliente por WhatsApp"],
      riskLevel: "medium",
      zaiPrompt: "Redactar mensaje de seguimiento para cliente con pago pendiente de 24h.",
    },
    payment_failed: {
      diagnosis: "Pago rechazado por el procesador.",
      recommendedAction: "Notificar al cliente y ofrecer reintentar.",
      actionSteps: ["Enviar mensaje de pago fallido por WhatsApp", "Generar nuevo link PayPhone", "Esperar confirmación"],
      riskLevel: "low",
      zaiPrompt: "Redactar mensaje empático para cliente cuyo pago fue rechazado.",
    },
    payment_expired: {
      diagnosis: "Link de pago expiró sin uso.",
      recommendedAction: "Generar nuevo link y reenviar.",
      actionSteps: ["Generar nuevo link PayPhone", "Enviar por WhatsApp", "Actualizar registro"],
      riskLevel: "low",
      zaiPrompt: "Redactar mensaje ofreciendo nuevo link de pago.",
    },
    chatbot_error: {
      diagnosis: "Asistente IA fallando repetidamente.",
      recommendedAction: "Verificar cuota del proveedor IA y configuración.",
      actionSteps: ["Revisar logs de Vercel", "Verificar cuota de Groq/Gemini", "Cambiar a fallback local si es necesario"],
      riskLevel: "medium",
      zaiPrompt: "Diagnosticar por qué el chatbot falla y proponer solución.",
    },
    client_requests_human: {
      diagnosis: "Cliente prefiere atención humana.",
      recommendedAction: "Derivar a asesor humano y pausar automatización.",
      actionSteps: ["Notificar al equipo de soporte", "Pausar bot para este cliente", "Registrar en historial"],
      riskLevel: "low",
      zaiPrompt: "Redactar mensaje de derivación a humano cordial y profesional.",
    },
    flow_save_error: {
      diagnosis: "Error al guardar configuración de flujo.",
      recommendedAction: "Verificar permisos y almacenamiento.",
      actionSteps: ["Revisar logs de error", "Verificar localStorage", "Reintentar guardado"],
      riskLevel: "medium",
      zaiPrompt: "Diagnosticar error de guardado de flujo y proponer fix.",
    },
    webhook_error: {
      diagnosis: "Webhook de PayPhone fallando.",
      recommendedAction: "Verificar URL del webhook y headers.",
      actionSteps: ["Verificar URL en PayPhone", "Probar webhook manualmente", "Revisar logs"],
      riskLevel: "high",
      zaiPrompt: "Diagnosticar fallo de webhook PayPhone y proponer corrección.",
    },
    supabase_error: {
      diagnosis: "Error de conexión con Supabase.",
      recommendedAction: "Verificar credenciales y conectividad.",
      actionSteps: ["Verificar SUPABASE_URL y SUPABASE_ANON_KEY", "Probar conexión", "Revisar RLS policies"],
      riskLevel: "high",
      zaiPrompt: "Diagnosticar error de Supabase y proponer solución.",
    },
    client_pending_activation: {
      diagnosis: "Cliente con solicitud pendiente de activación.",
      recommendedAction: "Revisar solicitud y activar o solicitar más información.",
      actionSteps: ["Revisar datos del cliente", "Verificar PayPhone del cliente", "Activar o marcar info faltante"],
      riskLevel: "low",
      zaiPrompt: "Redactar resumen de cliente pendiente para revisión admin.",
    },
  };

  const analysis = analyses[event.eventType] || {
    diagnosis: "Evento no clasificado.",
    recommendedAction: "Investigar manualmente.",
    actionSteps: ["Revisar logs", "Contactar soporte"],
    riskLevel: "medium" as RiskLevel,
    zaiPrompt: "Diagnosticar evento desconocido.",
  };

  return {
    ...analysis,
    requiresApproval: true,
    approvalStatus: "pending_approval",
  };
}

// ─── Event management ─────────────────────────────────────────────────

export function getAllEvents(): ArchitectEvent[] {
  return events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getEventById(id: string): ArchitectEvent | null {
  return events.find(e => e.id === id) || null;
}

export function createEvent(data: Omit<ArchitectEvent, "id" | "createdAt">): ArchitectEvent {
  const event: ArchitectEvent = {
    ...data,
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  events.push(event);
  return event;
}

export function updateEventStatus(id: string, status: ProposalStatus): void {
  const event = events.find(e => e.id === id);
  if (event) event.status = status;
}

// ─── Proposal management ──────────────────────────────────────────────

export function getAllProposals(): ArchitectProposal[] {
  return proposals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getProposalById(id: string): ArchitectProposal | null {
  return proposals.find(p => p.id === id) || null;
}

export function createProposal(data: Omit<ArchitectProposal, "id" | "createdAt">): ArchitectProposal {
  const proposal: ArchitectProposal = {
    ...data,
    id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  proposals.push(proposal);
  return proposal;
}

export function updateProposal(id: string, updates: Partial<ArchitectProposal>): void {
  const proposal = proposals.find(p => p.id === id);
  if (proposal) Object.assign(proposal, updates);
}

// ─── Action management ────────────────────────────────────────────────

export function getAllActions(): ArchitectAction[] {
  return actions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function createAction(data: Omit<ArchitectAction, "id" | "createdAt">): ArchitectAction {
  const action: ArchitectAction = {
    ...data,
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  actions.push(action);
  return action;
}

export function updateAction(id: string, updates: Partial<ArchitectAction>): void {
  const action = actions.find(a => a.id === id);
  if (action) Object.assign(action, updates);
}

// ─── ClickUp integration ──────────────────────────────────────────────

export async function createClickUpTask(proposal: ArchitectProposal, event: ArchitectEvent): Promise<{ ok: boolean; taskId?: string; taskUrl?: string; error?: string }> {
  const token = process.env.CLICKUP_API_TOKEN;
  const listId = process.env.CLICKUP_LIST_ID;

  if (!token || !listId) {
    return { ok: false, error: "CLICKUP_API_TOKEN o CLICKUP_LIST_ID no configurados" };
  }

  try {
    const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `[PayFlow] ${event.title}`,
        description: `Diagnóstico: ${proposal.diagnosis}\n\nAcción: ${proposal.recommendedAction}\n\nPasos:\n${proposal.actionSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nSeveridad: ${event.severity}\nRiesgo: ${proposal.riskLevel}\nMódulo: ${event.source}\nPrompt Z.ai: ${proposal.zaiPrompt}`,
        priority: event.severity === "critical" ? 1 : event.severity === "high" ? 2 : event.severity === "medium" ? 3 : 4,
        tags: [event.eventType, "payflow-architect"],
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, error: `ClickUp ${res.status}: ${errText.slice(0, 200)}` };
    }

    const data = await res.json();
    return {
      ok: true,
      taskId: data.id,
      taskUrl: data.url,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Safe status (no secrets) ─────────────────────────────────────────

export function getArchitectStatus() {
  return {
    enabled: (process.env.ARCHITECT_AGENT_ENABLED || "true").toLowerCase() === "true",
    approvalRequired: (process.env.ARCHITECT_APPROVAL_REQUIRED || "true").toLowerCase() === "true",
    clickupEnabled: (process.env.CLICKUP_ENABLED || "false").toLowerCase() === "true",
    clickupConfigured: !!(process.env.CLICKUP_API_TOKEN && process.env.CLICKUP_LIST_ID),
    eventsCount: events.length,
    pendingProposals: proposals.filter(p => p.approvalStatus === "pending_approval").length,
    approvedProposals: proposals.filter(p => p.approvalStatus === "approved").length,
    executedActions: actions.filter(a => a.status === "completed").length,
    failedActions: actions.filter(a => a.status === "failed").length,
  };
}

// ─── Masking helpers ──────────────────────────────────────────────────

export function maskSensitive(value: string | null | undefined): string {
  if (!value) return "—";
  if (value.length <= 4) return "****";
  return "****" + value.slice(-4);
}
