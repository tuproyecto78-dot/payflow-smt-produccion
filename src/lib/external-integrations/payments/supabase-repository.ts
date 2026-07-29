import "server-only";

import { createServiceRoleClient } from "@/lib/supabase";

import { ExternalPaymentError } from "./domain";
import type { ExternalPaymentRepository } from "./repository";
import type {
  ActivePaymentBusiness,
  BusinessPaymentMethod,
  ExternalPaymentRequest,
  ExternalPaymentStatus,
  ManualPaymentConfirmationResult,
  NormalizedManualPaymentConfirmationCommand,
  PaymentConfirmationMode,
  PaymentMethodKind,
  PaymentMethodMode,
  PaymentMethodStatus,
  PaymentPathType,
} from "./types";

type PaymentMethodRow = {
  id: string;
  client_id: string;
  kind: string;
  provider_code: string;
  mode: string;
  display_name: string;
  external_url: string | null;
  provider_account_reference: string | null;
  status: string;
  created_by: string;
  deactivated_by: string | null;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
};

type PaymentRequestRow = {
  id: string;
  client_id: string;
  payment_method_id: string | null;
  created_by: string;
  business_name: string;
  path_type: string;
  provider: string;
  provider_mode: string;
  provider_reference: string;
  order_reference: string;
  idempotency_key: string;
  amount: number | string;
  currency: string;
  description: string;
  customer_name: string | null;
  status: string;
  confirmation_mode: string;
  real_charge: boolean;
  payment_link: string;
  metadata: Record<string, unknown> | null;
  last_event_at: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  confirmation_note: string | null;
  created_at: string;
  updated_at: string;
};

function mapMethod(row: PaymentMethodRow): BusinessPaymentMethod {
  return {
    id: String(row.id),
    clientId: String(row.client_id),
    kind: row.kind as PaymentMethodKind,
    providerCode: String(row.provider_code),
    mode: row.mode as PaymentMethodMode,
    displayName: String(row.display_name),
    externalUrl: row.external_url ? String(row.external_url) : null,
    providerAccountReference: row.provider_account_reference
      ? String(row.provider_account_reference)
      : null,
    status: row.status as PaymentMethodStatus,
    createdBy: String(row.created_by),
    deactivatedBy: row.deactivated_by
      ? String(row.deactivated_by)
      : null,
    deactivatedAt: row.deactivated_at
      ? String(row.deactivated_at)
      : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapRequest(row: PaymentRequestRow): ExternalPaymentRequest {
  if (!row.payment_method_id) {
    throw new ExternalPaymentError(
      "LEGACY_PAYMENT_REQUEST",
      "La solicitud pertenece al sandbox legado.",
      409
    );
  }
  return {
    id: String(row.id),
    clientId: String(row.client_id),
    paymentMethodId: String(row.payment_method_id),
    createdBy: String(row.created_by),
    businessName: String(row.business_name),
    pathType: row.path_type as PaymentPathType,
    provider: String(row.provider),
    providerMode: row.provider_mode as PaymentMethodMode,
    providerReference: String(row.provider_reference),
    orderReference: String(row.order_reference),
    idempotencyKey: String(row.idempotency_key),
    amount: Number(row.amount),
    currency: String(row.currency),
    description: String(row.description),
    customerName: row.customer_name ? String(row.customer_name) : null,
    status: row.status as ExternalPaymentStatus,
    confirmationMode: row.confirmation_mode as PaymentConfirmationMode,
    realCharge: false,
    paymentLink: String(row.payment_link),
    metadata:
      row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    lastEventAt: row.last_event_at ? String(row.last_event_at) : null,
    confirmedBy: row.confirmed_by ? String(row.confirmed_by) : null,
    confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
    confirmationNote: row.confirmation_note
      ? String(row.confirmation_note)
      : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function methodInsertRow(method: BusinessPaymentMethod) {
  return {
    id: method.id,
    client_id: method.clientId,
    kind: method.kind,
    provider_code: method.providerCode,
    mode: method.mode,
    display_name: method.displayName,
    external_url: method.externalUrl,
    provider_account_reference: method.providerAccountReference,
    status: method.status,
    created_by: method.createdBy,
    deactivated_by: method.deactivatedBy,
    deactivated_at: method.deactivatedAt,
    created_at: method.createdAt,
    updated_at: method.updatedAt,
  };
}

function requestInsertRow(request: ExternalPaymentRequest) {
  return {
    id: request.id,
    client_id: request.clientId,
    payment_method_id: request.paymentMethodId,
    created_by: request.createdBy,
    business_name: request.businessName,
    path_type: request.pathType,
    provider: request.provider,
    provider_mode: request.providerMode,
    provider_reference: request.providerReference,
    order_reference: request.orderReference,
    idempotency_key: request.idempotencyKey,
    amount: request.amount,
    currency: request.currency,
    description: request.description,
    customer_name: request.customerName,
    status: request.status,
    confirmation_mode: request.confirmationMode,
    real_charge: false,
    payment_link: request.paymentLink,
    checkout_token_hash: null,
    metadata: request.metadata,
    last_event_at: request.lastEventAt,
    confirmed_by: request.confirmedBy,
    confirmed_at: request.confirmedAt,
    confirmation_note: request.confirmationNote,
    created_at: request.createdAt,
    updated_at: request.updatedAt,
  };
}

export class SupabaseExternalPaymentRepository
  implements ExternalPaymentRepository
{
  async findActiveBusiness(
    clientId: string
  ): Promise<ActivePaymentBusiness | null> {
    const { data, error } = await createServiceRoleClient()
      .from("client_accounts")
      .select("id, business_name, status")
      .eq("id", clientId)
      .eq("status", "active")
      .maybeSingle();
    if (error) {
      throw new ExternalPaymentError(
        "PAYMENT_REPOSITORY_ERROR",
        "No se pudo cargar el negocio.",
        500
      );
    }
    if (!data) return null;
    return {
      id: String(data.id),
      businessName: String(data.business_name),
      status: "active",
    };
  }

  async createMethod(
    method: BusinessPaymentMethod
  ): Promise<BusinessPaymentMethod> {
    const { data, error } = await createServiceRoleClient()
      .from("business_payment_methods")
      .insert(methodInsertRow(method))
      .select("*")
      .single();
    if (error || !data) {
      throw new ExternalPaymentError(
        "PAYMENT_REPOSITORY_ERROR",
        "No se pudo registrar el método de pago.",
        500
      );
    }
    return mapMethod(data as PaymentMethodRow);
  }

  async listMethods(clientId: string): Promise<BusinessPaymentMethod[]> {
    const { data, error } = await createServiceRoleClient()
      .from("business_payment_methods")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) {
      throw new ExternalPaymentError(
        "PAYMENT_REPOSITORY_ERROR",
        "No se pudieron consultar los métodos de pago.",
        500
      );
    }
    return (data || []).map((row) => mapMethod(row as PaymentMethodRow));
  }

  async findMethod(
    clientId: string,
    methodId: string
  ): Promise<BusinessPaymentMethod | null> {
    const { data, error } = await createServiceRoleClient()
      .from("business_payment_methods")
      .select("*")
      .eq("id", methodId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (error) {
      throw new ExternalPaymentError(
        "PAYMENT_REPOSITORY_ERROR",
        "No se pudo consultar el método de pago.",
        500
      );
    }
    return data ? mapMethod(data as PaymentMethodRow) : null;
  }

  async deactivateMethod(input: {
    clientId: string;
    methodId: string;
    actorUserId: string;
    now: string;
  }): Promise<{ method: BusinessPaymentMethod; changed: boolean }> {
    const current = await this.findMethod(input.clientId, input.methodId);
    if (!current) {
      throw new ExternalPaymentError(
        "PAYMENT_METHOD_NOT_FOUND",
        "El método de pago no existe.",
        404
      );
    }
    if (current.status === "inactive") {
      return { method: current, changed: false };
    }
    const { data, error } = await createServiceRoleClient()
      .from("business_payment_methods")
      .update({
        status: "inactive",
        deactivated_by: input.actorUserId,
        deactivated_at: input.now,
        updated_at: input.now,
      })
      .eq("id", input.methodId)
      .eq("client_id", input.clientId)
      .eq("status", "active")
      .select("*")
      .single();
    if (error || !data) {
      throw new ExternalPaymentError(
        "PAYMENT_REPOSITORY_ERROR",
        "No se pudo desactivar el método de pago.",
        500
      );
    }
    return { method: mapMethod(data as PaymentMethodRow), changed: true };
  }

  async findById(id: string): Promise<ExternalPaymentRequest | null> {
    const { data, error } = await createServiceRoleClient()
      .from("external_payment_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      throw new ExternalPaymentError(
        "PAYMENT_REPOSITORY_ERROR",
        "No se pudo consultar la solicitud de pago.",
        500
      );
    }
    return data ? mapRequest(data as PaymentRequestRow) : null;
  }

  async findByIdempotencyKey(
    clientId: string,
    idempotencyKey: string
  ): Promise<ExternalPaymentRequest | null> {
    const { data, error } = await createServiceRoleClient()
      .from("external_payment_requests")
      .select("*")
      .eq("client_id", clientId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (error) {
      throw new ExternalPaymentError(
        "PAYMENT_REPOSITORY_ERROR",
        "No se pudo consultar la solicitud de pago.",
        500
      );
    }
    return data ? mapRequest(data as PaymentRequestRow) : null;
  }

  async createRequest(
    request: ExternalPaymentRequest
  ): Promise<{ request: ExternalPaymentRequest; created: boolean }> {
    const { data, error } = await createServiceRoleClient()
      .from("external_payment_requests")
      .insert(requestInsertRow(request))
      .select("*")
      .single();
    if (!error && data) {
      return {
        request: mapRequest(data as PaymentRequestRow),
        created: true,
      };
    }
    if (error?.code === "23505") {
      const existing = await this.findByIdempotencyKey(
        request.clientId,
        request.idempotencyKey
      );
      if (existing) return { request: existing, created: false };
    }
    throw new ExternalPaymentError(
      "PAYMENT_REPOSITORY_ERROR",
      "No se pudo guardar la solicitud de pago.",
      500
    );
  }

  async confirmManual(
    command: NormalizedManualPaymentConfirmationCommand,
    now: string
  ): Promise<ManualPaymentConfirmationResult> {
    const { data, error } = await createServiceRoleClient().rpc(
      "confirm_external_payment_manual",
      {
        p_payment_request_id: command.paymentRequestId,
        p_client_id: command.clientId,
        p_actor_user_id: command.actorUserId,
        p_actor_role: command.actorRole,
        p_status: command.status,
        p_idempotency_key: command.idempotencyKey,
        p_note: command.note,
        p_confirmed_at: now,
      }
    );
    if (error) {
      const message = String(error.message || "");
      if (message.includes("EXTERNAL_PAYMENT_NOT_FOUND")) {
        throw new ExternalPaymentError(
          "PAYMENT_NOT_FOUND",
          "La solicitud de pago no existe.",
          404
        );
      }
      if (message.includes("EXTERNAL_PAYMENT_TERMINAL")) {
        throw new ExternalPaymentError(
          "PAYMENT_TERMINAL",
          "El pago ya tiene un estado terminal.",
          409
        );
      }
      if (message.includes("EXTERNAL_PAYMENT_NOT_MANUAL")) {
        throw new ExternalPaymentError(
          "PAYMENT_NOT_MANUAL",
          "Esta solicitud no admite confirmación manual.",
          409
        );
      }
      if (message.includes("EXTERNAL_PAYMENT_BUSINESS_INACTIVE")) {
        throw new ExternalPaymentError(
          "PAYMENT_BUSINESS_INACTIVE",
          "El negocio no existe o no está activo.",
          403
        );
      }
      if (message.includes("EXTERNAL_PAYMENT_CONFIRMATION_FORBIDDEN")) {
        throw new ExternalPaymentError(
          "PAYMENT_CONFIRMATION_FORBIDDEN",
          "No tienes permisos para confirmar este pago.",
          403
        );
      }
      if (message.includes("EXTERNAL_PAYMENT_IDEMPOTENCY_CONFLICT")) {
        throw new ExternalPaymentError(
          "IDEMPOTENCY_CONFLICT",
          "La clave de idempotencia ya pertenece a otra confirmación.",
          409
        );
      }
      throw new ExternalPaymentError(
        "PAYMENT_REPOSITORY_ERROR",
        "No se pudo confirmar manualmente el pago.",
        500
      );
    }
    const result =
      data && typeof data === "object"
        ? (data as Record<string, unknown>)
        : null;
    const row =
      result?.request && typeof result.request === "object"
        ? (result.request as PaymentRequestRow)
        : null;
    if (!result || !row) {
      throw new ExternalPaymentError(
        "PAYMENT_REPOSITORY_ERROR",
        "La confirmación manual no devolvió una respuesta válida.",
        500
      );
    }
    return {
      request: mapRequest(row),
      duplicate: result.duplicate === true,
      transitionApplied: result.transition_applied === true,
    };
  }
}
