export const UNIVERSAL_NEW_ORDER_MESSAGE = "nuevo pedido";

function normalizeResetText(value: string): string {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Full-session reset commands only. Product removals or phrases such as
 * “cancelar cita” are intentionally excluded so they cannot erase an order.
 */
export function isUniversalSessionResetMessage(message: string): boolean {
  const text = normalizeResetText(message);
  return /^(?:nuevo pedido|nueva orden|otro pedido|cancelar|cancelar pedido|cancela|cancela el pedido|empezar de nuevo|empecemos de nuevo|comenzar de nuevo|comencemos de nuevo|iniciar de nuevo|reiniciar|reiniciar pedido)$/.test(
    text
  );
}

export function universalMessageForFreshOrder(message: string): string {
  return isUniversalSessionResetMessage(message)
    ? UNIVERSAL_NEW_ORDER_MESSAGE
    : message;
}
