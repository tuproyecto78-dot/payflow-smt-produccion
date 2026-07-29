import {
  ExternalPaymentError,
  isExternalPaymentTransitionAllowed,
} from "./domain";
import type {
  AppliedExternalPaymentEvent,
  ExternalPaymentRequest,
  ExternalPaymentWebhookEvent,
} from "./types";

export interface ExternalPaymentRepository {
  findBusinessName(clientId: string): Promise<string | null>;
  findById(id: string): Promise<ExternalPaymentRequest | null>;
  findByIdempotencyKey(
    clientId: string,
    idempotencyKey: string
  ): Promise<ExternalPaymentRequest | null>;
  create(
    request: ExternalPaymentRequest
  ): Promise<{ request: ExternalPaymentRequest; created: boolean }>;
  applyEvent(
    event: ExternalPaymentWebhookEvent
  ): Promise<AppliedExternalPaymentEvent>;
}

export class InMemoryExternalPaymentRepository
  implements ExternalPaymentRepository
{
  private readonly requests = new Map<string, ExternalPaymentRequest>();
  private readonly idempotency = new Map<string, string>();
  private readonly eventIds = new Map<string, string>();

  constructor(
    private readonly businessNames: Record<string, string> = {
      "client-test": "Negocio de prueba",
    }
  ) {}

  async findBusinessName(clientId: string): Promise<string | null> {
    return this.businessNames[clientId] || null;
  }

  async findById(id: string): Promise<ExternalPaymentRequest | null> {
    return this.requests.get(id) || null;
  }

  async findByIdempotencyKey(
    clientId: string,
    idempotencyKey: string
  ): Promise<ExternalPaymentRequest | null> {
    const id = this.idempotency.get(`${clientId}:${idempotencyKey}`);
    return id ? this.requests.get(id) || null : null;
  }

  async create(
    request: ExternalPaymentRequest
  ): Promise<{ request: ExternalPaymentRequest; created: boolean }> {
    const key = `${request.clientId}:${request.idempotencyKey}`;
    const existingId = this.idempotency.get(key);
    if (existingId) {
      const existing = this.requests.get(existingId);
      if (!existing) {
        throw new ExternalPaymentError(
          "REPOSITORY_INCONSISTENT",
          "No se pudo recuperar la solicitud existente.",
          500
        );
      }
      return { request: existing, created: false };
    }
    this.requests.set(request.id, request);
    this.idempotency.set(key, request.id);
    return { request, created: true };
  }

  async applyEvent(
    event: ExternalPaymentWebhookEvent
  ): Promise<AppliedExternalPaymentEvent> {
    const eventKey = `${event.provider}:${event.eventId}`;
    const existingEventRequestId = this.eventIds.get(eventKey);
    const current = this.requests.get(event.paymentRequestId);
    if (!current) {
      throw new ExternalPaymentError(
        "PAYMENT_NOT_FOUND",
        "La solicitud de pago no existe.",
        404
      );
    }
    if (
      existingEventRequestId &&
      existingEventRequestId !== event.paymentRequestId
    ) {
      throw new ExternalPaymentError(
        "EVENT_CONFLICT",
        "El evento ya pertenece a otra solicitud.",
        409
      );
    }
    if (existingEventRequestId) {
      return {
        request: current,
        duplicate: true,
        transitionApplied: false,
      };
    }
    if (current.providerReference !== event.providerReference) {
      throw new ExternalPaymentError(
        "PROVIDER_REFERENCE_MISMATCH",
        "La referencia del proveedor no coincide.",
        409
      );
    }

    this.eventIds.set(eventKey, event.paymentRequestId);
    const transitionApplied =
      current.status !== event.status &&
      isExternalPaymentTransitionAllowed(current.status, event.status);
    const now = event.occurredAt;
    const updated: ExternalPaymentRequest = {
      ...current,
      status: transitionApplied ? event.status : current.status,
      lastEventAt: now,
      updatedAt: now,
      metadata: {
        ...current.metadata,
        lastSandboxEventId: event.eventId,
      },
    };
    this.requests.set(updated.id, updated);
    return { request: updated, duplicate: false, transitionApplied };
  }
}
