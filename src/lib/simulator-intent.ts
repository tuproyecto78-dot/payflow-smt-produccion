export type SimulatorIntent =
  | "greeting"
  | "catalog"
  | "catalog_full"
  | "recommendation"
  | "promotion"
  | "payment"
  | "buy"
  | "other";

export type SimulatorDataNeeds = {
  catalog: boolean;
  promotions: boolean;
};

export type SimulatorCatalogItem = {
  name: string;
  description?: string;
  price: number;
  currency: string;
  stock: number;
  trackInventory: boolean;
  category?: string;
};

const FULL_CATALOG_TERMS = [
  "catalogo completo",
  "menu completo",
  "carta completa",
  "todos los productos",
  "todas las opciones",
  "todo el catalogo",
  "todo el menu",
  "toda la carta",
  "muestrame todo",
  "ver todo",
];

const RECOMMENDATION_TERMS = [
  "recomienda",
  "recomendacion",
  "recomendaciones",
  "que me recomiendas",
  "que recomiendan",
  "sugerencia",
  "sugerencias",
  "que me sugieres",
  "mejor opcion",
  "opciones recomendadas",
  "que deberia elegir",
  "que puedo pedir",
];

const PROMOTION_TERMS = [
  "promocion",
  "promociones",
  "descuento",
  "descuentos",
  "oferta",
  "ofertas",
];

const PAYMENT_TERMS = [
  "pago",
  "pagos",
  "formas de pago",
  "forma de pago",
  "metodo de pago",
  "metodos de pago",
  "aceptan tarjeta",
  "tarjeta",
  "transferencia",
  "link de pago",
  "como pago",
];

const BUY_TERMS = [
  "quiero pedir",
  "quiero comprar",
  "quiero ordenar",
  "hacer pedido",
  "realizar pedido",
  "deseo pedir",
  "deseo comprar",
];

const CATALOG_TERMS = [
  "catalogo",
  "menu",
  "carta",
  "plato",
  "platos",
  "producto",
  "productos",
  "precio",
  "precios",
  "que tienen",
  "que hay",
  "disponible",
  "disponibles",
];

const GREETINGS = [
  "hola",
  "buenas",
  "buenos dias",
  "buenas tardes",
  "buenas noches",
  "saludos",
];

function normalizeIntentText(value: string): string {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectSimulatorIntent(message: string): SimulatorIntent {
  const text = normalizeIntentText(message);
  if (!text) return "greeting";

  // The most specific commercial intents must win over generic words such as
  // “producto” or “plato”.
  if (FULL_CATALOG_TERMS.some((term) => text.includes(term))) return "catalog_full";
  if (RECOMMENDATION_TERMS.some((term) => text.includes(term))) {
    return "recommendation";
  }
  if (PROMOTION_TERMS.some((term) => text.includes(term))) return "promotion";
  if (PAYMENT_TERMS.some((term) => text.includes(term))) return "payment";
  if (BUY_TERMS.some((term) => text.includes(term))) return "buy";
  if (CATALOG_TERMS.some((term) => text.includes(term))) return "catalog";
  if (GREETINGS.some((term) => text === term || text.startsWith(`${term} `))) {
    return "greeting";
  }
  return "other";
}

export function getSimulatorDataNeeds(
  intent: SimulatorIntent
): SimulatorDataNeeds {
  return {
    catalog:
      intent === "catalog" ||
      intent === "catalog_full" ||
      intent === "recommendation",
    promotions: intent === "promotion",
  };
}

export function formatSimulatorCatalog(
  products: SimulatorCatalogItem[]
): string {
  const visible = products
    .filter((product) => product.price > 0)
    .filter((product) => !product.trackInventory || product.stock > 0)
    .slice(0, 5);

  if (visible.length === 0) {
    return "No hay productos con precio disponibles en este momento.";
  }

  const lines = visible.map(
    (product) => `• ${product.name} — ${product.price.toFixed(2)} ${product.currency}`
  );

  return `Estas son algunas opciones:\n${lines.join(
    "\n"
  )}\n¿Buscas algo específico o te muestro el catálogo completo?`;
}

export function formatSimulatorPromotions(promotions: string): string {
  const value = promotions.trim();
  return value
    ? `Promociones vigentes:\n${value}\n¿Te interesa alguna?`
    : "Hoy no hay promociones registradas, pero puedo sugerirte opciones según tu presupuesto. ¿Qué buscas?";
}
