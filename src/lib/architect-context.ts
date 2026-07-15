import "server-only";

import { getSafeAIStatus } from "@/lib/ai/config";
import { getSupabaseAdmin } from "@/lib/clickup";
import { getPayPhoneConfig } from "@/lib/payphone-config";

export type ModuleStatus = "healthy" | "warning" | "error";
export type AlertSeverity = "low" | "medium" | "high";

export interface ArchitectModule {
  id: string;
  label: string;
  status: ModuleStatus;
  detail: string;
  metric?: string;
}

export interface ArchitectAlert {
  id: string;
  module: string;
  title: string;
  detail: string;
  severity: AlertSeverity;
  suggestedPrompt: string;
}

export interface ArchitectSystemContext {
  generatedAt: string;
  modules: ArchitectModule[];
  alerts: ArchitectAlert[];
  metrics: {
    workflows: number;
    failedRuns: number;
    pendingPayments: number;
    failedPayments: number;
    pendingClickUpEvents: number;
    failedClickUpEvents: number;
    pendingSuggestions: number;
    whatsappConnections: number;
  };
}

async function countRows(
  table: string,
  filter?: { column: string; value?: string; values?: string[] }
): Promise<number> {
  const supabase = getSupabaseAdmin();
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  if (filter?.values) query = query.in(filter.column, filter.values);
  else if (filter?.value !== undefined) query = query.eq(filter.column, filter.value);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

function settledValue(result: PromiseSettledResult<number>): number {
  return result.status === "fulfilled" ? result.value : 0;
}

export async function collectArchitectContext(): Promise<ArchitectSystemContext> {
  const ai = getSafeAIStatus();
  const payphone = getPayPhoneConfig();
  const supabase = getSupabaseAdmin();
  const [connectionResult, counts] = await Promise.all([
    supabase
      .from("clickup_connections")
      .select("id, workspace_id, status, updated_at")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    Promise.allSettled([
      countRows("workflows"),
      countRows("workflow_runs", { column: "status", values: ["failed", "error"] }),
      countRows("payment_transactions", { column: "status", value: "payment_pending" }),
      countRows("payment_transactions", { column: "status", values: ["payment_failed", "failed", "error"] }),
      countRows("clickup_events", { column: "processing_status", values: ["detected", "pending_analysis"] }),
      countRows("clickup_events", { column: "processing_status", value: "failed" }),
      countRows("architecture_suggestions", { column: "approval_status", value: "pending" }),
      countRows("whatsapp_connections", { column: "status", value: "active" }),
    ]),
  ]);

  const metrics = {
    workflows: settledValue(counts[0]),
    failedRuns: settledValue(counts[1]),
    pendingPayments: settledValue(counts[2]),
    failedPayments: settledValue(counts[3]),
    pendingClickUpEvents: settledValue(counts[4]),
    failedClickUpEvents: settledValue(counts[5]),
    pendingSuggestions: settledValue(counts[6]),
    whatsappConnections: settledValue(counts[7]),
  };

  const whatsappConfigured = Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN?.trim() &&
    (process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || metrics.whatsappConnections > 0)
  );

  const databaseErrors = counts.filter((item) => item.status === "rejected").length;
  const clickupConnected = Boolean(connectionResult.data && !connectionResult.error);
  const alerts: ArchitectAlert[] = [];

  if (databaseErrors > 0) {
    alerts.push({
      id: "supabase-schema",
      module: "supabase",
      title: "Hay fuentes de datos que no pudieron consultarse",
      detail: `${databaseErrors} consultas del mapa no respondieron. Conviene revisar tablas, columnas y esquema de Supabase.`,
      severity: "high",
      suggestedPrompt: "Revisa las consultas fallidas de Supabase, identifica tablas o columnas incompatibles y propón cómo corregirlas.",
    });
  }
  if (!clickupConnected) {
    alerts.push({
      id: "clickup-connection",
      module: "clickup",
      title: "ClickUp no aparece conectado",
      detail: connectionResult.error?.message || "No se encontró una conexión activa.",
      severity: "high",
      suggestedPrompt: "Revisa la conexión de ClickUp y dime qué falta para dejar el webhook activo.",
    });
  }
  if (!payphone.configured) {
    alerts.push({
      id: "payphone-config",
      module: "payphone",
      title: "PayPhone requiere configuración",
      detail: payphone.message || "Las credenciales o funciones necesarias no están activas.",
      severity: "high",
      suggestedPrompt: "Revisa la configuración real de PayPhone y prepara una propuesta segura para corregir lo que falta.",
    });
  }
  if (!whatsappConfigured) {
    alerts.push({
      id: "whatsapp-config",
      module: "whatsapp",
      title: "WhatsApp no está completamente configurado",
      detail: metrics.whatsappConnections > 0
        ? "Hay conexiones por negocio, pero falta el token o la versión de WhatsApp Business Cloud API."
        : "No se detecta una conexión activa por negocio ni un número emisor de respaldo.",
      severity: "medium",
      suggestedPrompt: "Revisa la configuración de WhatsApp Business y dime qué variables o pruebas faltan.",
    });
  }
  if (!ai.configured) {
    alerts.push({
      id: "ai-config",
      module: "ai",
      title: "Proveedor de IA sin credenciales activas",
      detail: "El Arquitecto usará respuestas locales hasta configurar un proveedor de IA.",
      severity: "medium",
      suggestedPrompt: "Revisa la configuración del proveedor de IA y recomiéndame la opción más segura para PayFlow SMT.",
    });
  }
  if (metrics.failedPayments > 0) {
    alerts.push({
      id: "failed-payments",
      module: "payphone",
      title: `${metrics.failedPayments} pagos con error o fallo`,
      detail: "Existen transacciones fallidas que requieren revisión; no se modificará su estado automáticamente.",
      severity: "high",
      suggestedPrompt: "Analiza los pagos fallidos, identifica patrones y propón acciones sin cambiar estados de pago automáticamente.",
    });
  }
  if (metrics.pendingPayments > 0) {
    alerts.push({
      id: "pending-payments",
      module: "payphone",
      title: `${metrics.pendingPayments} pagos pendientes`,
      detail: "Conviene revisar antigüedad, webhook e idempotencia antes de contactar clientes.",
      severity: "medium",
      suggestedPrompt: "Revisa los pagos pendientes y propón cómo validar webhook, antigüedad e idempotencia.",
    });
  }
  if (metrics.failedClickUpEvents > 0) {
    alerts.push({
      id: "failed-clickup-events",
      module: "clickup",
      title: `${metrics.failedClickUpEvents} eventos de ClickUp fallidos`,
      detail: "Los eventos pueden reintentarse de forma controlada después de tu aprobación.",
      severity: "high",
      suggestedPrompt: "Revisa los eventos fallidos de ClickUp y prepara un reintento seguro para mi aprobación.",
    });
  }
  if (metrics.pendingClickUpEvents > 0) {
    alerts.push({
      id: "pending-clickup-events",
      module: "clickup",
      title: `${metrics.pendingClickUpEvents} eventos pendientes de análisis`,
      detail: "El Arquitecto puede ponerlos en la cola de análisis con aprobación humana.",
      severity: "medium",
      suggestedPrompt: "Analiza los eventos pendientes de ClickUp y crea propuestas priorizadas.",
    });
  }
  if (metrics.failedRuns > 0) {
    alerts.push({
      id: "failed-workflows",
      module: "workflows",
      title: `${metrics.failedRuns} ejecuciones de flujos fallidas`,
      detail: "Se recomienda revisar los nodos y mensajes de error antes de reintentar.",
      severity: "high",
      suggestedPrompt: "Revisa las ejecuciones fallidas de flujos, encuentra el nodo probable y propón una corrección.",
    });
  }

  const modules: ArchitectModule[] = [
    { id: "architect", label: "Arquitecto IA", status: ai.configured ? "healthy" : "warning", detail: ai.configured ? `${ai.provider} · ${ai.model}` : "Modo local", metric: `${alerts.length} alertas` },
    { id: "supabase", label: "Supabase", status: databaseErrors === 0 ? "healthy" : "error", detail: databaseErrors === 0 ? "Datos conectados" : `${databaseErrors} consultas fallidas`, metric: `${metrics.pendingSuggestions} propuestas` },
    { id: "clickup", label: "ClickUp", status: clickupConnected ? (metrics.failedClickUpEvents ? "error" : "healthy") : "error", detail: clickupConnected ? "Webhook activo" : "Sin conexión activa", metric: `${metrics.pendingClickUpEvents} pendientes` },
    { id: "payphone", label: "PayPhone", status: payphone.configured ? (metrics.failedPayments ? "error" : "healthy") : "warning", detail: payphone.configured ? payphone.env : "Configuración incompleta", metric: `${metrics.pendingPayments} pendientes` },
    {
      id: "whatsapp",
      label: "WhatsApp",
      status: whatsappConfigured ? "healthy" : "warning",
      detail: whatsappConfigured ? "API oficial configurada" : "Configuración incompleta",
      metric: `${metrics.whatsappConnections} conexiones activas`,
    },
    { id: "workflows", label: "Flujos", status: metrics.failedRuns ? "error" : "healthy", detail: `${metrics.workflows} flujos registrados`, metric: `${metrics.failedRuns} fallidos` },
    { id: "vercel", label: "Vercel", status: process.env.VERCEL ? "healthy" : "warning", detail: process.env.VERCEL_ENV || "Entorno local" },
    { id: "ai", label: "Proveedor IA", status: ai.configured ? "healthy" : "warning", detail: ai.configured ? ai.provider : "Fallback local", metric: ai.model },
  ];

  return { generatedAt: new Date().toISOString(), modules, alerts, metrics };
}
