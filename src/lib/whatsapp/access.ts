import "server-only";

import type { AuthenticatedUser } from "@/lib/auth/require-session";
import { isAdmin, isSuperAdmin, ROLES } from "@/lib/roles";
import { createServiceRoleClient } from "@/lib/supabase";
import { getWhatsAppApiVersion, WhatsAppCloudError } from "@/lib/whatsapp/cloud-api";
import { resolveWhatsAppConnection } from "@/lib/whatsapp/repository";
import type { WhatsAppManagementConfig } from "@/lib/whatsapp/management-api";

export type WhatsAppPermission = "operate" | "manage" | "super_admin";

export class WhatsAppAccessError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "WhatsAppAccessError";
    this.status = status;
  }
}

export async function resolveWhatsAppApiContext(input: {
  session: AuthenticatedUser;
  requestedClientId?: string | null;
  permission?: WhatsAppPermission;
  requireWaba?: boolean;
}) {
  const permission = input.permission || "operate";
  if (permission === "super_admin" && !isSuperAdmin(input.session)) {
    throw new WhatsAppAccessError("Esta operación requiere el rol super_admin.", 403);
  }
  if (
    permission === "manage" &&
    !isAdmin(input.session) &&
    input.session.role !== ROLES.CLIENT_OWNER
  ) {
    throw new WhatsAppAccessError("Solo el titular del negocio o un administrador puede modificar esta configuración.", 403);
  }
  if (
    input.session.clientId &&
    input.requestedClientId &&
    input.requestedClientId !== input.session.clientId
  ) {
    throw new WhatsAppAccessError("No puedes operar la conexión de otro negocio.", 403);
  }

  const clientId = input.session.clientId || (
    isAdmin(input.session)
      ? input.requestedClientId?.trim() || process.env.WHATSAPP_CLIENT_ID?.trim() || null
      : null
  );
  if (!clientId) throw new WhatsAppAccessError("Selecciona un negocio con WhatsApp configurado.", 409);

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!accessToken) throw new WhatsAppAccessError("WHATSAPP_ACCESS_TOKEN no está configurado.", 503);
  const connection = await resolveWhatsAppConnection(clientId).catch(() => null);
  if (!connection) throw new WhatsAppAccessError("El negocio no tiene una conexión activa de WhatsApp.", 409);
  if (input.requireWaba && !connection.businessAccountId) {
    throw new WhatsAppAccessError("El negocio no tiene configurado su WhatsApp Business Account ID.", 409);
  }

  const config: WhatsAppManagementConfig = {
    accessToken,
    apiVersion: getWhatsAppApiVersion(),
    phoneNumberId: connection.phoneNumberId,
    businessAccountId: connection.businessAccountId,
  };
  return { clientId, connection, config };
}

export async function recordWhatsAppAudit(input: {
  session: AuthenticatedUser;
  clientId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("audit_logs").insert({
      user_id: input.session.userId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId,
      metadata: { client_id: input.clientId, ...(input.metadata || {}) },
    });
    if (error) console.error("[whatsapp/audit]", error.message);
  } catch (error) {
    console.error("[whatsapp/audit]", error instanceof Error ? error.message : "unknown");
  }
}

export function whatsappApiError(error: unknown, fallback: string) {
  if (error instanceof WhatsAppAccessError) return { status: error.status, message: error.message };
  if (error instanceof WhatsAppCloudError) {
    return {
      status: error.status >= 400 && error.status < 500 ? error.status : 502,
      message: `${error.message}${error.providerCode ? ` Código ${error.providerCode}.` : ""}`,
    };
  }
  if (error instanceof Error && error.message === "WHATSAPP_WABA_REQUIRED") {
    return { status: 409, message: "El negocio no tiene configurado su WhatsApp Business Account ID." };
  }
  return { status: 502, message: fallback };
}
