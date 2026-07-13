import { NextResponse } from "next/server";
import { denyResponse, requireAdmin } from "@/lib/auth-server";
import {
  clickUpRequest,
  encryptWebhookSecret,
  getClickUpTokenRef,
  getSupabaseAdmin,
} from "@/lib/clickup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ClickUpUserResponse {
  user: { id: number | string; username?: string; email?: string };
}

interface ClickUpTeamsResponse {
  teams: Array<{ id: number | string; name: string }>;
}

interface ClickUpWebhookResponse {
  id: string;
  webhook: {
    id: string;
    endpoint: string;
    events: string[];
    secret: string;
  };
}

function webhookUrl(req: Request, requestedEndpoint: unknown): string {
  const value = String(requestedEndpoint || "").trim();
  const result = value || new URL("/api/clickup/webhook", req.url).toString();
  const parsed = new URL(result);
  if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("El webhook de ClickUp debe usar HTTPS.");
  }
  return parsed.toString();
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const endpoint = webhookUrl(req, body.endpoint);

    const [userResponse, teamsResponse] = await Promise.all([
      clickUpRequest<ClickUpUserResponse>("/user"),
      clickUpRequest<ClickUpTeamsResponse>("/team"),
    ]);

    const requestedWorkspaceId = String(body.workspace_id || "").trim();
    const workspace = requestedWorkspaceId
      ? teamsResponse.teams.find(
          (team) => String(team.id) === requestedWorkspaceId
        )
      : teamsResponse.teams[0];

    if (!workspace) {
      return NextResponse.json(
        { error: "El token no tiene acceso al Workspace solicitado." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: existing, error: existingError } = await supabase
      .from("clickup_connections")
      .select("id, workspace_id, webhook_id, webhook_secret_ref, status")
      .eq("workspace_id", String(workspace.id))
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing?.webhook_id && existing?.webhook_secret_ref) {
      return NextResponse.json({
        ok: true,
        already_connected: true,
        connection_id: existing.id,
        workspace: { id: String(workspace.id), name: workspace.name },
        webhook_id: existing.webhook_id,
        endpoint,
      });
    }

    const created = await clickUpRequest<ClickUpWebhookResponse>(
      `/team/${encodeURIComponent(String(workspace.id))}/webhook`,
      {
        method: "POST",
        body: JSON.stringify({
          endpoint,
          events: [
            "taskCreated",
            "taskUpdated",
            "taskDeleted",
            "taskCommentPosted",
            "taskCommentUpdated",
          ],
        }),
      }
    );

    const webhook = created.webhook || (created as unknown as ClickUpWebhookResponse["webhook"]);
    if (!webhook?.id || !webhook?.secret) {
      throw new Error("ClickUp no devolvio el identificador o secreto del webhook.");
    }

    const connectionPayload = {
      workspace_id: String(workspace.id),
      clickup_user_id: String(userResponse.user.id),
      access_type: "personal_token",
      token_ref: getClickUpTokenRef(),
      webhook_id: webhook.id,
      webhook_secret_ref: encryptWebhookSecret(webhook.secret),
      status: "active",
      updated_at: new Date().toISOString(),
    };

    const connectionQuery = existing?.id
      ? supabase
          .from("clickup_connections")
          .update(connectionPayload)
          .eq("id", existing.id)
      : supabase.from("clickup_connections").insert(connectionPayload);

    const { data: connection, error: connectionError } = await connectionQuery
      .select("id, workspace_id, webhook_id, status")
      .single();

    if (connectionError) {
      await clickUpRequest(`/webhook/${encodeURIComponent(webhook.id)}`, {
        method: "DELETE",
      }).catch(() => undefined);
      throw connectionError;
    }

    await supabase.from("audit_logs").insert({
      entity_type: "clickup_connection",
      entity_id: String(connection.id),
      action: "clickup_connection_created",
      metadata: {
        workspace_id: String(workspace.id),
        workspace_name: workspace.name,
        webhook_id: webhook.id,
        endpoint,
        actor_user_id: admin.userId,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        connected: true,
        connection_id: connection.id,
        workspace: { id: String(workspace.id), name: workspace.name },
        webhook_id: webhook.id,
        endpoint,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[clickup/connect]", error);
    return denyResponse(error);
  }
}

