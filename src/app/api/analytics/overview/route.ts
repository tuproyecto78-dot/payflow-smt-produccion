import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import { isInternalAccessRole } from "@/lib/auth/access-profile";
import { createServiceRoleClient } from "@/lib/supabase";

type DailyRow = {
  client_id: string;
  metric_date: string;
  unique_contacts: number | string;
  inbound_messages: number | string;
  outbound_messages: number | string;
  failed_messages: number | string;
  payment_links: number | string;
  paid_transactions: number | string;
  failed_transactions: number | string;
  revenue: number | string;
  workflow_runs: number | string;
  successful_runs: number | string;
  failed_runs: number | string;
};

const TIME_ZONE = "America/Guayaquil";
function localDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
function n(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const url = new URL(req.url);
  const requestedClient = url.searchParams.get("clientId");
  const clientId = session.clientId ||
    (isInternalAccessRole(session.role) ? requestedClient || process.env.WHATSAPP_CLIENT_ID?.trim() || null : null);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") || 30), 7), 90);
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const fromDate = localDate(start);
  const toDate = localDate();

  const supabase = createServiceRoleClient();
  let query = supabase.from("analytics_daily").select("*").gte("metric_date", fromDate).lte("metric_date", toDate);
  if (clientId) query = query.eq("client_id", clientId);
  const { data, error } = await query.order("metric_date", { ascending: true });
  if (error) {
    console.error("[analytics/overview] query failed", error.message);
    return NextResponse.json({ error: "No se pudieron cargar las métricas." }, { status: 503 });
  }

  const byDate = new Map<string, Omit<DailyRow, "client_id" | "metric_date">>();
  for (const raw of (data || []) as DailyRow[]) {
    const current = byDate.get(raw.metric_date) || {
      unique_contacts: 0,
      inbound_messages: 0,
      outbound_messages: 0,
      failed_messages: 0,
      payment_links: 0,
      paid_transactions: 0,
      failed_transactions: 0,
      revenue: 0,
      workflow_runs: 0,
      successful_runs: 0,
      failed_runs: 0,
    };
    for (const key of Object.keys(current) as Array<keyof typeof current>) {
      current[key] = n(current[key]) + n(raw[key]);
    }
    byDate.set(raw.metric_date, current);
  }

  const trend = Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const key = localDate(date);
    const row = byDate.get(key);
    return {
      date: key,
      contacts: n(row?.unique_contacts),
      inboundMessages: n(row?.inbound_messages),
      outboundMessages: n(row?.outbound_messages),
      paymentLinks: n(row?.payment_links),
      paid: n(row?.paid_transactions),
      revenue: n(row?.revenue),
      workflowRuns: n(row?.workflow_runs),
      failedRuns: n(row?.failed_runs),
      failedMessages: n(row?.failed_messages),
      failedPayments: n(row?.failed_transactions),
    };
  });
  const today = trend[trend.length - 1];
  const yesterday = trend[trend.length - 2];
  const conversion = today.paymentLinks > 0 ? (today.paid / today.paymentLinks) * 100 : 0;
  const pendingPayments = Math.max(today.paymentLinks - today.paid - today.failedPayments, 0);

  return NextResponse.json({
    timezone: TIME_ZONE,
    clientId,
    period: { from: fromDate, to: toDate, days },
    summary: {
      contactsToday: today.contacts,
      contactsYesterday: yesterday?.contacts || 0,
      conversationsToday: today.contacts,
      paymentsToday: today.paid,
      revenueToday: today.revenue,
      conversion,
      failedRunsToday: today.failedRuns,
      pendingPayments,
    },
    funnel: [
      { name: "Contactos", value: today.contacts },
      { name: "Links de pago", value: today.paymentLinks },
      { name: "Pagos aprobados", value: today.paid },
    ],
    paymentStatus: {
      approved: today.paid,
      failed: today.failedPayments,
      pending: pendingPayments,
    },
    alerts: [
      ...(today.failedRuns > 0 ? [{ level: "high", message: `${today.failedRuns} flujo(s) fallaron hoy.` }] : []),
      ...(today.failedMessages > 0 ? [{ level: "medium", message: `${today.failedMessages} mensaje(s) no se entregaron.` }] : []),
      ...(pendingPayments > 0 ? [{ level: "medium", message: `${pendingPayments} pago(s) continúan pendientes.` }] : []),
    ],
    trend,
  });
}

export const dynamic = "force-dynamic";
