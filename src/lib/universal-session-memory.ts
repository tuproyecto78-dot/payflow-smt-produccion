import {
  appendUniversalTurn,
  getUniversalCartSnapshot,
  normalizeUniversalAgentState,
  sanitizeUniversalAnswer,
  type UniversalAgentState,
  type UniversalBusinessContext,
  type UniversalOffering,
  type UniversalPlannerDecision,
} from "./universal-agent-contract";
import {
  classifyUniversalIntent,
  composeUniversalSafeAnswer,
} from "./universal-intent-engine";

export type UniversalSessionMemory = {
  version: 1;
  lastPresentedOfferingKeys: string[];
  pendingOfferingKey: string | null;
  intentCounts: Record<string, number>;
  lastSelectionIndex: number | null;
};

export type UniversalSessionState = UniversalAgentState & {
  sessionMemory: UniversalSessionMemory;
};

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

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function finiteInteger(value: unknown, min = 1, max = 99): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  const integer = Math.trunc(numeric);
  return integer >= min && integer <= max ? integer : null;
}

function validOfferingMap(context: UniversalBusinessContext) {
  return new Map(
    context.offerings
      .filter((offering) => offering.available && Boolean(offering.name))
      .map((offering) => [offering.key, offering])
  );
}

function emptySessionMemory(): UniversalSessionMemory {
  return {
    version: 1,
    lastPresentedOfferingKeys: [],
    pendingOfferingKey: null,
    intentCounts: {},
    lastSelectionIndex: null,
  };
}

export function normalizeUniversalSessionState(
  value: unknown,
  context: UniversalBusinessContext
): UniversalSessionState {
  const base = normalizeUniversalAgentState(value, context);
  const input = safeRecord(value);
  const rawMemory = safeRecord(input.sessionMemory);
  const offerings = validOfferingMap(context);

  const lastPresentedOfferingKeys = Array.isArray(rawMemory.lastPresentedOfferingKeys)
    ? Array.from(
        new Set(
          rawMemory.lastPresentedOfferingKeys
            .map((key) => String(key || "").trim())
            .filter((key) => offerings.has(key))
        )
      ).slice(0, 100)
    : [];

  const pendingCandidate = String(rawMemory.pendingOfferingKey || "").trim();
  const pendingOfferingKey = offerings.has(pendingCandidate)
    ? pendingCandidate
    : null;

  const intentCounts: Record<string, number> = {};
  const rawCounts = safeRecord(rawMemory.intentCounts);
  for (const [intent, count] of Object.entries(rawCounts).slice(0, 30)) {
    const key = String(intent || "").trim().slice(0, 80);
    const numeric = finiteInteger(count, 1, 100000);
    if (key && numeric) intentCounts[key] = numeric;
  }

  return {
    ...base,
    sessionMemory: {
      version: 1,
      lastPresentedOfferingKeys,
      pendingOfferingKey,
      intentCounts,
      lastSelectionIndex: finiteInteger(rawMemory.lastSelectionIndex, 1, 100),
    },
  };
}

function numberFromSingleExpression(message: string): number | null {
  const text = normalizeText(message);
  const direct = text.match(
    /^(?:(?:opcion|numero|la opcion|el numero)\s+)?(\d{1,2})(?:\s+(?:unidad|unidades))?$/
  );
  if (direct) return finiteInteger(direct[1]);

  const withoutPrefix = text.replace(/^(?:opcion|numero|la opcion|el numero)\s+/, "");
  return NUMBER_WORDS[withoutPrefix] || null;
}

function selectionWithQuantity(message: string): { index: number; quantity: number } | null {
  const text = normalizeText(message);
  const match = text.match(
    /^(?:(?:opcion|numero|la opcion|el numero)\s+)?(\d{1,2})\s*(?:x|por|cantidad)\s*(\d{1,2})(?:\s+unidades?)?$/
  );
  if (!match) return null;
  const index = finiteInteger(match[1], 1, 100);
  const quantity = finiteInteger(match[2], 1, 99);
  return index && quantity ? { index, quantity } : null;
}

function plannerDecision(input: Partial<UniversalPlannerDecision> & {
  intent: string;
}): UniversalPlannerDecision {
  return {
    intent: input.intent,
    confidence: input.confidence ?? 0.99,
    scopes: input.scopes || ["identity"],
    selection: input.selection || {
      mode: "none",
      offeringKeys: [],
      maxItems: 5,
    },
    cartActions: input.cartActions || [],
    needsClarification: input.needsClarification === true,
    clarificationQuestion: input.clarificationQuestion || "",
    responseGoal: input.responseGoal || "Responder de forma breve y comercial.",
  };
}

export function classifyUniversalSessionIntent(input: {
  message: string;
  context: UniversalBusinessContext;
  state: UniversalSessionState;
}): UniversalPlannerDecision {
  const number = numberFromSingleExpression(input.message);
  const withQuantity = selectionWithQuantity(input.message);
  const offerings = validOfferingMap(input.context);
  const memory = input.state.sessionMemory || emptySessionMemory();

  // When the previous turn asked for quantity, a bare number is quantity,
  // never a new catalog search or a different numbered option.
  if (memory.pendingOfferingKey && number) {
    const offering = offerings.get(memory.pendingOfferingKey);
    if (offering) {
      return plannerDecision({
        intent: "add_to_cart",
        scopes: ["identity", "offerings", "cart"],
        selection: {
          mode: "selected",
          offeringKeys: [offering.key],
          maxItems: 1,
        },
        cartActions: [
          { type: "add", offeringKey: offering.key, quantity: number },
        ],
        responseGoal:
          "Agregar la cantidad indicada del producto pendiente y mostrar subtotal y total.",
      });
    }
  }

  if (withQuantity && memory.lastPresentedOfferingKeys.length) {
    const key = memory.lastPresentedOfferingKeys[withQuantity.index - 1];
    const offering = key ? offerings.get(key) : null;
    if (!offering) {
      return plannerDecision({
        intent: "clarification",
        scopes: ["identity", "offerings"],
        needsClarification: true,
        clarificationQuestion: `Elige una opción del 1 al ${memory.lastPresentedOfferingKeys.length}.`,
        responseGoal: "Pedir una selección válida de la última lista mostrada.",
      });
    }
    return plannerDecision({
      intent: "add_to_cart",
      scopes: ["identity", "offerings", "cart"],
      selection: {
        mode: "selected",
        offeringKeys: [offering.key],
        maxItems: 1,
      },
      cartActions: [
        {
          type: "add",
          offeringKey: offering.key,
          quantity: withQuantity.quantity,
        },
      ],
      responseGoal:
        "Agregar la opción numerada con la cantidad indicada y mostrar subtotal y total.",
    });
  }

  // A bare number after a numbered list selects that exact position.
  if (number && memory.lastPresentedOfferingKeys.length) {
    const key = memory.lastPresentedOfferingKeys[number - 1];
    const offering = key ? offerings.get(key) : null;
    if (!offering) {
      return plannerDecision({
        intent: "clarification",
        scopes: ["identity", "offerings"],
        needsClarification: true,
        clarificationQuestion: `Elige una opción del 1 al ${memory.lastPresentedOfferingKeys.length}.`,
        responseGoal: "Pedir una selección válida de la última lista mostrada.",
      });
    }
    return plannerDecision({
      intent: "select_presented_option",
      scopes: ["identity", "offerings", "cart"],
      selection: {
        mode: "selected",
        offeringKeys: [offering.key],
        maxItems: 1,
      },
      needsClarification: true,
      clarificationQuestion: `Elegiste ${offering.name}. ¿Cuántas unidades deseas?`,
      responseGoal:
        "Confirmar la opción seleccionada de la última lista y pedir únicamente la cantidad.",
    });
  }

  return classifyUniversalIntent({
    message: input.message,
    context: input.context,
    state: input.state,
  });
}

function selectedOfferings(
  decision: UniversalPlannerDecision,
  context: UniversalBusinessContext
): UniversalOffering[] {
  const byKey = validOfferingMap(context);
  return decision.selection.offeringKeys
    .map((key) => byKey.get(key))
    .filter((offering): offering is UniversalOffering => Boolean(offering))
    .slice(0, decision.selection.mode === "complete" ? 100 : 5);
}

function money(value: number, currency: string): string {
  return `${value.toFixed(2)} ${currency}`;
}

function numberedOfferingLines(offerings: UniversalOffering[]): string {
  return offerings
    .map((offering, index) => {
      const price =
        offering.price !== null && offering.price > 0
          ? ` — ${money(offering.price, offering.currency)}`
          : "";
      return `${index + 1}. ${offering.name}${price}`;
    })
    .join("\n");
}

export function composeUniversalSessionAnswer(input: {
  message: string;
  decision: UniversalPlannerDecision;
  context: UniversalBusinessContext;
  state: UniversalSessionState;
  invalidActions?: string[];
}): string {
  const chosen = selectedOfferings(input.decision, input.context);
  const intent = input.decision.intent;

  if (
    intent === "discover_offerings" ||
    intent === "recommendation" ||
    (intent === "clarification" && chosen.length > 1) ||
    (intent === "query_offering" && chosen.length > 1)
  ) {
    const title = intent === "recommendation" ? "Te recomendamos:" : "Estas son las opciones:";
    const closing =
      intent === "clarification"
        ? input.decision.clarificationQuestion || "¿Cuál opción deseas?"
        : "Responde con el número de la opción que deseas.";
    const answer = chosen.length
      ? `${title}\n${numberedOfferingLines(chosen)}\n${closing}`
      : "No encontramos opciones registradas. ¿Qué estás buscando?";
    return sanitizeUniversalAnswer(answer, input.context.businessName);
  }

  if (intent === "select_presented_option") {
    const offering = chosen[0];
    const answer = offering
      ? `Elegiste ${offering.name}. ¿Cuántas unidades deseas?`
      : "No pudimos recuperar esa opción. ¿Cuál deseas elegir?";
    return sanitizeUniversalAnswer(answer, input.context.businessName);
  }

  if (intent === "add_to_cart") {
    const action = input.decision.cartActions.find(
      (item) => item.type === "add" || item.type === "set"
    );
    const offering = action?.offeringKey
      ? input.context.offerings.find((item) => item.key === action.offeringKey)
      : null;
    const quantity = action?.quantity || 0;
    const cart = getUniversalCartSnapshot(input.state, input.context);
    const totals = Object.entries(cart.totals)
      .map(([currency, total]) => money(total, currency))
      .join(" + ");
    const subtotal =
      offering?.price && quantity
        ? money(offering.price * quantity, offering.currency)
        : "por calcular";
    const answer = offering
      ? `Agregamos ${quantity} × ${offering.name}. Subtotal: ${subtotal}. Total temporal: ${
          totals || "por calcular"
        }. ¿Deseas algo más?`
      : "No pudimos validar esa opción. ¿Cuál deseas agregar?";
    return sanitizeUniversalAnswer(answer, input.context.businessName);
  }

  return composeUniversalSafeAnswer({
    message: input.message,
    decision: input.decision,
    context: input.context,
    state: input.state,
    invalidActions: input.invalidActions,
  });
}

function presentedKeysForDecision(
  decision: UniversalPlannerDecision,
  context: UniversalBusinessContext
): string[] {
  const valid = validOfferingMap(context);
  const keys = decision.selection.offeringKeys.filter((key) => valid.has(key));
  const isList =
    decision.intent === "discover_offerings" ||
    decision.intent === "recommendation" ||
    ((decision.intent === "clarification" || decision.intent === "query_offering") &&
      keys.length > 1);
  return isList ? keys.slice(0, decision.selection.mode === "complete" ? 100 : 5) : [];
}

export function transitionUniversalSessionMemory(input: {
  state: UniversalSessionState;
  decision: UniversalPlannerDecision;
  context: UniversalBusinessContext;
}): UniversalSessionState {
  const current = input.state.sessionMemory || emptySessionMemory();
  const intentCounts = { ...current.intentCounts };
  intentCounts[input.decision.intent] = Math.min(
    100000,
    (intentCounts[input.decision.intent] || 0) + 1
  );

  let lastPresentedOfferingKeys = current.lastPresentedOfferingKeys;
  let pendingOfferingKey = current.pendingOfferingKey;
  let lastSelectionIndex = current.lastSelectionIndex;

  if (input.decision.intent === "reset_cart") {
    lastPresentedOfferingKeys = [];
    pendingOfferingKey = null;
    lastSelectionIndex = null;
  } else {
    const presented = presentedKeysForDecision(input.decision, input.context);
    if (presented.length) {
      lastPresentedOfferingKeys = presented;
      pendingOfferingKey = null;
      lastSelectionIndex = null;
    }

    if (input.decision.intent === "select_presented_option") {
      pendingOfferingKey = input.decision.selection.offeringKeys[0] || null;
      const selectedIndex = pendingOfferingKey
        ? lastPresentedOfferingKeys.indexOf(pendingOfferingKey)
        : -1;
      lastSelectionIndex = selectedIndex >= 0 ? selectedIndex + 1 : null;
    } else if (
      input.decision.intent === "clarification" &&
      input.decision.scopes.includes("cart") &&
      input.decision.selection.offeringKeys.length === 1
    ) {
      pendingOfferingKey = input.decision.selection.offeringKeys[0];
    } else if (input.decision.intent === "add_to_cart") {
      pendingOfferingKey = null;
    }
  }

  return {
    ...input.state,
    sessionMemory: {
      version: 1,
      lastPresentedOfferingKeys,
      pendingOfferingKey,
      intentCounts,
      lastSelectionIndex,
    },
  };
}

export function appendUniversalSessionTurn(input: {
  state: UniversalSessionState;
  customerMessage: string;
  businessAnswer: string;
  intent: string;
  pendingQuestion?: string | null;
}): UniversalSessionState {
  return appendUniversalTurn(input) as UniversalSessionState;
}

export function buildUniversalSessionPlannerMemory(
  state: UniversalSessionState,
  context: UniversalBusinessContext
) {
  const byKey = validOfferingMap(context);
  return {
    lastPresentedOptions: state.sessionMemory.lastPresentedOfferingKeys
      .map((key, index) => {
        const offering = byKey.get(key);
        return offering
          ? {
              number: index + 1,
              key: offering.key,
              name: offering.name,
            }
          : null;
      })
      .filter(Boolean),
    pendingOffering: state.sessionMemory.pendingOfferingKey
      ? byKey.get(state.sessionMemory.pendingOfferingKey)?.name || null
      : null,
    intentCounts: state.sessionMemory.intentCounts,
    lastSelectionIndex: state.sessionMemory.lastSelectionIndex,
  };
}

export function requiresDeterministicSessionAnswer(
  decision: UniversalPlannerDecision
): boolean {
  return [
    "discover_offerings",
    "recommendation",
    "query_offering",
    "clarification",
    "select_presented_option",
    "add_to_cart",
    "cart_total",
    "reset_cart",
    "query_payment",
    "query_promotion",
  ].includes(decision.intent);
}
