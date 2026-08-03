/**
 * PayFlow SMT — Catalog Parser (natural language → catalog actions)
 *
 * Parses admin messages to add/remove/modify products and promotions.
 * Admin-only: los clientes NO pueden usar estas acciones.
 *
 * Ejemplos:
 *   "Agrega Pizza margarita a $8.50 en categoría Pizzas"
 *   "Elimina la lasaña del menú"
 *   "Cambia el precio de la hamburguesa a $6"
 *   "Crea promoción 2x1 en pizzas este finde"
 */
import { db } from "@/lib/db";

export interface CatalogAction {
  action: "add_product" | "remove_product" | "update_price" | "update_description" | "create_promo" | "list_promos";
  productName?: string;
  price?: number;
  currency?: string;
  category?: string;
  description?: string;
  promoName?: string;
  promoType?: string;
  promoValue?: number;
}

/**
 * Parse an admin message into a catalog action.
 */
export function parseCatalogCommand(message: string): CatalogAction | null {
  const msg = message.toLowerCase().trim();

  // Add product: "agrega pizza margarita a $8.50 en categoría pizzas"
  if (/\b(agrega|añade|crea|nuevo)\b.*\b(producto|al menu|al menú|al catálogo|al catalogo)\b/.test(msg) ||
      /\b(agrega|añade)\b/.test(msg) && /\$/.test(msg)) {
    const nameMatch = message.match(/(?:agrega|añade|crea)\s+(.+?)\s+(?:a|por|con)\s+\$/i);
    const priceMatch = message.match(/\$\s*(\d+(?:[.,]\d{1,2})?)/);
    const catMatch = message.match(/(?:categoría|categoria|categoria)\s+([\wáéíóú\s]+)/i);
    return {
      action: "add_product",
      productName: nameMatch?.[1]?.trim() || "",
      price: priceMatch ? parseFloat(priceMatch[1].replace(",", ".")) : undefined,
      currency: "USD",
      category: catMatch?.[1]?.trim() || "general",
    };
  }

  // Remove product: "elimina la lasaña del menú"
  if (/\b(elimina|quita|desactiva|borra)\b.*\b(producto|del menu|del menú|del catálogo|del catalogo)\b/.test(msg) ||
      /\b(elimina|quita|borra)\b/.test(msg) && /\b(del|la|el)\b/.test(msg)) {
    const nameMatch = message.match(/(?:elimina|quita|desactiva|borra)\s+(?:el|la|los|las)?\s*(.+?)\s+(?:del|de la|de)/i);
    const simpleMatch = message.match(/(?:elimina|quita|desactiva|borra)\s+(?:el|la)?\s*(.+)/i);
    return {
      action: "remove_product",
      productName: (nameMatch?.[1] || simpleMatch?.[1] || "").trim(),
    };
  }

  // Update price: "cambia el precio de la hamburguesa a $6"
  if (/\b(cambia|modifica|actualiza)\b.*\bprecio\b/.test(msg)) {
    const nameMatch = message.match(/(?:de|del|la|el)\s+(.+?)\s+(?:a|por)\s+\$/i);
    const priceMatch = message.match(/\$\s*(\d+(?:[.,]\d{1,2})?)/);
    return {
      action: "update_price",
      productName: nameMatch?.[1]?.trim() || "",
      price: priceMatch ? parseFloat(priceMatch[1].replace(",", ".")) : undefined,
    };
  }

  // Update description: "cambia la descripción de la ensalada a ..."
  if (/\b(cambia|modifica|actualiza)\b.*\bdescripción|descripcion\b/.test(msg)) {
    const nameMatch = message.match(/(?:de|del|la|el)\s+(.+?)\s+(?:a|por)\s+/i);
    const descMatch = message.match(/(?:a|por)\s+(.+)/i);
    return {
      action: "update_description",
      productName: nameMatch?.[1]?.trim() || "",
      description: descMatch?.[1]?.trim() || "",
    };
  }

  // Create promo: "crea promoción 2x1 en pizzas"
  if (/\b(crea|nueva|crear|lanzar)\b.*\b(promoción|promocion|promo|descuento|oferta)\b/.test(msg)) {
    const is2x1 = /2x1|2 por 1/.test(msg);
    const isPercent = /(\d+)\s*%/.test(msg);
    const percentMatch = msg.match(/(\d+)\s*%/);
    const catMatch = message.match(/(?:en|para)\s+([\wáéíóú\s]+)/i);
    return {
      action: "create_promo",
      promoName: message.match(/(?:promoción|promocion|promo|descuento|oferta)\s+(.+?)(?:\s+(?:en|para|de)|$)/i)?.[1]?.trim() || "Promoción",
      promoType: is2x1 ? "2x1" : isPercent ? "percentage" : "fixed_amount",
      promoValue: is2x1 ? 0 : isPercent ? parseInt(percentMatch?.[1] || "0", 10) : 0,
      category: catMatch?.[1]?.trim(),
    };
  }

  // List promos: "ver promociones"
  if (/\b(ver|lista|listar|mostrar)\b.*\b(promociones|promos|ofertas)\b/.test(msg)) {
    return { action: "list_promos" };
  }

  return null;
}

/**
 * Execute a catalog action (admin only). Modifies the knowledge base.
 */
export async function executeCatalogAction(
  action: CatalogAction,
  businessId: string
): Promise<{ ok: boolean; message: string; productId?: string }> {
  // Find the knowledge base for this business
  const base = await db.knowledgeBase.findUnique({ where: { businessId } });
  if (!base) {
    return { ok: false, message: "No hay base de conocimiento para este negocio." };
  }

  switch (action.action) {
    case "add_product": {
      if (!action.productName || action.price === undefined) {
        return { ok: false, message: "Necesito nombre y precio del producto." };
      }
      const p = await db.knowledgeProduct.create({
        data: {
          knowledgeBaseId: base.id,
          name: action.productName,
          price: action.price,
          currency: action.currency || "USD",
          category: action.category || "general",
          description: action.description || "",
        },
      });
      return { ok: true, message: `Producto "${action.productName}" agregado al catálogo.`, productId: p.id };
    }
    case "remove_product": {
      if (!action.productName) {
        return { ok: false, message: "Necesito el nombre del producto a eliminar." };
      }
      const existing = await db.knowledgeProduct.findFirst({
        where: { knowledgeBaseId: base.id, name: { contains: action.productName } },
      });
      if (!existing) {
        return { ok: false, message: `No encontré el producto "${action.productName}".` };
      }
      await db.knowledgeProduct.update({ where: { id: existing.id }, data: { active: false } });
      return { ok: true, message: `Producto "${existing.name}" desactivado del catálogo.`, productId: existing.id };
    }
    case "update_price": {
      if (!action.productName || action.price === undefined) {
        return { ok: false, message: "Necesito nombre y nuevo precio." };
      }
      const existing = await db.knowledgeProduct.findFirst({
        where: { knowledgeBaseId: base.id, name: { contains: action.productName } },
      });
      if (!existing) {
        return { ok: false, message: `No encontré el producto "${action.productName}".` };
      }
      await db.knowledgeProduct.update({ where: { id: existing.id }, data: { price: action.price } });
      return { ok: true, message: `Precio de "${existing.name}" actualizado a ${action.price.toFixed(2)}.`, productId: existing.id };
    }
    case "update_description": {
      if (!action.productName || !action.description) {
        return { ok: false, message: "Necesito nombre y descripción nueva." };
      }
      const existing = await db.knowledgeProduct.findFirst({
        where: { knowledgeBaseId: base.id, name: { contains: action.productName } },
      });
      if (!existing) {
        return { ok: false, message: `No encontré el producto "${action.productName}".` };
      }
      await db.knowledgeProduct.update({ where: { id: existing.id }, data: { description: action.description } });
      return { ok: true, message: `Descripción de "${existing.name}" actualizada.`, productId: existing.id };
    }
    case "create_promo": {
      if (!action.promoName || !action.promoType) {
        return { ok: false, message: "Necesito nombre y tipo de promoción." };
      }
      const endsAt = new Date();
      endsAt.setDate(endsAt.getDate() + 7); // default 7 días
      const promo = await db.promotion.create({
        data: {
          businessId,
          name: action.promoName,
          type: action.promoType,
          value: action.promoValue || 0,
          productCategory: action.category || null,
          endsAt,
        },
      });
      return { ok: true, message: `Promoción "${action.promoName}" creada.` };
    }
    case "list_promos": {
      const promos = await db.promotion.findMany({
        where: { businessId, active: true, endsAt: { gt: new Date() } },
      });
      if (promos.length === 0) {
        return { ok: true, message: "No hay promociones activas." };
      }
      const list = promos.map((p) => `• ${p.name} (${p.type}${p.value ? ` ${p.value}` : ""})`).join("\n");
      return { ok: true, message: `Promociones activas:\n${list}` };
    }
    default:
      return { ok: false, message: "Acción no reconocida." };
  }
}
