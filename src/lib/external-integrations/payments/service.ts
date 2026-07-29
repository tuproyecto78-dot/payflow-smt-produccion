import { randomUUID } from "node:crypto";

import {
  assertSameIdempotentRequest,
  ExternalPaymentError,
  normalizeCreateExternalPayment,
  normalizeWebhookEvent,
  toExternalPaymentPublicView,
} from "./domain";
import type { ExternalPaymentRepository } from "./repository";
import {
  createSandboxCheckout,
  verifySandboxCheckoutToken,
} from "./sandbox-provider";
import type {
  AppliedExternalPaymentEvent,
  CreateExternalPaymentCommand,
  ExternalPaymentPublicView,
  ExternalPaymentRequest,
} from "./types";

export class ExternalPaymentSandboxService {
  constructor(private readonly repository: ExternalPaymentRepository) {}

  async create(
    command: CreateExternalPaymentCommand
  ): Promise<{
    payment: ExternalPaymentPublicView;
    reused: boolean;
    sandboxProviderReference: string;
  }> {
    const normalized = normalizeCreateExternalPayment(command);
    const businessName = await this.repository.findBusinessName(
      normalized.clientId
    );
    if (!businessName) {
      throw new ExternalPaymentError(
        "BUSINESS_NOT_FOUND",
        "No se encontró el negocio asociado.",
        404
      );
    }

    const existing = await this.repository.findByIdempotencyKey(
      normalized.clientId,
      normalized.idempotencyKey
    );
    if (existing) {
      assertSameIdempotentRequest(existing, normalized);
      return {
        payment: toExternalPaymentPublicView(existing),
        reused: true,
        sandboxProviderReference: existing.providerReference,
      };
    }

    const id = randomUUID();
    const checkout = createSandboxCheckout({
      requestId: id,
      publicBaseUrl: normalized.publicBaseUrl,
    });
    const now = new Date().toISOString();
    const request: ExternalPaymentRequest = {
      id,
      clientId: normalized.clientId,
      createdBy: normalized.createdBy,
      businessName,
      provider: "sandbox",
      providerReference: checkout.providerReference,
      orderReference: normalized.orderReference,
      idempotencyKey: normalized.idempotencyKey,
      amount: normalized.amount,
      currency: normalized.currency,
      description: normalized.description,
      customerName: normalized.customerName,
      status: "pending",
      paymentLink: checkout.paymentLink,
      checkoutTokenHash: checkout.checkoutTokenHash,
      metadata: { sandbox: true, realCharge: false },
      lastEventAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const created = await this.repository.create(request);
    if (!created.created) {
      assertSameIdempotentRequest(created.request, normalized);
    }
    return {
      payment: toExternalPaymentPublicView(created.request),
      reused: !created.created,
      sandboxProviderReference: created.request.providerReference,
    };
  }

  async getForClient(
    id: string,
    clientId: string
  ): Promise<ExternalPaymentPublicView> {
    const request = await this.requireRequest(id);
    if (request.clientId !== clientId) {
      throw new ExternalPaymentError(
        "PAYMENT_NOT_FOUND",
        "La solicitud de pago no existe.",
        404
      );
    }
    return toExternalPaymentPublicView(request);
  }

  async getCheckout(
    id: string,
    token: string
  ): Promise<ExternalPaymentPublicView> {
    const request = await this.requireRequest(id);
    if (!verifySandboxCheckoutToken(token, request.checkoutTokenHash)) {
      throw new ExternalPaymentError(
        "INVALID_CHECKOUT_TOKEN",
        "El enlace de pago de prueba no es válido.",
        401
      );
    }
    return toExternalPaymentPublicView(request);
  }

  async applyWebhook(
    payload: unknown
  ): Promise<
    AppliedExternalPaymentEvent & { payment: ExternalPaymentPublicView }
  > {
    const event = normalizeWebhookEvent(payload);
    const result = await this.repository.applyEvent(event);
    return {
      ...result,
      payment: toExternalPaymentPublicView(result.request),
    };
  }

  private async requireRequest(id: string): Promise<ExternalPaymentRequest> {
    const normalizedId = String(id || "").trim();
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        normalizedId
      )
    ) {
      throw new ExternalPaymentError(
        "PAYMENT_NOT_FOUND",
        "La solicitud de pago no existe.",
        404
      );
    }
    const request = await this.repository.findById(normalizedId);
    if (!request) {
      throw new ExternalPaymentError(
        "PAYMENT_NOT_FOUND",
        "La solicitud de pago no existe.",
        404
      );
    }
    return request;
  }
}
