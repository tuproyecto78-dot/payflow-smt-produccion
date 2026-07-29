import { ExternalPaymentError, requiredUuid } from "./domain";

export type PaymentPermission = "view" | "create" | "manage" | "confirm";

export interface PaymentAccessSession {
  userId: string;
  role: string;
  clientId: string | null;
}

export function assertPaymentClientAccess(input: {
  session: PaymentAccessSession;
  requestedClientId: unknown;
  permission: PaymentPermission;
}): string {
  const clientId = requiredUuid(input.requestedClientId, "client_id");
  const role = input.session.role;

  if (role === "super_admin" || role === "admin") {
    return clientId;
  }

  if (input.session.clientId !== clientId) {
    throw new ExternalPaymentError(
      "PAYMENT_CLIENT_FORBIDDEN",
      "No tienes acceso a este negocio.",
      403
    );
  }

  if (role === "client_owner") return clientId;
  if (
    role === "client_operator" &&
    (input.permission === "view" || input.permission === "create")
  ) {
    return clientId;
  }

  throw new ExternalPaymentError(
    "PAYMENT_PERMISSION_FORBIDDEN",
    "No tienes permisos para esta operación de pagos.",
    403
  );
}
