import { randomUUID } from "node:crypto";

import type { PaymentAdapterRegistry } from "./adapters";
import {
  assertSameIdempotentRequest,
  ExternalPaymentError,
  normalizeCreateExternalPayment,
  normalizeManualPaymentConfirmation,
  normalizeRegisterPaymentMethod,
  requiredUuid,
  toExternalPaymentPublicView,
  toPaymentMethodPublicView,
} from "./domain";
import type { ExternalPaymentRepository } from "./repository";
import type {
  ActivePaymentBusiness,
  BusinessPaymentMethod,
  CreateExternalPaymentCommand,
  ExternalPaymentPublicView,
  ExternalPaymentRequest,
  ManualPaymentConfirmationCommand,
  PaymentMethodPublicView,
  RegisterPaymentMethodCommand,
} from "./types";

export class ExternalPaymentOrchestrationService {
  constructor(
    private readonly repository: ExternalPaymentRepository,
    private readonly adapters: PaymentAdapterRegistry,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  async registerMethod(
    command: RegisterPaymentMethodCommand
  ): Promise<PaymentMethodPublicView> {
    const normalized = normalizeRegisterPaymentMethod(command);
    await this.requireActiveBusiness(normalized.clientId);
    const timestamp = this.now();
    const method: BusinessPaymentMethod = {
      id: randomUUID(),
      clientId: normalized.clientId,
      kind: normalized.kind,
      providerCode: normalized.providerCode,
      mode: normalized.mode,
      displayName: normalized.displayName,
      externalUrl: normalized.externalUrl,
      providerAccountReference: normalized.providerAccountReference,
      status: "active",
      createdBy: normalized.createdBy,
      deactivatedBy: null,
      deactivatedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return toPaymentMethodPublicView(
      await this.repository.createMethod(method)
    );
  }

  async listMethods(clientId: unknown): Promise<PaymentMethodPublicView[]> {
    const normalizedClientId = requiredUuid(clientId, "client_id");
    await this.requireActiveBusiness(normalizedClientId);
    return (await this.repository.listMethods(normalizedClientId)).map(
      toPaymentMethodPublicView
    );
  }

  async deactivateMethod(input: {
    clientId: unknown;
    methodId: unknown;
    actorUserId: unknown;
  }): Promise<{ method: PaymentMethodPublicView; changed: boolean }> {
    const clientId = requiredUuid(input.clientId, "client_id");
    const methodId = requiredUuid(input.methodId, "payment_method_id");
    const actorUserId = requiredUuid(input.actorUserId, "actor_user_id");
    await this.requireActiveBusiness(clientId);
    const result = await this.repository.deactivateMethod({
      clientId,
      methodId,
      actorUserId,
      now: this.now(),
    });
    return {
      method: toPaymentMethodPublicView(result.method),
      changed: result.changed,
    };
  }

  async create(
    command: CreateExternalPaymentCommand
  ): Promise<{
    payment: ExternalPaymentPublicView;
    reused: boolean;
  }> {
    const normalized = normalizeCreateExternalPayment(command);
    const business = await this.requireActiveBusiness(normalized.clientId);
    const method = await this.repository.findMethod(
      normalized.clientId,
      normalized.paymentMethodId
    );
    if (!method || method.status !== "active") {
      throw new ExternalPaymentError(
        "PAYMENT_METHOD_NOT_FOUND",
        "El método de pago activo no existe para este negocio.",
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
      };
    }

    const id = randomUUID();
    const prepared = this.adapters.resolve(method).prepare({
      method,
      requestId: id,
      publicBaseUrl: normalized.publicBaseUrl,
    });
    if (prepared.realCharge !== false) {
      throw new ExternalPaymentError(
        "REAL_CHARGES_DISABLED",
        "Los cobros reales están prohibidos en esta fase.",
        503
      );
    }

    const timestamp = this.now();
    const request: ExternalPaymentRequest = {
      id,
      clientId: normalized.clientId,
      paymentMethodId: method.id,
      createdBy: normalized.createdBy,
      businessName: business.businessName,
      pathType: prepared.pathType,
      provider: prepared.providerCode,
      providerMode: prepared.providerMode,
      providerReference: prepared.providerReference,
      orderReference: normalized.orderReference,
      idempotencyKey: normalized.idempotencyKey,
      amount: normalized.amount,
      currency: normalized.currency,
      description: normalized.description,
      customerName: normalized.customerName,
      status: "pending",
      confirmationMode: prepared.confirmationMode,
      realCharge: false,
      paymentLink: prepared.paymentLink,
      metadata: { orchestrator: true, real_charge: false },
      lastEventAt: null,
      confirmedBy: null,
      confirmedAt: null,
      confirmationNote: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const created = await this.repository.createRequest(request);
    if (!created.created) {
      assertSameIdempotentRequest(created.request, normalized);
    }
    return {
      payment: toExternalPaymentPublicView(created.request),
      reused: !created.created,
    };
  }

  async getForClient(
    id: unknown,
    clientId: unknown
  ): Promise<ExternalPaymentPublicView> {
    const normalizedId = requiredUuid(id, "payment_request_id");
    const normalizedClientId = requiredUuid(clientId, "client_id");
    await this.requireActiveBusiness(normalizedClientId);
    const request = await this.requireRequest(normalizedId);
    if (request.clientId !== normalizedClientId) {
      throw new ExternalPaymentError(
        "PAYMENT_NOT_FOUND",
        "La solicitud de pago no existe.",
        404
      );
    }
    return toExternalPaymentPublicView(request);
  }

  async getPayPhonePresentation(
    id: unknown,
    clientId: unknown
  ): Promise<ExternalPaymentPublicView> {
    const payment = await this.getForClient(id, clientId);
    if (
      payment.provider !== "payphone" ||
      (payment.providerMode !== "sandbox" &&
        payment.providerMode !== "presentation") ||
      payment.realCharge !== false
    ) {
      throw new ExternalPaymentError(
        "PAYMENT_NOT_FOUND",
        "La demostración de pago no existe.",
        404
      );
    }
    return payment;
  }

  async confirmManual(
    command: ManualPaymentConfirmationCommand
  ): Promise<{
    payment: ExternalPaymentPublicView;
    duplicate: boolean;
    transitionApplied: boolean;
  }> {
    const normalized = normalizeManualPaymentConfirmation(command);
    await this.requireActiveBusiness(normalized.clientId);
    const result = await this.repository.confirmManual(
      normalized,
      this.now()
    );
    return {
      payment: toExternalPaymentPublicView(result.request),
      duplicate: result.duplicate,
      transitionApplied: result.transitionApplied,
    };
  }

  private async requireActiveBusiness(
    clientId: string
  ): Promise<ActivePaymentBusiness> {
    const business = await this.repository.findActiveBusiness(clientId);
    if (!business) {
      throw new ExternalPaymentError(
        "PAYMENT_BUSINESS_INACTIVE",
        "El negocio no existe o no está activo.",
        403
      );
    }
    return business;
  }

  private async requireRequest(id: string): Promise<ExternalPaymentRequest> {
    const request = await this.repository.findById(id);
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
