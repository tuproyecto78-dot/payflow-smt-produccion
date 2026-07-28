export const EMPTY_CART_TOTAL_ANSWER = "Tu pedido está vacío por ahora.";

const EMPTY_CART_TOTAL_REQUESTS = new Set([
  "total",
  "mi total",
  "cuanto es",
  "resumen",
]);

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeEmptyCartTotalText(value: string): string {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isEmptyCartTotalRequest(message: string): boolean {
  return EMPTY_CART_TOTAL_REQUESTS.has(normalizeEmptyCartTotalText(message));
}

export function parseSimulatorState(raw: string | undefined): {
  parsed: boolean;
  state: Record<string, unknown>;
} {
  if (!raw) return { parsed: true, state: {} };
  try {
    return { parsed: true, state: safeRecord(JSON.parse(raw)) };
  } catch {
    return { parsed: false, state: {} };
  }
}

export function simulatorCartIsEmpty(state: unknown): boolean {
  const value = safeRecord(state);
  return !Array.isArray(value.cart) || value.cart.length === 0;
}

export function buildEmptyCartTotalState(input: {
  state: unknown;
  customerMessage: string;
}): Record<string, unknown> {
  const current = safeRecord(input.state);
  const rawTurns = Array.isArray(current.recentTurns)
    ? current.recentTurns.slice(-6)
    : [];
  const turns = [
    ...rawTurns,
    { role: "customer", text: input.customerMessage.slice(0, 500) },
    { role: "business", text: EMPTY_CART_TOTAL_ANSWER },
  ].slice(-8);

  const memory = safeRecord(current.sessionMemory);
  const rawCounts = safeRecord(memory.intentCounts);
  const previousCount = Number(rawCounts.cart_total);
  const intentCounts = {
    ...rawCounts,
    cart_total:
      Number.isFinite(previousCount) && previousCount > 0
        ? Math.min(100000, Math.trunc(previousCount) + 1)
        : 1,
  };

  return {
    ...current,
    version: 2,
    cart: [],
    recentTurns: turns,
    lastIntent: "cart_total",
    pendingQuestion: null,
    ...(Object.keys(memory).length
      ? {
          sessionMemory: {
            ...memory,
            intentCounts,
          },
        }
      : {}),
  };
}
