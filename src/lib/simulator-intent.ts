export type SimulatorIntent =
  | "greeting"
  | "catalog"
  | "promotion"
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

const PROMOTION_TERMS = [
  "promoción",
  "promocion",
  "promociones",
  "descuento",
  "descuentos",
  "oferta",
  "ofertas",
];

const CATALOG_TERMS = [
  "menú",
  "menu",
  "carta",
  "plato",
  "platos",
  "producto",
  "productos",
  "precio",
  "precios",
  "qué tienen",
  "que tienen",
  "qué hay",
  "que hay",
  "disponible",
  "disponibles",
];

const BUY_TERMS = [
  "quiero pedir",
  "quiero comprar",
  "quiero ordenar",
  "hacer pedido",
  "realizar pedido",
  "deseo pedir",
  "deseo comprar",
  "cómo pago",
  "como pago",
  "link de pago",
];

const GREETINGS = [
  "hola",
  "buenas",
  "buenos días",
  "buenos dias",
  "buenas tardes",
  "buenas noches",
  "saludos",
];

export function detectSimulatorIntent(message: string): SimulatorIntent {
  const text = message.toLocaleLowerCase("es").trim();
  if (!text) return "greeting";

  // Data intents take precedence so “Hola, ¿qué platos tienen?” still
  // consults the catalog, while a plain “Hola” remains database-free.
  if (PROMOTION_TERMS.some((term) => text.includes(term))) return "promotion";
  if (CATALOG_TERMS.some((term) => text.includes(term))) return "catalog";
  if (BUY_TERMS.some((term) => text.includes(term))) return "buy";
  if (GREETINGS.some((term) => text === term || text.startsWith(`${term} `))) {
    return "greeting";
  }
  return "other";
}

export function getSimulatorDataNeeds(
  intent: SimulatorIntent
): SimulatorDataNeeds {
  return {
    catalog: intent === "catalog",
    promotions: intent === "promotion",
  };
}

export function formatSimulatorCatalog(
  products: SimulatorCatalogItem[]
): string {
  if (products.length === 0) {
    return "No hay productos activos cargados en el catálogo.";
  }

  const lines = products.map((product) => {
    const stock = product.trackInventory
      ? product.stock > 0
        ? `stock ${product.stock}`
        : "sin stock"
      : "stock no controlado";
    const detail = [product.category, product.description]
      .filter(Boolean)
      .join(" · ");
    return `- ${product.name}: ${product.price.toFixed(2)} ${
      product.currency
    } · ${stock}${detail ? ` · ${detail}` : ""}`;
  });

  return `Estos son los productos disponibles:\n${lines.join("\n")}`;
}

export function formatSimulatorPromotions(promotions: string): string {
  const value = promotions.trim();
  return value
    ? `Estas son las promociones vigentes:\n${value}`
    : "No hay promociones vigentes cargadas.";
}
