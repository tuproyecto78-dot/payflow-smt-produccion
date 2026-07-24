import {
  getUniversalCartSnapshot,
  sanitizeUniversalAnswer,
  type UniversalAgentState,
  type UniversalBusinessContext,
  type UniversalOffering,
  type UniversalPlannerDecision,
} from "./universal-agent-contract";

export type CanonicalUniversalIntent =
  | "greeting"
  | "discover_offerings"
  | "query_offering"
  | "query_promotion"
  | "query_payment"
  | "add_to_cart"
  | "cart_total"
  | "reset_cart"
  | "recommendation"
  | "query_hours"
  | "query_policy"
  | "query_appointment"
  | "clarification"
  | "general_inquiry";

type ScoredOffering = { offering: UniversalOffering; score: number };

const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  veinte: 20,
};

const STOP_WORDS = new Set([
  "a",
  "al",
  "algo",
  "con",
  "cual",
  "cuales",
  "cuanto",
  "cuantos",
  "de",
  "del",
  "el",
  "en",
  "es",
  "esta",
  "estas",
  "este",
  "estos",
  "hay",
  "la",
  "las",
  "lo",
  "los",
  "me",
  "para",
  "por",
  "que",
  "quiero",
  "quisiera",
  "tiene",
  "tienen",
  "un",
  "una",
  "unas",
  "unos",
  "venden",
  "ofrecen",
  "dame",
  "deme",
  "agrega",
  "anade",
  "ponme",
  "necesito",
  "pedido",
  "producto",
  "productos",
  "servicio",
  "servicios",
]);

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(value: string): string {
  let token = normalize(value);
  if (token.length > 5 && token.endsWith("es")) token = token.slice(0, -2);
  else if (token.length > 3 && token.endsWith("s")) token = token.slice(0, -1);
  return token;
}

function tokens(value: string): string[] {
  return normalize(value)
    .split(" ")
    .map(stem)
    .filter(Boolean);
}

function meaningfulTokens(value: string): string[] {
  return tokens(value).filter(
    (token) => !STOP_WORDS.has(token) && !NUMBER_WORDS[token] && !/^\d+$/.test(token)
  );
}

function includesAny(text: string, values: string[]): boolean {
  return values.some((value) => text.includes(value));
}

function quantityFrom(message: string): number | null {
  const text = normalize(message);
  const digit = text.match(/\b(\d{1,2})\b/);
  if (digit) {
    const quantity = Number(digit[1]);
    if (Number.isInteger(quantity) && quantity >= 1 && quantity <= 99) return quantity;
  }
  for (const token of text.split(" ")) {
    if (NUMBER_WORDS[token]) return NUMBER_WORDS[token];
  }
  return null;
}

function visibleOfferings(context: UniversalBusinessContext): UniversalOffering[] {
  return context.offerings.filter((offering) => offering.available && Boolean(offering.name));
}

function scoreOffering(offering: UniversalOffering, message: string): number {
  const query = meaningfulTokens(message);
  if (!query.length) return 0;
  const name = tokens(offering.name);
  const category = tokens(offering.category || "");
  const description = tokens(offering.description || "");
  const nameSet = new Set(name);
  const categorySet = new Set(category);
  const descriptionSet = new Set(description);
  const normalizedMessage = normalize(message);
  const normalizedName = normalize(offering.name);
  let score = 0;

  if (normalizedMessage === normalizedName) score += 130;
  if (normalizedMessage.includes(normalizedName) || normalizedName.includes(normalizedMessage)) {
    score += 70;
  }

  let matched = 0;
  for (const token of query) {
    if (nameSet.has(token)) {
      score += 30;
      matched += 1;
    } else if (categorySet.has(token)) {
      score += 18;
      matched += 1;
    } else if (descriptionSet.has(token)) {
      score += 8;
      matched += 1;
    }
  }
  if (matched === query.length) score += 30;
  return score;
}

export function findUniversalOfferingMatches(
  message: string,
  context: UniversalBusinessContext
): ScoredOffering[] {
  return visibleOfferings(context)
    .map((offering) => ({ offering, score: scoreOffering(offering, message) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.offering.name.localeCompare(right.offering.name, "es")
    );
}

function uniqueOffering(matches: ScoredOffering[]): UniversalOffering | null {
  if (!matches.length) return null;
  if (matches.length === 1) return matches[0].offering;
  return matches[0].score >= 100 || matches[0].score - matches[1].score >= 24
    ? matches[0].offering
    : null;
}

function decision(input: Partial<UniversalPlannerDecision> & {
  intent: CanonicalUniversalIntent;
}): UniversalPlannerDecision {
  return {
    intent: input.intent,
    confidence: input.confidence ?? 0.9,
    scopes: input.scopes || ["identity"],
    selection: input.selection || { mode: "none", offeringKeys: [], maxItems: 5 },
    cartActions: input.cartActions || [],
    needsClarification: input.needsClarification === true,
    clarificationQuestion: input.clarificationQuestion || "",
    responseGoal: input.responseGoal || "Responder de forma breve y comercial.",
  };
}

export function classifyUniversalIntent(input: {
  message: string;
  context: UniversalBusinessContext;
  state: UniversalAgentState;
}): UniversalPlannerDecision {
  const text = normalize(input.message);
  const wordCount = text ? text.split(" ").length : 0;
  const quantity = quantityFrom(input.message);
  const matches = findUniversalOfferingMatches(input.message, input.context);
  const selected = uniqueOffering(matches);

  const paymentMethod =
    includesAny(text, [
      "transferencia",
      "tarjeta",
      "efectivo",
      "deposito",
      "forma de pago",
      "formas de pago",
      "metodo de pago",
      "metodos de pago",
      "tipo de pago",
      "tipos de pago",
      "pago en linea",
      "link de pago",
      "aceptan pago",
    ]) || /como (?:puedo )?pagar/.test(text);

  const cartTotal =
    includesAny(text, [
      "cuanto pago",
      "cuanto debo",
      "total del pedido",
      "total de mi pedido",
      "cuanto es el pedido",
      "suma del pedido",
    ]) || (text === "total" && input.state.cart.length > 0);

  const resetCart =
    includesAny(text, [
      "nuevo pedido",
      "nueva orden",
      "reiniciar pedido",
      "reinicia el pedido",
      "vaciar carrito",
      "vaciar pedido",
      "borrar pedido",
      "cancelar pedido",
    ]);

  const promotion =
    includesAny(text, ["promocion", "promociones", "promo", "oferta", "descuento"]) ||
    /\b\d+x\d+\b/.test(text);

  const greeting =
    wordCount <= 5 &&
    includesAny(text, ["hola", "buenos dias", "buenas tardes", "buenas noches", "saludos"]);

  const hours = includesAny(text, ["horario", "horarios", "hora abren", "hora cierran", "atienden"]);
  const recommendation = includesAny(text, ["recomienda", "recomendacion", "que me sugieres", "mejor opcion"]);
  const appointment = includesAny(text, ["cita", "agendar", "reservar", "turno", "disponibilidad para"]);
  const policy = includesAny(text, ["politica", "devolucion", "garantia", "cambio", "envio", "entrega"]);
  const discover =
    includesAny(text, [
      "que venden",
      "que ofrecen",
      "que tienen",
      "catalogo",
      "menu",
      "carta",
      "ver productos",
      "ver servicios",
      "opciones disponibles",
    ]) && matches.length === 0;

  const addOperation = includesAny(text, [
    "quiero",
    "dame",
    "deme",
    "agrega",
    "anade",
    "ponme",
    "necesito",
    "me llevo",
    "voy a pedir",
  ]);

  if (resetCart) {
    return decision({
      intent: "reset_cart",
      confidence: 0.99,
      scopes: ["identity", "cart"],
      cartActions: [{ type: "clear" }],
      responseGoal: "Confirmar que el pedido temporal fue reiniciado.",
    });
  }

  if (cartTotal) {
    return decision({
      intent: "cart_total",
      confidence: 0.99,
      scopes: ["identity", "cart"],
      responseGoal: "Informar el total validado del carrito temporal.",
    });
  }

  if (paymentMethod) {
    return decision({
      intent: "query_payment",
      confidence: 0.98,
      scopes: ["identity", "payment"],
      responseGoal: "Responder solo con la forma de pago registrada, sin mezclar productos.",
    });
  }

  if (promotion) {
    return decision({
      intent: "query_promotion",
      confidence: 0.97,
      scopes: ["identity", "promotions"],
      responseGoal: "Confirmar únicamente promociones reales relacionadas con la consulta.",
    });
  }

  if (greeting) {
    return decision({
      intent: "greeting",
      confidence: 0.99,
      scopes: ["identity"],
      responseGoal: "Saludar como el negocio y abrir la conversación comercial.",
    });
  }

  if (hours) {
    return decision({
      intent: "query_hours",
      confidence: 0.95,
      scopes: ["identity", "hours"],
      responseGoal: "Informar únicamente los horarios registrados.",
    });
  }

  if (recommendation) {
    return decision({
      intent: "recommendation",
      confidence: 0.94,
      scopes: ["identity", "offerings"],
      selection: {
        mode: "preview",
        offeringKeys: visibleOfferings(input.context).slice(0, 5).map((item) => item.key),
        maxItems: 5,
      },
      responseGoal: "Recomendar entre tres y cinco opciones reales y pedir una preferencia.",
    });
  }

  if (appointment) {
    return decision({
      intent: "query_appointment",
      confidence: 0.93,
      scopes: ["identity", "hours", "rules"],
      responseGoal: "Responder con las condiciones registradas para citas, sin confirmar una reserva real.",
    });
  }

  if (policy) {
    return decision({
      intent: "query_policy",
      confidence: 0.9,
      scopes: ["identity", "policies", "rules"],
      responseGoal: "Responder únicamente con políticas registradas.",
    });
  }

  if (discover) {
    return decision({
      intent: "discover_offerings",
      confidence: 0.96,
      scopes: ["identity", "offerings"],
      selection: { mode: "preview", offeringKeys: [], maxItems: 5 },
      responseGoal: "Mostrar máximo cinco productos o servicios reales y cerrar con una pregunta.",
    });
  }

  if (selected && (addOperation || quantity !== null)) {
    if (!quantity) {
      return decision({
        intent: "clarification",
        confidence: 0.96,
        scopes: ["identity", "offerings", "cart"],
        selection: {
          mode: "selected",
          offeringKeys: [selected.key],
          maxItems: 1,
        },
        needsClarification: true,
        clarificationQuestion: `¿Cuántas unidades de ${selected.name} deseas?`,
        responseGoal: "Pedir únicamente la cantidad faltante.",
      });
    }
    return decision({
      intent: "add_to_cart",
      confidence: 0.98,
      scopes: ["identity", "offerings", "cart"],
      selection: {
        mode: "selected",
        offeringKeys: [selected.key],
        maxItems: 1,
      },
      cartActions: [{ type: "add", offeringKey: selected.key, quantity }],
      responseGoal: "Confirmar el artículo agregado, subtotal y total temporal.",
    });
  }

  if (selected) {
    return decision({
      intent: "query_offering",
      confidence: 0.94,
      scopes: ["identity", "offerings"],
      selection: {
        mode: "selected",
        offeringKeys: [selected.key],
        maxItems: 1,
      },
      responseGoal: "Informar el producto o servicio real y preguntar el siguiente paso.",
    });
  }

  if (matches.length > 1) {
    const candidates = matches.slice(0, 5).map((entry) => entry.offering);
    return decision({
      intent: "clarification",
      confidence: 0.82,
      scopes: ["identity", "offerings"],
      selection: {
        mode: "selected",
        offeringKeys: candidates.map((item) => item.key),
        maxItems: candidates.length,
      },
      needsClarification: true,
      clarificationQuestion: "¿Cuál de estas opciones deseas?",
      responseGoal: "Mostrar las coincidencias reales y pedir una sola aclaración.",
    });
  }

  if (addOperation || quantity !== null) {
    return decision({
      intent: "clarification",
      confidence: 0.78,
      scopes: ["identity", "offerings", "cart"],
      needsClarification: true,
      clarificationQuestion: "¿Qué producto o servicio deseas agregar?",
      responseGoal: "Pedir el producto o servicio faltante sin inventarlo.",
    });
  }

  return decision({
    intent: "general_inquiry",
    confidence: 0.55,
    scopes: ["identity", "faqs", "rules"],
    responseGoal: "Responder con la información registrada o pedir una aclaración concreta.",
  });
}

function canonicalizeModelDecision(
  model: UniversalPlannerDecision
): UniversalPlannerDecision {
  let intent: CanonicalUniversalIntent = "general_inquiry";
  const normalizedIntent = normalize(model.intent);

  if (model.cartActions.some((action) => action.type === "clear")) intent = "reset_cart";
  else if (model.cartActions.length) intent = "add_to_cart";
  else if (model.scopes.includes("payment")) intent = "query_payment";
  else if (model.scopes.includes("promotions")) intent = "query_promotion";
  else if (model.scopes.includes("hours")) intent = "query_hours";
  else if (model.scopes.includes("policies")) intent = "query_policy";
  else if (model.scopes.includes("cart")) intent = "cart_total";
  else if (model.scopes.includes("offerings")) {
    intent = model.selection.mode === "preview" || model.selection.mode === "complete"
      ? "discover_offerings"
      : "query_offering";
  } else if (/salud|greet|hola/.test(normalizedIntent)) intent = "greeting";
  else if (model.needsClarification) intent = "clarification";

  return {
    ...model,
    intent,
  };
}

export function resolveUniversalPlannerDecision(input: {
  baseline: UniversalPlannerDecision;
  model?: UniversalPlannerDecision | null;
}): UniversalPlannerDecision {
  const baseline = input.baseline;
  if (!input.model) return baseline;
  const model = canonicalizeModelDecision(input.model);

  // High-signal universal capabilities are authoritative. Gemini may enrich
  // ambiguous/general requests but cannot reroute clear payment, promotion,
  // cart, greeting or reset operations.
  if (baseline.confidence >= 0.9 && baseline.intent !== "general_inquiry") {
    return baseline;
  }

  if (model.confidence >= 0.55 && model.intent !== "general_inquiry") {
    return model;
  }

  return baseline.intent === "general_inquiry" ? model : baseline;
}

function money(value: number, currency: string): string {
  return `${value.toFixed(2)} ${currency}`;
}

function offeringLine(offering: UniversalOffering): string {
  return offering.price !== null && offering.price > 0
    ? `• ${offering.name} — ${money(offering.price, offering.currency)}`
    : `• ${offering.name}`;
}

function selectedOfferings(
  decisionValue: UniversalPlannerDecision,
  context: UniversalBusinessContext
): UniversalOffering[] {
  const byKey = new Map(context.offerings.map((offering) => [offering.key, offering]));
  if (decisionValue.selection.offeringKeys.length) {
    return decisionValue.selection.offeringKeys
      .map((key) => byKey.get(key))
      .filter((offering): offering is UniversalOffering => Boolean(offering))
      .slice(0, decisionValue.selection.mode === "complete" ? 150 : 5);
  }
  return visibleOfferings(context).slice(
    0,
    decisionValue.selection.mode === "complete"
      ? Math.min(150, decisionValue.selection.maxItems)
      : Math.min(5, decisionValue.selection.maxItems)
  );
}

function promotionMatches(message: string, promotions: string[]): string[] {
  const query = meaningfulTokens(message);
  if (!query.length) return promotions.slice(0, 3);
  const scored = promotions
    .map((promotion) => {
      const source = new Set(tokens(promotion));
      const score = query.reduce((sum, token) => sum + (source.has(token) ? 1 : 0), 0);
      return { promotion, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
  return scored.slice(0, 3).map((entry) => entry.promotion);
}

export function composeUniversalSafeAnswer(input: {
  message: string;
  decision: UniversalPlannerDecision;
  context: UniversalBusinessContext;
  state: UniversalAgentState;
  invalidActions?: string[];
}): string {
  const intent = input.decision.intent as CanonicalUniversalIntent;
  const chosen = selectedOfferings(input.decision, input.context);
  const cart = getUniversalCartSnapshot(input.state, input.context);
  let answer = "";

  if (intent === "greeting") {
    answer = `¡Hola! Somos ${input.context.businessName}. ¿Cómo podemos ayudarte hoy?`;
  } else if (intent === "discover_offerings") {
    answer = chosen.length
      ? `Estas son algunas opciones:\n${chosen.slice(0, 5).map(offeringLine).join("\n")}\n¿Qué te interesa?`
      : "Por ahora no tenemos productos o servicios disponibles registrados. ¿Qué estás buscando?";
  } else if (intent === "query_offering") {
    answer = chosen.length
      ? `${chosen.slice(0, 5).map(offeringLine).join("\n")}\n¿Cuántas unidades deseas o qué detalle necesitas?`
      : "No encuentro esa opción registrada. ¿Puedes indicarme el nombre o tipo que buscas?";
  } else if (intent === "query_promotion") {
    const matches = promotionMatches(input.message, input.context.promotions);
    answer = matches.length
      ? `Tenemos esta promoción vigente:\n${matches.map((item) => `• ${item}`).join("\n")}\n¿Deseas aprovecharla?`
      : input.context.promotions.length
        ? "No tenemos esa promoción registrada. ¿Te muestro las promociones vigentes?"
        : "Hoy no tenemos promociones registradas. ¿Te muestro opciones disponibles?";
  } else if (intent === "query_payment") {
    const relevantConditions = input.context.payment.conditions.filter((condition) => {
      const conditionText = normalize(condition);
      const messageTokens = meaningfulTokens(input.message);
      return messageTokens.some((token) => conditionText.includes(token));
    });
    if (relevantConditions.length) {
      answer = `${relevantConditions.slice(0, 2).join(" ")} ¿Deseas continuar con tu pedido?`;
    } else if (
      input.context.payment.provider === "none" ||
      input.context.payment.provider === "unknown"
    ) {
      answer = "Por ahora no tenemos formas de pago registradas. Podemos confirmarlo antes de finalizar.";
    } else {
      answer = `${input.context.payment.summary} El método específico solicitado no está confirmado. ¿Deseas continuar?`;
    }
  } else if (intent === "add_to_cart") {
    const totals = Object.entries(cart.totals)
      .map(([currency, total]) => money(total, currency))
      .join(" + ");
    const latest = chosen[0];
    answer = latest
      ? `Listo, agregamos ${latest.name}. Total temporal: ${totals || "por calcular"}. ¿Deseas algo más?`
      : "No pudimos validar ese producto o servicio. ¿Cuál deseas agregar?";
  } else if (intent === "cart_total") {
    const totals = Object.entries(cart.totals)
      .map(([currency, total]) => money(total, currency))
      .join(" + ");
    answer = cart.unitCount
      ? `Tu total temporal es ${totals}. ¿Deseas agregar algo más?`
      : "Tu pedido temporal está vacío. ¿Qué deseas agregar?";
  } else if (intent === "reset_cart") {
    answer = "Listo, iniciamos un pedido nuevo. ¿Qué deseas agregar?";
  } else if (intent === "recommendation") {
    answer = chosen.length
      ? `Te recomendamos:\n${chosen.slice(0, 5).map(offeringLine).join("\n")}\n¿Qué preferencia o presupuesto tienes?`
      : "Cuéntanos qué buscas y te ayudamos con una opción disponible.";
  } else if (intent === "query_hours") {
    answer = input.context.hours.length
      ? `Nuestro horario es: ${input.context.hours.slice(0, 4).join(" · ")}. ¿En qué horario deseas visitarnos?`
      : "No tenemos un horario registrado. Podemos confirmarlo antes de tu visita.";
  } else if (intent === "query_policy") {
    answer = input.context.policies.length
      ? `${input.context.policies.slice(0, 3).join(" ")} ¿Qué caso deseas consultar?`
      : "No tenemos esa política registrada. Podemos solicitar una confirmación del negocio.";
  } else if (intent === "query_appointment") {
    answer = input.context.appointmentConditions.length
      ? `${input.context.appointmentConditions.slice(0, 3).join(" ")} ¿Qué día te interesa?`
      : "Podemos revisar una cita, pero aún no hay condiciones de agenda registradas. ¿Qué día te interesa?";
  } else if (intent === "clarification" || input.decision.needsClarification) {
    answer = input.decision.clarificationQuestion || "¿Puedes darme un poco más de detalle?";
    if (chosen.length > 1) {
      answer = `${chosen.slice(0, 5).map(offeringLine).join("\n")}\n${answer}`;
    }
  } else {
    answer = input.context.summary
      ? `${input.context.summary} ¿Qué información necesitas?`
      : "¿Qué producto, servicio o información necesitas?";
  }

  return sanitizeUniversalAnswer(answer, input.context.businessName);
}
