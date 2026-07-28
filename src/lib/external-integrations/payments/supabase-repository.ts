import "server-only";

import { createServiceRoleClient } from "@/lib/supabase";

import { ExternalPaymentError } from "./domain";
import type { ExternalPaymentRepository } from "./repository";
import type {
  AppliedExternalPaymentEvent,
  ExternalPaymentRequest,
  ExternalPaymentStatus,
  ExternalPaymentWebhookEvent,
} from "./types";

type PaymentRequestRow = {
  id: string;
  client_id: string;
  created_by: string;
  business_name: string;
  provider: string;
  provider_reference: string;
  order_reference: string;
  idempotency_key: string;
  amount: number | string;
  currency: string;
  description: string;
  customer_name: string | null;
  status: string;
  payment_link: string;
  checkout_token_hash: string;
  metadata: Record<string, unknown> | null;
  last_event_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapRequest(row: PaymentRequestRow): ExternalPaymentRequest {
  return {
    id: String(row.id),
    clientId: String(row.client_id),
    createdBy: String(row.created_by),
    businessName: String(row.business_name),
    provider: "sandbox",
    providerReference: String(row.provider_reference),
    orderReference: String(row.order_reference),
    idempotencyKey: String(row.idempotency_key),
    amount: Number(row.amount),
    currency: String(row.currency),
    description: String(row.description),
    customerName: row.customer_name ? String(row.customer_name) : null,
    status: row.status as ExternalPaymentStatus,
    paymentLink: String(row.payment_link),
    checkoutTokenHash: String(row.checkout_token_hash),
    metadata:
      row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    lastEventAt: row.last_event_at ? String(row.last_event_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toInsertRow(request: ExternalPaymentRequest) {
  return {
    id: request.id,
    client_id: request.clientId,
    created_by: request.createdBy,
    business_name: request.businessName,
    provider: request.provider,
    provider_reference: request.providerReference,
    order_reference: request.orderReference,
    idempotency_key: request.idempotencyKey,
    amount: request.amount,
    currency: request.currency,
    description: request.description,
    customer_name: request.customerName,
    status: request.status,
    payment_link: request.paymentLink,
    checkout_token_hash: request.checkoutTokenHash,
    metadata: request.metadata,
    last_event_at: request.lastEventAt,
    created_at: request.createdAt,
    updated_at: request.updatedAt,
  };
}

export class SupabaseExternalPaymentRepository
  implements ExternalPaymentRepository
{
  async findBusinessName(clientId: string): Promise<string | null> {
    const { data, error } = await createServiceRoleClient()
      .from("client_accounts")
      .select("business_name")
      .eq("id", clientId)
      .maybeSingle();
    if (error) {
      throw new ExternalPaymentError(
        "PAYMENT_REPOSITORY_ERROR",
        "No se pudo cargar el negocio.",
        500
      );
    }
    const name = String(data?.business_name || "").trim();
    return name || null;
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

  async create(
    request: ExternalPaymentRequest
  ): Promise<{ request: ExternalPaymentRequest; created: boolean }> {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("external_payment_requests")
      .insert(toInsertRow(request))
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

  async applyEvent(
    event: ExternalPaymentWebhookEvent
  ): Promise<AppliedExternalPaymentEvent> {
    const { data, error } = await createServiceRoleClient().rpc(
      "apply_external_payment_event",
      {
        p_provider: event.provider,
        p_event_id: event.eventId,
        p_payment_request_id: event.paymentRequestId,
        p_provider_reference: event.providerReference,
        p_status: event.status,
        p_occurred_at: event.occurredAt,
        p_payload: event.payload,
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
      if (message.includes("EXTERNAL_PAYMENT_REFERENCE_MISMATCH")) {
        throw new ExternalPaymentError(
          "PROVIDER_REFERENCE_MISMATCH",
          "La referencia del proveedor no coincide.",
          409
        );
      }
      if (message.includes("EXTERNAL_PAYMENT_EVENT_CONFLICT")) {
        throw new ExternalPaymentError(
          "EVENT_CONFLICT",
          "El evento ya pertenece a otra solicitud.",
          409
        );
      }
      throw new ExternalPaymentError(
        "PAYMENT_REPOSITORY_ERROR",
        "No se pudo procesar el evento de pago.",
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
        "La respuesta del repositorio de pagos no es válida.",
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
