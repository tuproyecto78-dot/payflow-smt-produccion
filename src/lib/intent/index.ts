/**
 * PayFlow SMT — Universal Intent Library (barrel export)
 *
 * Canal principal: WhatsApp Business.
 * El Agente IA Universal usa estos módulos para:
 *   1. Detectar intención por significado (no keywords exactas)
 *   2. Mantener contexto conversacional + carrito persistente en DB
 *   3. Gestionar catálogo/promos por lenguaje natural (admin only)
 *   4. Generar respuestas naturales con datos del Knowledge Center
 */

export {
  INTENT_LIBRARY,
  CART_INTENTS,
  CATALOG_MANAGE_INTENTS,
  ALL_INTENTS,
  getIntentDefinition,
  isCatalogManageIntent,
  isCartIntent,
  type IntentDefinition,
  type ActionType,
  type Tone,
} from "./intent-library";

export {
  detectIntent,
  checkProductAmbiguity,
  type IntentMatch,
} from "./intent-detector";

export {
  getOrCreateSession,
  loadContext,
  addMessage,
  setPendingIntent,
  clearPendingIntent,
  closeSession,
  getOrCreateCart,
  saveCartItems,
  clearCart,
  setCartStatus,
  applyPromo,
  type ConversationContext,
  type CartItem,
} from "./conversation-manager";

export {
  parseCatalogCommand,
  executeCatalogAction,
  type CatalogAction,
} from "./catalog-parser";
