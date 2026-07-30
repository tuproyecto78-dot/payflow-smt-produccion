import type { BusinessPaymentProvider } from "./business-context-contract";

export type SimulatorPaymentContext = {
  clientId: string;
  businessName: string;
  paymentProvider: BusinessPaymentProvider;
};

const EXPLICIT_PAYMENT_METHOD_TERMS = [
  "transferencia",
  "transferencias",
  "tarjeta",
  "tarjetas",
  "efectivo",
  "deposito",
  "depositos",
  "forma de pago",
  "formas de pago",
  "tipo de pago",
  "tipos de pago",
  "metodo de pago",
  "metodos de pago",
  "pago en linea",
  "pagos en linea",
  "link de pago",
  "enlace de pago",
  "puedo pagar con",
  "aceptan tarjeta",
  "aceptan transferencia",
  "aceptan efectivo",
];

const GENERIC_PAYMENT_MESSAGES = new Set([
  "pago",
  "pagos",
  "como pago",
  "como puedo pagar",
  "como se paga",
  "quiero pagar",
]);

const CART_TOTAL_TERMS = [
  "cuanto pago",
  "cuanto debo",
  "cuanto es",
  "cuanto seria",
  "total del pedido",
  "suma del pedido",
];

export function normalizePaymentIntentText(value: string): string {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isPaymentMethodMessage(message: string): boolean {
  const text = normalizePaymentIntentText(message);
  if (!text) return false;

  // An explicit payment method always wins, even when the message also names a product.
  if (EXPLICIT_PAYMENT_METHOD_TERMS.some((term) => text.includes(term))) {
    return true;
  }

  // “¿Cuánto pago?” belongs to the temporary cart, not to payment-method help.
  if (CART_TOTAL_TERMS.some((term) => text.includes(term))) {
    return false;
  }

  return GENERIC_PAYMENT_MESSAGES.has(text);
}

export function formatPaymentMethodAnswer(context: SimulatorPaymentContext): string {
  if (context.paymentProvider === "payphone") {
    return "Tenemos pago en línea configurado. Al confirmar tu pedido te indicamos cómo pagar.";
  }

  if (context.paymentProvider === "external") {
    return "Tenemos un método de pago externo configurado. Al confirmar tu pedido te compartimos las instrucciones.";
  }

  return "Por ahora no tenemos formas de pago registradas. Podemos confirmar el método antes de finalizar.";
}
