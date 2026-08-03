/**
 * PayFlow SMT — Universal Intent Detector
 *
 * Detecta intenciones por SIGNIFICADO (no keywords exactas).
 * - Normaliza el mensaje (sin acentos, minúsculas, sinónimos)
 * - Compara contra los synonyms de cada intención de la biblioteca
 * - Extrae entities (productos, cantidades, precios, selectores)
 * - Detecta ambigüedad (producto no encontrado o múltiple match)
 *
 * Funciona para cualquier sector (8 sectores del Excel + universal).
 * Si la IA real está configurada, se puede usar para clasificación semántica.
 */

import { ALL_INTENTS, type IntentDefinition } from "./intent-library";
import type { CartItem } from "./conversation-manager";

export interface IntentMatch {
  intent: string;
  confidence: number; // 0.0 - 1.0
  entities: Record<string, string>;
  missingEntities: string[];
  ambiguousProducts?: string[]; // productos que no se encontraron o son ambiguos
}

/**
 * Normalize text: lowercase, no accents, no extra spaces.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar acentos
    .replace(/[^\w\s$#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detect the best matching intent for a client message.
 * Uses the conversation history to resolve context-dependent intents
 * (e.g., "quita el producto 2" needs the cart context).
 */
export function detectIntent(
  message: string,
  context?: { cart?: CartItem[]; pendingIntent?: string | null; pendingEntities?: Record<string, string> }
): IntentMatch | null {
  const msg = normalize(message);
  if (!msg) return null;

  // ─── Priority 1: Pending intent resolution ────────────────────────
  // If there's a pending intent waiting for entities, treat this message
  // as the answer to that pending intent.
  if (context?.pendingIntent) {
    const pendingDef = ALL_INTENTS.find((i) => i.intent === context.pendingIntent);
    if (pendingDef) {
      const entities = extractEntities(msg, pendingDef, context);
      const missing = pendingDef.entities.filter((e) => !entities[e] && pendingDef.responsePolicy.mustAskFor.includes(e));
      if (missing.length === 0 || Object.keys(entities).length > 0) {
        return {
          intent: context.pendingIntent,
          confidence: 0.9,
          entities: { ...context.pendingEntities, ...entities },
          missingEntities: missing,
        };
      }
    }
  }

  // ─── Priority 2: Cart commands (checked first — most contextual) ──
  const cartMatch = detectCartIntent(msg, context);
  if (cartMatch && cartMatch.confidence >= 0.5) {
    return cartMatch;
  }

  // ─── Priority 3: Catalog/promo management (admin) ─────────────────
  const manageMatch = detectManageIntent(msg);
  if (manageMatch && manageMatch.confidence >= 0.5) {
    return manageMatch;
  }

  // ─── Priority 4: General intents from the library (100 intents) ───
  let bestMatch: IntentMatch | null = null;
  let bestScore = 0;
  for (const def of ALL_INTENTS) {
    const score = scoreIntent(msg, def);
    if (score > bestScore) {
      bestScore = score;
      const entities = extractEntities(msg, def, context);
      const missing = def.entities.filter((e) => !entities[e] && def.responsePolicy.mustAskFor.includes(e));
      bestMatch = {
        intent: def.intent,
        confidence: score,
        entities,
        missingEntities: missing,
      };
    }
  }

  if (bestMatch && bestScore >= 0.3) {
    return bestMatch;
  }

  // ─── Fallback: no intent detected ─────────────────────────────────
  return null;
}

/**
 * Score an intent against the message by counting synonym overlaps.
 */
function scoreIntent(msg: string, def: IntentDefinition): number {
  let score = 0;
  const msgWords = msg.split(" ");
  for (const syn of def.synonyms) {
    const synNorm = normalize(syn);
    if (msg.includes(synNorm)) {
      score += synNorm.length > 4 ? 0.3 : 0.15;
    }
    // Partial word match
    if (synNorm.length > 4) {
      for (const w of msgWords) {
        if (w.length > 3 && (w.includes(synNorm) || synNorm.includes(w))) {
          score += 0.1;
          break;
        }
      }
    }
  }
  return Math.min(score, 1.0);
}

/**
 * Detect cart-specific intents with high precision.
 */
function detectCartIntent(msg: string, context?: { cart?: CartItem[] }): IntentMatch | null {
  // Confirmar pedido
  if (/\b(confirmar|confirmo|confirma|ya esta|ya está|listo|proceder|checkout|finalizar|si eso|sí eso)\b/.test(msg)) {
    return { intent: "#CARRITO_CONFIRMAR_PEDIDO", confidence: 0.9, entities: {}, missingEntities: [] };
  }
  // Cancelar pedido
  if (/\b(cancelar|cancelo|no quiero nada|olvida|dejar|abortar)\b/.test(msg)) {
    return { intent: "#CARRITO_CANCELAR_PEDIDO", confidence: 0.9, entities: {}, missingEntities: [] };
  }
  // Consultar total
  if (/\b(total|cuanto llevo|cuánto llevo|cuanto es|cuánto es|a cuanto|a cuánto|subtotal|cuanto debo|cuánto debo)\b/.test(msg)) {
    return { intent: "#CARRITO_CONSULTAR_TOTAL", confidence: 0.9, entities: {}, missingEntities: [] };
  }
  // Consultar carrito
  if (/\b(carrito|que llevo|qué llevo|mi pedido|mi orden|que pedí|qué pedí)\b/.test(msg)) {
    return { intent: "#CARRITO_CONSULTAR", confidence: 0.85, entities: {}, missingEntities: [] };
  }
  // Ver menú
  if (/\b(menu|menú|carta|ver opciones|ver productos|mostrar menu|mostrar menú|ver catálogo|ver catalogo|que tienen|qué tienen|muestrame|muéstrame)\b/.test(msg)) {
    return { intent: "#CARRITO_VER_MENU", confidence: 0.85, entities: {}, missingEntities: [] };
  }
  // Nuevo pedido (limpiar carrito)
  if (/\b(nuevo pedido|empezar de nuevo|limpiar carrito|vaciar carrito|borrar todo|nueva orden)\b/.test(msg)) {
    return { intent: "#CARRITO_NUEVO_PEDIDO", confidence: 0.9, entities: {}, missingEntities: [] };
  }
  // Modificar cantidad
  if (/\b(cantidad|cambia la cantidad|ponle|sube a|baja a|dame mas|dame menos|cambia cantidad)\b/.test(msg)) {
    const qty = extractQuantity(msg);
    const idx = extractIndex(msg);
    return {
      intent: "#CARRITO_MODIFICAR_CANTIDAD",
      confidence: 0.85,
      entities: { cantidad: String(qty), producto_o_indice: String(idx || "") },
      missingEntities: qty ? [] : ["cantidad"],
    };
  }
  // Reemplazar
  if (/\b(cambia|reemplaza|cambio|en vez de|sustituye)\b/.test(msg) && /\b(por|por el|por la)\b/.test(msg)) {
    return { intent: "#CARRITO_REEMPLAZAR", confidence: 0.7, entities: {}, missingEntities: ["producto_viejo", "producto_nuevo"] };
  }
  // Quitar producto
  if (/\b(quita|elimina|saca|remueve|borra|no quiero)\b/.test(msg)) {
    const idx = extractIndex(msg);
    return {
      intent: "#CARRITO_QUITAR",
      confidence: 0.85,
      entities: idx ? { producto_o_indice: String(idx) } : {},
      missingEntities: idx ? [] : ["producto_o_indice"],
    };
  }
  // Agregar producto (con cantidades)
  if (/\b(quiero|agrega|añade|dame|llévame|ponme|para llevar|uno|dos|tres|cuatro|cinco)\b/.test(msg)) {
    const qty = extractQuantity(msg);
    const products = extractProductNames(msg);
    if (products.length > 0) {
      return {
        intent: products.length > 1 ? "#CARRITO_AGREGAR_MULTIPLE" : "#CARRITO_AGREGAR",
        confidence: 0.8,
        entities: { productos: products.join(", "), cantidades: String(qty) },
        missingEntities: [],
      };
    }
    return {
      intent: "#CARRITO_AGREGAR",
      confidence: 0.5,
      entities: {},
      missingEntities: ["productos"],
    };
  }
  // Seleccionar por número/código/letra
  if (/^(el|la|opcion|opción|número|numero|código|codigo|letra)\s+([a-z0-9]+)$/i.test(msg) || /^[a-z]$/i.test(msg) || /^\d+$/.test(msg)) {
    const selector = msg.match(/([a-z0-9]+)$/i)?.[1] || msg;
    return {
      intent: "#CARRITO_SELECCIONAR_NUMERO",
      confidence: 0.75,
      entities: { selector },
      missingEntities: [],
    };
  }
  return null;
}

/**
 * Detect catalog/promo management intents (admin).
 */
function detectManageIntent(msg: string): IntentMatch | null {
  if (/\b(agrega producto|nuevo producto|crea producto|añade producto|dar de alta)\b/.test(msg)) {
    return { intent: "#CATALOGO_AGREGAR", confidence: 0.8, entities: {}, missingEntities: ["nombre", "precio"] };
  }
  if (/\b(elimina producto|quita producto|desactiva producto|borra producto)\b/.test(msg)) {
    return { intent: "#CATALOGO_ELIMINAR", confidence: 0.8, entities: {}, missingEntities: ["nombre_o_id"] };
  }
  if (/\b(cambia precio|modifica precio|nuevo precio|actualiza precio)\b/.test(msg)) {
    return { intent: "#CATALOGO_MODIFICAR_PRECIO", confidence: 0.8, entities: {}, missingEntities: ["nombre_o_id", "precio"] };
  }
  if (/\b(crea promocion|crea promoción|nueva promo|crear descuento|lanzar oferta)\b/.test(msg)) {
    return { intent: "#PROMO_CREAR", confidence: 0.8, entities: {}, missingEntities: ["nombre", "tipo", "valor"] };
  }
  if (/\b(ver promociones|lista promos|promociones activas|ofertas activas)\b/.test(msg)) {
    return { intent: "#PROMO_LISTAR", confidence: 0.8, entities: {}, missingEntities: [] };
  }
  return null;
}

// ─── Entity extraction helpers ───────────────────────────────────────

function extractQuantity(msg: string): number {
  const wordNums: Record<string, number> = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, media: 0.5, medio: 0.5 };
  for (const [word, num] of Object.entries(wordNums)) {
    if (new RegExp(`\\b${word}\\b`).test(msg)) return num;
  }
  const numMatch = msg.match(/(\d+(?:\.\d+)?)/);
  return numMatch ? parseFloat(numMatch[1]) : 1;
}

function extractIndex(msg: string): number | null {
  const m = msg.match(/\b(producto\s+)?(\d+)\b/);
  return m ? parseInt(m[2], 10) : null;
}

function extractProductNames(msg: string): string[] {
  // Split by " y " or "," FIRST (before removing stopwords), then clean each part.
  const parts = msg.split(/\s+y\s+|,/);
  const names: string[] = [];
  for (const part of parts) {
    const cleaned = part
      .replace(/\b(quiero|agrega|añade|dame|llévame|ponme|para llevar|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|con|más|mas|también|ademas|además|una|un|la|el|las|los|del|de|por|favor|por favor|hola|buenas|buenos)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length > 2 && !/^\d+$/.test(cleaned)) {
      names.push(cleaned);
    }
  }
  return names;
}

function extractEntities(
  msg: string,
  def: IntentDefinition,
  context?: { cart?: CartItem[] }
): Record<string, string> {
  const entities: Record<string, string> = {};
  for (const entityName of def.entities) {
    if (entityName === "cantidad" || entityName === "cantidades") {
      const q = extractQuantity(msg);
      if (q) entities[entityName] = String(q);
    } else if (entityName === "producto_o_indice" || entityName === "indice") {
      const idx = extractIndex(msg);
      if (idx) entities[entityName] = String(idx);
    } else if (entityName === "productos" || entityName === "producto") {
      const names = extractProductNames(msg);
      if (names.length > 0) entities[entityName] = names.join(", ");
    } else if (entityName === "precio") {
      const m = msg.match(/\$?\s*(\d+(?:[.,]\d{1,2})?)/);
      if (m) entities[entityName] = m[1].replace(",", ".");
    } else if (entityName === "selector") {
      const m = msg.match(/([a-z0-9]+)$/i);
      if (m) entities[entityName] = m[1];
    }
  }
  return entities;
}

/**
 * Check if a product name is ambiguous or not found in the knowledge base.
 */
export function checkProductAmbiguity(
  productName: string,
  catalog: Array<{ name: string; id: string }>
): { found: boolean; matches: Array<{ id: string; name: string }>; ambiguous: boolean } {
  const norm = normalize(productName);
  const matches = catalog.filter((p) => normalize(p.name).includes(norm) || norm.includes(normalize(p.name)));
  if (matches.length === 0) {
    return { found: false, matches: [], ambiguous: false };
  }
  if (matches.length === 1) {
    return { found: true, matches, ambiguous: false };
  }
  return { found: true, matches, ambiguous: true };
}
