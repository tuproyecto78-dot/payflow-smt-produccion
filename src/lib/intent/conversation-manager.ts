/**
 * PayFlow SMT — Conversation Manager (DB-persisted)
 *
 * Per-business conversation state with full context + cart persistence.
 * Canal principal: WhatsApp Business. Cada sesión se identifica por
 * (businessId, phoneNumber) y persiste en Prisma (SQLite/PostgreSQL).
 *
 * El contexto se conserva COMPLETO durante toda la conversación activa
 * (no hay límite de 10 mensajes — el carrito y el pendingIntent siempre
 * están disponibles).
 */
import { db } from "@/lib/db";

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  currency: string;
  qty: number;
  note?: string;
}

export interface ConversationContext {
  sessionId: string;
  businessId: string;
  phoneNumber: string;
  pendingIntent: string | null;
  pendingEntities: Record<string, string>;
  history: Array<{ role: "client" | "bot" | "system"; text: string; intent?: string; timestamp: string }>;
  cart: CartItem[];
  cartTotal: number;
  cartStatus: string;
  promoApplied: string | null;
}

/**
 * Get or create an active conversation session for a business + phone.
 */
export async function getOrCreateSession(
  businessId: string,
  phoneNumber: string
): Promise<ConversationContext> {
  let session = await db.conversationSession.findFirst({
    where: { businessId, phoneNumber, status: "active" },
    include: {
      messages: { orderBy: { timestamp: "asc" } },
      cart: true,
    },
  });

  if (!session) {
    session = await db.conversationSession.create({
      data: { businessId, phoneNumber, status: "active" },
      include: { messages: true, cart: true },
    });
  }

  return sessionToContext(session);
}

/**
 * Load the full conversation context from DB.
 */
export async function loadContext(
  businessId: string,
  phoneNumber: string
): Promise<ConversationContext> {
  return getOrCreateSession(businessId, phoneNumber);
}

/**
 * Add a message to the conversation and return the updated context.
 */
export async function addMessage(
  sessionId: string,
  role: "client" | "bot" | "system",
  text: string,
  intent?: string,
  entities?: Record<string, string>
): Promise<void> {
  await db.conversationMessage.create({
    data: {
      sessionId,
      role,
      text,
      intent: intent || null,
      entitiesJson: JSON.stringify(entities || {}),
    },
  });
  await db.conversationSession.update({
    where: { id: sessionId },
    data: { updatedAt: new Date() },
  });
}

/**
 * Save the pending intent + partial entities (when waiting for client input).
 */
export async function setPendingIntent(
  sessionId: string,
  intent: string | null,
  entities: Record<string, string>
): Promise<void> {
  await db.conversationSession.update({
    where: { id: sessionId },
    data: {
      pendingIntent: intent,
      pendingEntitiesJson: JSON.stringify(entities),
    },
  });
}

/**
 * Clear the pending intent (intent resolved).
 */
export async function clearPendingIntent(sessionId: string): Promise<void> {
  await db.conversationSession.update({
    where: { id: sessionId },
    data: { pendingIntent: null, pendingEntitiesJson: "{}" },
  });
}

/**
 * Close a conversation session.
 */
export async function closeSession(sessionId: string): Promise<void> {
  await db.conversationSession.update({
    where: { id: sessionId },
    data: { status: "closed" },
  });
}

// ─── Cart operations ─────────────────────────────────────────────────

/**
 * Get or create a cart for the session.
 */
export async function getOrCreateCart(sessionId: string, businessId: string): Promise<{ id: string; items: CartItem[]; status: string; total: number; promo: string | null }> {
  let cart = await db.cart.findUnique({ where: { sessionId } });
  if (!cart) {
    cart = await db.cart.create({ data: { sessionId, businessId } });
  }
  return {
    id: cart.id,
    items: safeParseItems(cart.itemsJson),
    status: cart.status,
    total: cart.total,
    promo: cart.promoApplied,
  };
}

export async function saveCartItems(cartId: string, items: CartItem[]): Promise<{ total: number; count: number }> {
  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  await db.cart.update({
    where: { id: cartId },
    data: { itemsJson: JSON.stringify(items), total, updatedAt: new Date() },
  });
  return { total, count: items.reduce((s, i) => s + i.qty, 0) };
}

export async function clearCart(cartId: string): Promise<void> {
  await db.cart.update({
    where: { id: cartId },
    data: { itemsJson: "[]", total: 0, promoApplied: null, promoDiscount: 0, status: "open", updatedAt: new Date() },
  });
}

export async function setCartStatus(cartId: string, status: string): Promise<void> {
  await db.cart.update({ where: { id: cartId }, data: { status, updatedAt: new Date() } });
}

export async function applyPromo(cartId: string, code: string, discount: number): Promise<void> {
  await db.cart.update({
    where: { id: cartId },
    data: { promoApplied: code, promoDiscount: discount, updatedAt: new Date() },
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────

function sessionToContext(session: {
  id: string; businessId: string; phoneNumber: string;
  pendingIntent: string | null; pendingEntitiesJson: string;
  messages: Array<{ role: string; text: string; intent: string | null; timestamp: Date }>;
  cart: { itemsJson: string; total: number; status: string; promoApplied: string | null } | null;
}): ConversationContext {
  return {
    sessionId: session.id,
    businessId: session.businessId,
    phoneNumber: session.phoneNumber,
    pendingIntent: session.pendingIntent,
    pendingEntities: safeJsonParse(session.pendingEntitiesJson, {}),
    history: session.messages.map((m) => ({
      role: m.role as "client" | "bot" | "system",
      text: m.text,
      intent: m.intent || undefined,
      timestamp: m.timestamp.toISOString(),
    })),
    cart: session.cart ? safeParseItems(session.cart.itemsJson) : [],
    cartTotal: session.cart?.total || 0,
    cartStatus: session.cart?.status || "open",
    promoApplied: session.cart?.promoApplied || null,
  };
}

function safeParseItems(json: string): CartItem[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function safeJsonParse<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}
