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
import {
  configuredPaymentMethods,
} from "./universal-order-parser";
import { normalizeUniversalText } from "./universal-knowledge-engine";
import type { UniversalSessionState } from "./universal-session-memory";

const PAYMENT_UNAVAILABLE =
  "Por el momento no contamos con formas de pago habilitadas.";

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

function cartSummary(
  state: UniversalSessionState,
  context: UniversalBusinessContext
): string {
  const cart = getUniversalCartSnapshot(state, context);
  if (!cart.items.length) return "";
  return cart.items
    .map(
      (item) =>
        `• ${item.quantity} × ${item.name} — ${money(
          item.subtotal,
          item.currency
        )}`
    )
    .join("\n");
}

function paymentAvailability(
  context: UniversalBusinessContext,
  inviteSelection = false
): string {
  const methods = configuredPaymentMethods(context.payment);
  const summary = context.payment.summary.trim();
  const unavailableSummary =
    !summary ||
    /\b(?:no hay|no tenemos|no contamos|sin forma|sin metodo|no esta configurad|no se ha configurad)\b/.test(
      normalizeUniversalText(summary)
    );
  if (
    context.payment.provider === "none" ||
    context.payment.provider === "unknown" ||
    (!methods.length && unavailableSummary)
  ) {
    return PAYMENT_UNAVAILABLE;
  }
  const paymentText = methods.length
    ? `Puedes pagar por ${methods.join(" o ")}.`
    : summary;
  return inviteSelection ? `${paymentText} ¿Cuál prefieres?` : paymentText;
}

function paymentInvitation(context: UniversalBusinessContext): string {
  const availability = paymentAvailability(context);
  return availability === PAYMENT_UNAVAILABLE
    ? availability
    : availability.replace(/^Puedes pagar por /, "Opciones: ");
}

function featuredBusinessKnowledge(
  context: UniversalBusinessContext
): string | null {
  const featured = context.knowledge.find((entry) =>
    /\b(?:plato del dia|especialidad|recomendad|destacad|favorit)\b/.test(
      normalizeUniversalText(
        `${entry.title} ${entry.category} ${entry.content}`
      )
    )
  );
  return featured?.content.trim() || null;
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
      intent === "recommendation"
        ? "Te recomendamos:"
        : intent === "clarification" && input.candidate.orderItems.length
          ? "Para completar tu pedido, elige una opción:"
          : "Claro, estas son las opciones:";
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
    if (available.length) {
      answer = `Promociones vigentes:\n${available
        .map((promotion) => `• ${promotion}`)
        .join("\n")}\n¿Cuál te interesa?`;
    } else {
      const featured = featuredBusinessKnowledge(input.context);
      const suggestion = chosen[0];
      answer = featured
        ? `Hoy no hay promociones activas. ${featured} ¿Te interesa?`
        : suggestion
          ? `Hoy no hay promociones activas. Te sugerimos ${offeringLine(
              suggestion
            ).replace(/^•\s*/, "")}. ¿Deseas agregarlo?`
          : "Hoy no hay promociones activas. ¿Deseas ver nuestras opciones?";
    }
  } else if (intent === "query_payment") {
    const choosing =
      input.state.cart.length > 0 &&
      input.state.sessionMemory.checkoutStage === "awaiting_payment";
    answer = paymentAvailability(input.context, choosing);
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
    const summary = cartSummary(input.state, input.context);
    const totals = cartTotals(input.state, input.context);
    const payment = paymentInvitation(input.context);
    const paymentUnavailable = payment === PAYMENT_UNAVAILABLE;
    const nextStep = paymentUnavailable
      ? input.candidate.checkoutRequested
        ? payment
        : `${payment} ¿Deseas agregar algo más?`
      : `${
          input.candidate.checkoutRequested
            ? "¿Cómo deseas pagar?"
            : "¿Deseas agregar algo más o cómo prefieres pagar?"
        } ${payment}`;
    answer = summary
      ? `Perfecto, tu pedido hasta ahora:\n${summary}\nTotal: ${
          totals || "por calcular"
        }.\n${nextStep}`
      : "No pudimos validar esa opción. ¿Cuál deseas agregar?";
  } else if (intent === "cart_total") {
    const cart = getUniversalCartSnapshot(input.state, input.context);
    answer = cart.unitCount
      ? `Tu pedido:\n${cartSummary(input.state, input.context)}\nTotal: ${cartTotals(
          input.state,
          input.context
        )}.`
      : "Tu pedido está vacío.";
  } else if (intent === "cart_total_with_payment") {
    const cart = getUniversalCartSnapshot(input.state, input.context);
    const payment = paymentAvailability(input.context);
    answer = cart.unitCount
      ? `Tu pedido:\n${cartSummary(input.state, input.context)}\nTotal: ${cartTotals(
          input.state,
          input.context
        )}.\n${payment}`
      : `Tu pedido está vacío.\n${payment}`;
  } else if (intent === "finish_order_selection") {
    const cart = getUniversalCartSnapshot(input.state, input.context);
    answer = cart.unitCount
      ? "Perfecto, tu pedido queda como está. ¿Deseas finalizar o ver el total?"
      : "Entendido, no agregaré productos. ¿Deseas finalizar?";
  } else if (intent === "select_payment_method") {
    const summary = cartSummary(input.state, input.context);
    answer = `Perfecto, elegiste ${
      input.candidate.paymentMethod || "la forma de pago indicada"
    }.\n${summary}\nTotal: ${
      cartTotals(input.state, input.context) || "por calcular"
    }.\n¿Confirmas el resumen?`;
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
