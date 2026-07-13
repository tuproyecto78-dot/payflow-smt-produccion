import { NextResponse } from "next/server";
import {
  clickUpIdempotencyKey,
  decryptWebhookSecret,
  getSupabaseAdmin,
  verifyClickUpSignature,
} from "@/lib/clickup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ClickUpWebhookPayload {
  event?: string;
  webhook_id?: string;
  task_id?: string;
  comment_id?: string | number;
  history_items?: Array<{
    id?: string | number;
    field?: string;
    parent_id?: string | number;
    date?: string;
    before?: unknown;
    after?: unknown;
  }>;
  [key: string]: unknown;
}

function riskLevel(eventType: string): "low" | "medium" | "high" {
  if (/deleted/i.test(eventType)) return "high";
  if (/status|priority|assignee|dueDate|updated/i.test(eventType)) return "medium";
  return "low";
}

function commentId(payload: ClickUpWebhookPayload): string | null {
  if (payload.comment_id) return String(payload.comment_id);
  const commentChange = payload.history_items?.find(
    (item) => item.field === "comment"
  );
  return commentChange?.parent_id ? String(commentChange.parent_id) : null;
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  let payload: ClickUpWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ClickUpWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Payload JSON invalido." }, { status: 400 });
  }

  const webhookId = String(payload.webhook_id || "").trim();
  const signature = String(req.headers.get("x-signature") || "").trim();
  if (!webhookId || !signature) {
    return NextResponse.json(
      { error: "Faltan webhook_id o X-Signature." },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: connection, error: connectionError } = await supabase
      .from("clickup_connections")
      .select("id, webhook_secret_ref, status")
      .eq("webhook_id", webhookId)
      .eq("status", "active")
      .maybeSingle();

    if (connectionError) throw connectionError;
    if (!connection?.webhook_secret_ref) {
      return NextResponse.json(
        { error: "Conexion de ClickUp no configurada." },
        { status: 503 }
      );
    }

    const secret = decryptWebhookSecret(connection.webhook_secret_ref);
    if (!verifyClickUpSignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: "Firma invalida." }, { status: 401 });
    }

    const eventType = String(payload.event || "unknown");
    const idempotencyKey = clickUpIdempotencyKey(rawBody);
    const normalizedPayload = {
      event: eventType,
      webhook_id: webhookId,
      task_id: payload.task_id ? String(payload.task_id) : null,
      comment_id: commentId(payload),
      changes: (payload.history_items || []).map((item) => ({
        id: item.id ? String(item.id) : null,
        field: item.field || null,
        date: item.date || null,
        before: item.before ?? null,
        after: item.after ?? null,
      })),
    };

    const { data: event, error: eventError } = await supabase
      .from("clickup_events")
      .insert({
        connection_id: connection.id,
        event_type: eventType,
        event_idempotency_key: idempotencyKey,
        clickup_task_id: payload.task_id ? String(payload.task_id) : null,
        clickup_comment_id: commentId(payload),
        source_payload: payload,
        normalized_payload: normalizedPayload,
        processing_status: "pending_analysis",
        risk_level: riskLevel(eventType),
      })
      .select("id")
      .single();

    if (eventError?.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    if (eventError) throw eventError;

    const { error: auditError } = await supabase.from("audit_logs").insert({
      entity_type: "clickup_event",
      entity_id: String(event.id),
      action: "clickup_event_received",
      metadata: {
        webhook_id: webhookId,
        event_type: eventType,
        task_id: payload.task_id ? String(payload.task_id) : null,
        risk_level: riskLevel(eventType),
      },
    });
    if (auditError) console.error("[clickup/webhook] audit", auditError);

    return NextResponse.json(
      { ok: true, received: true, event_id: event.id },
      { status: 202 }
    );
  } catch (error) {
    console.error("[clickup/webhook]", error);
    return NextResponse.json(
      { error: "No se pudo procesar el webhook." },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "ClickUp webhook",
    configured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.SUPABASE_SERVICE_ROLE_KEY &&
        process.env.SESSION_SECRET
    ),
  });
}

