import { randomUUID } from "node:crypto";

import { ExternalPaymentError } from "./domain";
import type {
  ActivePaymentBusiness,
  BusinessPaymentMethod,
  ExternalPaymentRequest,
  ManualPaymentConfirmationResult,
  NormalizedManualPaymentConfirmationCommand,
  PaymentConfirmationAuditEntry,
} from "./types";

export interface ExternalPaymentRepository {
  findActiveBusiness(clientId: string): Promise<ActivePaymentBusiness | null>;
  createMethod(method: BusinessPaymentMethod): Promise<BusinessPaymentMethod>;
  listMethods(clientId: string): Promise<BusinessPaymentMethod[]>;
  findMethod(
    clientId: string,
    methodId: string
  ): Promise<BusinessPaymentMethod | null>;
  deactivateMethod(input: {
    clientId: string;
    methodId: string;
    actorUserId: string;
    now: string;
  }): Promise<{ method: BusinessPaymentMethod; changed: boolean }>;
  findById(id: string): Promise<ExternalPaymentRequest | null>;
  findByIdempotencyKey(
    clientId: string,
    idempotencyKey: string
  ): Promise<ExternalPaymentRequest | null>;
  createRequest(
    request: ExternalPaymentRequest
  ): Promise<{ request: ExternalPaymentRequest; created: boolean }>;
  confirmManual(
    command: NormalizedManualPaymentConfirmationCommand,
    now: string
  ): Promise<ManualPaymentConfirmationResult>;
}

type InMemoryBusiness = {
  businessName: string;
  status: "active" | "suspended" | "cancelled";
};

export class InMemoryExternalPaymentRepository
  implements ExternalPaymentRepository
{
  private readonly methods = new Map<string, BusinessPaymentMethod>();
  private readonly requests = new Map<string, ExternalPaymentRequest>();
  private readonly requestIdempotency = new Map<string, string>();
  private readonly confirmationAudit = new Map<
    string,
    PaymentConfirmationAuditEntry
  >();

  constructor(private readonly businesses: Record<string, InMemoryBusiness>) {}

  async findActiveBusiness(
    clientId: string
  ): Promise<ActivePaymentBusiness | null> {
    const business = this.businesses[clientId];
    if (!business || business.status !== "active") return null;
    return {
      id: clientId,
      businessName: business.businessName,
      status: "active",
    };
  }

  async createMethod(
    method: BusinessPaymentMethod
  ): Promise<BusinessPaymentMethod> {
    this.methods.set(method.id, method);
    return method;
  }

  async listMethods(clientId: string): Promise<BusinessPaymentMethod[]> {
    return [...this.methods.values()]
      .filter((method) => method.clientId === clientId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async findMethod(
    clientId: string,
    methodId: string
  ): Promise<BusinessPaymentMethod | null> {
    const method = this.methods.get(methodId);
    return method?.clientId === clientId ? method : null;
  }

  async deactivateMethod(input: {
    clientId: string;
    methodId: string;
    actorUserId: string;
    now: string;
  }): Promise<{ method: BusinessPaymentMethod; changed: boolean }> {
    const method = await this.findMethod(input.clientId, input.methodId);
    if (!method) {
      throw new ExternalPaymentError(
        "PAYMENT_METHOD_NOT_FOUND",
        "El método de pago no existe.",
        404
      );
    }
    if (method.status === "inactive") {
      return { method, changed: false };
    }
    const updated: BusinessPaymentMethod = {
      ...method,
      status: "inactive",
      deactivatedBy: input.actorUserId,
      deactivatedAt: input.now,
      updatedAt: input.now,
    };
    this.methods.set(updated.id, updated);
    return { method: updated, changed: true };
  }

  async findById(id: string): Promise<ExternalPaymentRequest | null> {
    return this.requests.get(id) || null;
  }

  async findByIdempotencyKey(
    clientId: string,
    idempotencyKey: string
  ): Promise<ExternalPaymentRequest | null> {
    const id = this.requestIdempotency.get(
      `${clientId}:${idempotencyKey}`
    );
    return id ? this.requests.get(id) || null : null;
  }

  async createRequest(
    request: ExternalPaymentRequest
  ): Promise<{ request: ExternalPaymentRequest; created: boolean }> {
    const key = `${request.clientId}:${request.idempotencyKey}`;
    const existingId = this.requestIdempotency.get(key);
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
    this.requestIdempotency.set(key, request.id);
    return { request, created: true };
  }

  async confirmManual(
    command: NormalizedManualPaymentConfirmationCommand,
    now: string
  ): Promise<ManualPaymentConfirmationResult> {
    const request = this.requests.get(command.paymentRequestId);
    if (!request || request.clientId !== command.clientId) {
      throw new ExternalPaymentError(
        "PAYMENT_NOT_FOUND",
        "La solicitud de pago no existe.",
        404
      );
    }
    if (request.confirmationMode !== "manual") {
      throw new ExternalPaymentError(
        "PAYMENT_NOT_MANUAL",
        "Esta solicitud no admite confirmación manual.",
        409
      );
    }

    const auditKey = `${request.id}:${command.idempotencyKey}`;
    const existingAudit = this.confirmationAudit.get(auditKey);
    if (existingAudit) {
      if (existingAudit.newStatus !== command.status) {
        throw new ExternalPaymentError(
          "IDEMPOTENCY_CONFLICT",
          "La clave de idempotencia ya pertenece a otra confirmación.",
          409
        );
      }
      return {
        request,
        duplicate: true,
        transitionApplied: false,
      };
    }

    if (request.status !== "pending") {
      throw new ExternalPaymentError(
        "PAYMENT_TERMINAL",
        "El pago ya tiene un estado terminal.",
        409
      );
    }

    const updated: ExternalPaymentRequest = {
      ...request,
      status: command.status,
      confirmedBy: command.actorUserId,
      confirmedAt: now,
      confirmationNote: command.note,
      lastEventAt: now,
      updatedAt: now,
    };
    const audit: PaymentConfirmationAuditEntry = {
      id: randomUUID(),
      paymentRequestId: request.id,
      clientId: request.clientId,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actorUserId,
      actorRole: command.actorRole,
      previousStatus: request.status,
      newStatus: command.status,
      note: command.note,
      createdAt: now,
    };
    this.requests.set(updated.id, updated);
    this.confirmationAudit.set(auditKey, audit);
    return {
      request: updated,
      duplicate: false,
      transitionApplied: true,
    };
  }

  getConfirmationAudit(): PaymentConfirmationAuditEntry[] {
    return [...this.confirmationAudit.values()];
  }
}
