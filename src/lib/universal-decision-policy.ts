import type {
  UniversalBusinessContext,
  UniversalOffering,
  UniversalPlannerDecision,
} from "./universal-agent-contract";
import type {
  UniversalIntentCandidate,
  UniversalKnowledgeIndex,
  UniversalKnowledgeRetrieval,
} from "./universal-conversation-contract";
import { normalizeUniversalText } from "./universal-knowledge-engine";
import type { UniversalSessionState } from "./universal-session-memory";

function decision(input: Partial<UniversalPlannerDecision> & {
  intent: string;
}): UniversalPlannerDecision {
  return {
    intent: input.intent,
    confidence: Math.max(0, Math.min(1, input.confidence ?? 0.9)),
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

function visibleOfferings(context: UniversalBusinessContext): UniversalOffering[] {
  return context.offerings.filter(
    (offering) =>
      offering.available &&
      Boolean(offering.name) &&
      offering.price !== null &&
      Number.isFinite(offering.price) &&
      offering.price > 0
  );
}

function uniqueOfferingKeys(
  keys: string[],
  context: UniversalBusinessContext,
  max = 5
): string[] {
  const valid = new Set(visibleOfferings(context).map((offering) => offering.key));
  return Array.from(new Set(keys.filter((key) => valid.has(key)))).slice(0, max);
}

function diverseOfferingKeys(
  context: UniversalBusinessContext,
  max = 5
): string[] {
  const selected: UniversalOffering[] = [];
  const categories = new Set<string>();
  const offerings = visibleOfferings(context);

  for (const offering of offerings) {
    const category = offering.category.toLocaleLowerCase("es").trim();
    if (category && categories.has(category)) continue;
    selected.push(offering);
    if (category) categories.add(category);
    if (selected.length >= max) return selected.map((item) => item.key);
  }

  for (const offering of offerings) {
    if (selected.some((item) => item.key === offering.key)) continue;
    selected.push(offering);
    if (selected.length >= max) break;
  }
  return selected.map((item) => item.key);
}

function promotionSuggestionKey(
  context: UniversalBusinessContext
): string | null {
  const featuredKnowledge = context.knowledge.filter((entry) =>
    /\b(?:plato del dia|especialidad|recomendad|destacad|favorit)\b/.test(
      normalizeUniversalText(
        `${entry.title} ${entry.category} ${entry.content}`
      )
    )
  );
  for (const entry of featuredKnowledge) {
    const content = normalizeUniversalText(
      `${entry.title} ${entry.content}`
    );
    const offering = visibleOfferings(context).find((item) =>
      content.includes(normalizeUniversalText(item.name))
    );
    if (offering) return offering.key;
  }
  return diverseOfferingKeys(context, 1)[0] || null;
}

function browseKeys(input: {
  candidate: UniversalIntentCandidate;
  context: UniversalBusinessContext;
  retrieval: UniversalKnowledgeRetrieval;
}): string[] {
  const candidateKeys = uniqueOfferingKeys(
    input.candidate.offeringKeys,
    input.context
  );
  if (candidateKeys.length > 1) return candidateKeys;

  const retrieved = uniqueOfferingKeys(
    input.retrieval.offeringKeys,
    input.context
  );
  if (retrieved.length > 1) return retrieved;

  return visibleOfferings(input.context)
    .slice(0, 5)
    .map((offering) => offering.key);
}

function selectedOffering(input: {
  candidate: UniversalIntentCandidate;
  context: UniversalBusinessContext;
}): UniversalOffering | null {
  const keys = uniqueOfferingKeys(
    input.candidate.offeringKeys,
    input.context,
    1
  );
  if (!keys.length) return null;
  return (
    input.context.offerings.find((offering) => offering.key === keys[0]) || null
  );
}

function invalidRememberedSelection(input: {
  candidate: UniversalIntentCandidate;
  state: UniversalSessionState;
}): UniversalPlannerDecision | null {
  if (
    !input.candidate.selectionIndex ||
    input.candidate.offeringKeys.length ||
    !input.state.sessionMemory.lastPresentedOfferingKeys.length
  ) {
    return null;
  }

  const purchase = input.candidate.act === "transactional";
  return decision({
    intent: "clarification",
    confidence: input.candidate.confidence,
    scopes: purchase
      ? ["identity", "offerings", "cart"]
      : ["identity", "offerings"],
    needsClarification: true,
    clarificationQuestion: `Elige una opción del 1 al ${input.state.sessionMemory.lastPresentedOfferingKeys.length}.`,
    responseGoal: "Pedir una selección válida de la última lista mostrada.",
  });
}

/**
 * Only this layer may translate semantics into effects. Neither Gemini nor
 * the retrieval layer can create cart actions.
 */
export function planUniversalDecision(input: {
  candidate: UniversalIntentCandidate;
  context: UniversalBusinessContext;
  state: UniversalSessionState;
  index: UniversalKnowledgeIndex;
  retrieval: UniversalKnowledgeRetrieval;
}): UniversalPlannerDecision {
  const intent = input.candidate;
  const invalidSelection = invalidRememberedSelection({
    candidate: intent,
    state: input.state,
  });
  if (invalidSelection) return invalidSelection;

  if (intent.act === "cart_management" && intent.mode === "reset") {
    return decision({
      intent: "reset_cart",
      confidence: intent.confidence,
      scopes: ["identity", "cart"],
      cartActions: [{ type: "clear" }],
      responseGoal: "Confirmar que el pedido temporal fue reiniciado.",
    });
  }

  if (intent.act === "cart_management" && intent.mode === "total") {
    return decision({
      intent: "cart_total",
      confidence: intent.confidence,
      scopes: ["identity", "cart"],
      responseGoal: "Informar el total validado del carrito temporal.",
    });
  }

  if (intent.act === "social" && intent.topic === "greeting") {
    return decision({
      intent: "greeting",
      confidence: intent.confidence,
      scopes: ["identity"],
      responseGoal: "Saludar como el negocio y abrir la conversación.",
    });
  }

  if (
    intent.topic === "payment" &&
    intent.act === "transactional" &&
    intent.mode === "select" &&
    intent.paymentMethod &&
    input.state.cart.length > 0
  ) {
    return decision({
      intent: "select_payment_method",
      confidence: intent.confidence,
      scopes: ["identity", "payment", "cart"],
      responseGoal:
        "Registrar la preferencia informativa de pago sin ejecutar el cobro.",
    });
  }

  if (intent.topic === "payment") {
    return decision({
      intent: "query_payment",
      confidence: intent.confidence,
      scopes: ["identity", "payment", "faqs"],
      responseGoal: "Responder solo con formas de pago registradas.",
    });
  }

  if (intent.topic === "promotions") {
    const suggestionKey =
      input.context.promotions.length === 0
        ? promotionSuggestionKey(input.context)
        : null;
    return decision({
      intent: "query_promotion",
      confidence: intent.confidence,
      scopes: suggestionKey
        ? ["identity", "promotions", "faqs", "offerings"]
        : ["identity", "promotions", "faqs"],
      selection: suggestionKey
        ? {
            mode: "selected",
            offeringKeys: [suggestionKey],
            maxItems: 1,
          }
        : undefined,
      responseGoal:
        "Responder con promociones reales o una sugerencia validada del negocio.",
    });
  }

  if (intent.topic === "hours") {
    return decision({
      intent: "query_hours",
      confidence: intent.confidence,
      scopes: ["identity", "hours", "faqs"],
      responseGoal: "Informar únicamente horarios registrados.",
    });
  }

  if (intent.topic === "location") {
    return decision({
      intent: "query_location",
      confidence: intent.confidence,
      scopes: ["identity", "address", "faqs"],
      responseGoal: "Informar únicamente la dirección registrada.",
    });
  }

  if (intent.topic === "policies") {
    return decision({
      intent: "query_policy",
      confidence: intent.confidence,
      scopes: ["identity", "policies", "faqs", "rules"],
      responseGoal: "Responder con políticas o FAQs registradas.",
    });
  }

  if (intent.topic === "appointments") {
    return decision({
      intent: "query_appointment",
      confidence: intent.confidence,
      scopes: ["identity", "hours", "faqs", "rules"],
      responseGoal:
        "Informar condiciones de agenda sin confirmar una reserva real.",
    });
  }

  if (
    intent.topic === "recommendation" ||
    intent.mode === "recommend"
  ) {
    const keys = diverseOfferingKeys(input.context);
    return decision({
      intent: "recommendation",
      confidence: intent.confidence,
      scopes: ["identity", "offerings"],
      selection: {
        mode: "preview",
        offeringKeys: keys,
        maxItems: keys.length || 5,
      },
      responseGoal: "Recomendar opciones reales y pedir una preferencia.",
    });
  }

  if (intent.topic === "offerings") {
    if (intent.act === "transactional" && intent.orderItems.length > 0) {
      const unresolved = intent.orderItems.find(
        (item) => !item.offeringKey
      );
      if (unresolved) {
        const keys = uniqueOfferingKeys(
          unresolved.candidateOfferingKeys,
          input.context
        );
        const quantityLabel = unresolved.quantity
          ? `${unresolved.quantity} × `
          : "";
        return decision({
          intent: "clarification",
          confidence: intent.confidence,
          scopes: ["identity", "offerings", "cart"],
          selection: {
            mode: "preview",
            offeringKeys: keys,
            maxItems: keys.length || 5,
          },
          needsClarification: true,
          clarificationQuestion: keys.length
            ? `¿Cuál opción prefieres para ${quantityLabel}${unresolved.phrase}?`
            : `¿Qué producto deseas para ${quantityLabel}${unresolved.phrase}?`,
          responseGoal:
            "Resolver un artículo ambiguo sin modificar parcialmente el pedido.",
        });
      }

      const missingQuantity = intent.orderItems.find(
        (item) => item.offeringKey && !item.quantity
      );
      if (missingQuantity?.offeringKey) {
        const offering = input.context.offerings.find(
          (item) => item.key === missingQuantity.offeringKey
        );
        if (offering) {
          return decision({
            intent: "clarification",
            confidence: intent.confidence,
            scopes: ["identity", "offerings", "cart"],
            selection: {
              mode: "selected",
              offeringKeys: [offering.key],
              maxItems: 1,
            },
            needsClarification: true,
            clarificationQuestion: `¿Cuántas unidades de ${offering.name} deseas?`,
            responseGoal: "Pedir únicamente la cantidad faltante.",
          });
        }
      }

      const validItems = intent.orderItems.filter(
        (
          item
        ): item is typeof item & {
          offeringKey: string;
          quantity: number;
        } => Boolean(item.offeringKey && item.quantity)
      );
      if (validItems.length === intent.orderItems.length) {
        const cartByKey = new Map(
          input.state.cart.map((item) => [
            item.offeringKey,
            item.quantity,
          ])
        );
        const cartActions = validItems.map((item) => ({
          type:
            intent.orderOperation === "add" ||
            !cartByKey.has(item.offeringKey)
              ? ("add" as const)
              : ("set" as const),
          offeringKey: item.offeringKey,
          quantity: item.quantity,
        }));
        const offeringKeys = validItems.map((item) => item.offeringKey);
        return decision({
          intent: "add_to_cart",
          confidence: intent.confidence,
          scopes: ["identity", "offerings", "cart", "payment"],
          selection: {
            mode: "selected",
            offeringKeys,
            maxItems: Math.min(offeringKeys.length, 5),
          },
          cartActions,
          responseGoal:
            "Actualizar todos los artículos, mostrar el resumen y avanzar al medio de pago.",
        });
      }
    }

    const offering = selectedOffering({
      candidate: intent,
      context: input.context,
    });

    if (intent.act === "transactional") {
      if (offering && intent.quantity) {
        return decision({
          intent: "add_to_cart",
          confidence: intent.confidence,
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
              quantity: intent.quantity,
            },
          ],
          responseGoal:
            "Agregar al carrito temporal y mostrar subtotal y total validados.",
        });
      }

      if (offering) {
        return decision({
          intent: "clarification",
          confidence: intent.confidence,
          scopes: ["identity", "offerings", "cart"],
          selection: {
            mode: "selected",
            offeringKeys: [offering.key],
            maxItems: 1,
          },
          needsClarification: true,
          clarificationQuestion: `¿Cuántas unidades de ${offering.name} deseas?`,
          responseGoal: "Pedir únicamente la cantidad faltante.",
        });
      }

      const keys = browseKeys({
        candidate: intent,
        context: input.context,
        retrieval: input.retrieval,
      });
      if (keys.length) {
        return decision({
          intent: "clarification",
          confidence: intent.confidence,
          scopes: ["identity", "offerings", "cart"],
          selection: {
            mode: "preview",
            offeringKeys: keys,
            maxItems: keys.length,
          },
          needsClarification: true,
          clarificationQuestion: "¿Cuál opción deseas agregar?",
          responseGoal:
            "Mostrar opciones para resolver la compra sin agregar nada todavía.",
        });
      }

      return decision({
        intent: "clarification",
        confidence: intent.confidence,
        scopes: ["identity", "offerings", "cart"],
        needsClarification: true,
        clarificationQuestion: "¿Qué producto o servicio deseas agregar?",
        responseGoal: "Pedir el artículo faltante sin inventarlo.",
      });
    }

    if (intent.mode === "browse" || !offering) {
      const keys = browseKeys({
        candidate: intent,
        context: input.context,
        retrieval: input.retrieval,
      });
      return decision({
        intent: "discover_offerings",
        confidence: intent.confidence,
        scopes: ["identity", "offerings"],
        selection: {
          mode: "preview",
          offeringKeys: keys,
          maxItems: keys.length || 5,
        },
        responseGoal:
          "Mostrar opciones reales sin activar carrito ni pedir cantidades.",
      });
    }

    return decision({
      intent: "query_offering",
      confidence: intent.confidence,
      scopes: ["identity", "offerings"],
      selection: {
        mode: "selected",
        offeringKeys: [offering.key],
        maxItems: 1,
      },
      responseGoal:
        "Informar el producto o servicio sin convertirlo en compra.",
    });
  }

  return decision({
    intent: intent.act === "unknown" ? "clarification" : "general_inquiry",
    confidence: intent.confidence,
    scopes: ["identity", "faqs", "policies", "rules"],
    needsClarification:
      intent.act === "unknown" && input.retrieval.matches.length === 0,
    clarificationQuestion:
      intent.act === "unknown" && input.retrieval.matches.length === 0
        ? "¿Qué producto, servicio o información necesitas?"
        : "",
    responseGoal:
      "Responder con conocimiento del negocio o pedir una aclaración concreta.",
  });
}
