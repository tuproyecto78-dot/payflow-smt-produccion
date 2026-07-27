import {
  getUniversalCartSnapshot,
  sanitizeUniversalAnswer,
  type UniversalBusinessContext,
  type UniversalOffering,
  type UniversalPlannerDecision,
} from "./universal-agent-contract";
import type {
  UniversalIntentCandidate,
  UniversalKnowledgeRetrieval,
} from "./universal-conversation-contract";
import type { UniversalSessionState } from "./universal-session-memory";

function money(value: number, currency: string): string {
  return `${value.toFixed(2)} ${currency}`;
}

function selectedOfferings(
  decision: UniversalPlannerDecision,
  context: UniversalBusinessContext
): UniversalOffering[] {
  const byKey = new Map(
    context.offerings.map((offering) => [offering.key, offering])
  );
  return decision.selection.offeringKeys
    .map((key) => byKey.get(key))
    .filter((offering): offering is UniversalOffering => Boolean(offering))
    .slice(0, decision.selection.mode === "complete" ? 100 : 5);
}

function offeringLine(offering: UniversalOffering, index?: number): string {
  const prefix = typeof index === "number" ? `${index + 1}.` : "•";
  const price =
    offering.price !== null && offering.price > 0
      ? ` — ${money(offering.price, offering.currency)}`
      : "";
  return `${prefix} ${offering.name}${price}`;
}

function relevantKnowledgeAnswers(
  retrieval: UniversalKnowledgeRetrieval,
  kinds: string[]
): string[] {
  return Array.from(
    new Set(
      retrieval.matches
        .filter((match) => kinds.includes(match.item.kind))
        .map((match) => match.item.content.trim())
        .filter(Boolean)
    )
  ).slice(0, 3);
}

function cartTotals(
  state: UniversalSessionState,
  context: UniversalBusinessContext
): string {
  const cart = getUniversalCartSnapshot(state, context);
  return Object.entries(cart.totals)
    .map(([currency, total]) => money(total, currency))
    .join(" + ");
}

export function composeUniversalCommercialAnswer(input: {
  message: string;
  candidate: UniversalIntentCandidate;
  decision: UniversalPlannerDecision;
  context: UniversalBusinessContext;
  state: UniversalSessionState;
  retrieval: UniversalKnowledgeRetrieval;
}): string {
  const chosen = selectedOfferings(input.decision, input.context);
  const intent = input.decision.intent;
  let answer = "";

  if (intent === "greeting") {
    answer = `¡Hola! Somos ${input.context.businessName}. ¿En qué podemos ayudarte?`;
  } else if (
    intent === "discover_offerings" ||
    intent === "recommendation" ||
    (intent === "clarification" && chosen.length > 1)
  ) {
    const title =
      intent === "recommendation" ? "Te recomendamos:" : "Estas son las opciones:";
    const purchaseFlow = input.decision.scopes.includes("cart");
    const closing = purchaseFlow
      ? input.decision.clarificationQuestion ||
        "Indica el número de la opción que deseas."
      : "Indica un número para conocer los detalles.";
    answer = chosen.length
      ? `${title}\n${chosen
          .map((offering, index) => offeringLine(offering, index))
          .join("\n")}\n${closing}`
      : "Por ahora no hay opciones disponibles registradas. ¿Qué estás buscando?";
  } else if (intent === "query_offering") {
    const offering = chosen[0];
    if (!offering) {
      answer = "No encontramos esa opción registrada. ¿Cuál deseas consultar?";
    } else {
      const detail = offering.description
        ? ` ${offering.description}.`
        : "";
      answer = `${offeringLine(offering)}.${detail} ¿Qué más deseas saber?`;
    }
  } else if (intent === "query_promotion") {
    const promotions = relevantKnowledgeAnswers(input.retrieval, [
      "promotion",
      "faq",
      "document",
    ]);
    const available = promotions.length
      ? promotions
      : input.context.promotions.slice(0, 3);
    answer = available.length
      ? `Promociones vigentes:\n${available
          .map((promotion) => `• ${promotion}`)
          .join("\n")}\n¿Cuál te interesa?`
      : "Hoy no tenemos promociones registradas. ¿Deseas ver las opciones disponibles?";
  } else if (intent === "query_payment") {
    const paymentAnswers = relevantKnowledgeAnswers(input.retrieval, [
      "payment",
      "faq",
      "document",
    ]);
    if (paymentAnswers.length) {
      answer = `${paymentAnswers.slice(0, 2).join(" ")} ¿Deseas consultar algo más?`;
    } else if (
      input.context.payment.provider === "none" ||
      input.context.payment.provider === "unknown"
    ) {
      answer = "Por ahora no tenemos formas de pago registradas. Podemos confirmarlo antes de finalizar.";
    } else {
      answer = `${input.context.payment.summary} ¿Deseas consultar algo más?`;
    }
  } else if (intent === "query_hours") {
    const hours = relevantKnowledgeAnswers(input.retrieval, [
      "hours",
      "faq",
      "document",
    ]);
    const available = hours.length ? hours : input.context.hours.slice(0, 4);
    answer = available.length
      ? `Horario: ${available.join(" · ")} ¿Qué día te interesa?`
      : "No tenemos un horario registrado. Podemos solicitar su confirmación.";
  } else if (intent === "query_location") {
    const locations = relevantKnowledgeAnswers(input.retrieval, [
      "address",
      "faq",
      "document",
    ]);
    const available = locations.length
      ? locations
      : [input.context.address].filter(Boolean);
    answer = available.length
      ? `Estamos en ${available.slice(0, 2).join(" ")} ¿Deseas indicaciones adicionales?`
      : "No tenemos una dirección registrada. Podemos solicitar su confirmación.";
  } else if (intent === "query_policy") {
    const policies = relevantKnowledgeAnswers(input.retrieval, [
      "policy",
      "faq",
      "document",
    ]);
    const available = policies.length
      ? policies
      : input.context.policies.slice(0, 3);
    answer = available.length
      ? `${available.join(" ")} ¿Qué caso deseas consultar?`
      : "No tenemos esa política registrada. Podemos solicitar su confirmación.";
  } else if (intent === "query_appointment") {
    const appointmentKnowledge = relevantKnowledgeAnswers(input.retrieval, [
      "faq",
      "document",
      "hours",
    ]);
    const available = [
      ...input.context.appointmentConditions,
      ...appointmentKnowledge,
    ].filter(Boolean);
    answer = available.length
      ? `${Array.from(new Set(available)).slice(0, 3).join(" ")} ¿Qué día te interesa?`
      : "Podemos revisar una cita, pero aún no hay condiciones de agenda registradas. ¿Qué día te interesa?";
  } else if (intent === "add_to_cart") {
    const action = input.decision.cartActions.find(
      (item) => item.type === "add" || item.type === "set"
    );
    const offering = action?.offeringKey
      ? input.context.offerings.find((item) => item.key === action.offeringKey)
      : null;
    const quantity = action?.quantity || 0;
    const subtotal =
      offering?.price && quantity
        ? money(offering.price * quantity, offering.currency)
        : "por calcular";
    answer = offering
      ? `Agregamos ${quantity} × ${offering.name}. Subtotal: ${subtotal}. Total temporal: ${
          cartTotals(input.state, input.context) || "por calcular"
        }. ¿Deseas algo más?`
      : "No pudimos validar esa opción. ¿Cuál deseas agregar?";
  } else if (intent === "cart_total") {
    const cart = getUniversalCartSnapshot(input.state, input.context);
    answer = cart.unitCount
      ? `Tu total temporal es ${cartTotals(input.state, input.context)}. ¿Deseas algo más?`
      : "Tu pedido temporal está vacío. ¿Qué deseas agregar?";
  } else if (intent === "reset_cart") {
    answer = "Listo, iniciamos un pedido nuevo. ¿Qué deseas agregar?";
  } else if (intent === "clarification") {
    answer =
      input.decision.clarificationQuestion ||
      "¿Puedes darme un poco más de detalle?";
  } else {
    const knowledge = relevantKnowledgeAnswers(input.retrieval, [
      "faq",
      "document",
      "policy",
      "rule",
    ]);
    answer = knowledge.length
      ? `${knowledge.slice(0, 2).join(" ")} ¿Deseas consultar algo más?`
      : input.decision.clarificationQuestion ||
        "¿Qué producto, servicio o información necesitas?";
  }

  return sanitizeUniversalAnswer(answer, input.context.businessName);
}

export function mayUseControlledModelResponse(
  decision: UniversalPlannerDecision
): boolean {
  return ["general_inquiry"].includes(decision.intent);
}
