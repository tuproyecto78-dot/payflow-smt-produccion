import {
  processKnowledgeSource as processBaseKnowledgeSource,
  mergeDetectedKnowledge,
  formatDetectedKnowledgeForPrompt,
  type KnowledgeSource,
  type KnowledgeSourceType,
  type DetectedKnowledge,
  type DetectedProduct,
  type DetectedService,
  type DetectedFaq,
  type DetectedBusinessHour,
  type ProcessResult,
} from "./knowledge-processor";

export type {
  KnowledgeSource,
  KnowledgeSourceType,
  DetectedKnowledge,
  DetectedProduct,
  DetectedService,
  DetectedFaq,
  DetectedBusinessHour,
  ProcessResult,
};

export { mergeDetectedKnowledge, formatDetectedKnowledgeForPrompt };

const HEADER_ALIASES: Array<[RegExp, string]> = [
  [/^(plato|men[uú]|bebida|combo|entrada|postre|comida|producto\/servicio)$/i, "Producto"],
  [/^(valor|pvp|tarifa|precio unitario|precio venta)$/i, "Precio"],
  [/^(existencia|existencias|unidades|disponible|disponibilidad)$/i, "Stock"],
  [/^(familia|secci[oó]n|grupo|l[ií]nea)$/i, "Categoría"],
  [/^(ingredientes|contenido|observaci[oó]n|observaciones)$/i, "Descripción"],
  [/^(c[oó]digo producto|c[oó]digo plato|referencia)$/i, "SKU"],
];

function normalizeHeader(header: string): string {
  const cleaned = header.replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of HEADER_ALIASES) {
    if (pattern.test(cleaned)) return replacement;
  }
  return cleaned;
}

function normalizeStructuredSource(source: KnowledgeSource): KnowledgeSource {
  if ((source.type !== "excel" && source.type !== "csv") || !Array.isArray(source.headers)) {
    return source;
  }

  const originalHeaders = source.headers.map(String);
  let normalizedHeaders = originalHeaders.map(normalizeHeader);

  const hasName = normalizedHeaders.some((header) =>
    /product|nombre|art[ií]culo|item|servicio/i.test(header)
  );
  const hasPrice = normalizedHeaders.some((header) => /precio|price|monto|costo/i.test(header));

  // Menus frequently use an arbitrary first column such as "Detalle del plato".
  // When a price column exists but no explicit name column was found, the first
  // non-price/non-stock textual column becomes the product name.
  if (!hasName && hasPrice) {
    const candidate = normalizedHeaders.findIndex((header) =>
      header && !/precio|price|monto|costo|stock|cantidad|inventario|sku|c[oó]digo|categor/i.test(header)
    );
    if (candidate >= 0) normalizedHeaders[candidate] = "Producto";
  }

  // Avoid duplicate object keys after aliasing.
  const counts = new Map<string, number>();
  normalizedHeaders = normalizedHeaders.map((header, index) => {
    const base = header || `columna_${index + 1}`;
    const key = base.toLowerCase();
    const count = counts.get(key) || 0;
    counts.set(key, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });

  const rows = Array.isArray(source.rows)
    ? source.rows.map((row) => {
        const normalized: Record<string, string> = {};
        originalHeaders.forEach((original, index) => {
          normalized[normalizedHeaders[index]] = String(row[original] ?? "").trim();
        });
        return normalized;
      })
    : source.rows;

  const rawText = rows
    ? [
        normalizedHeaders.join("\t"),
        ...rows.map((row) => normalizedHeaders.map((header) => row[header] || "").join("\t")),
      ].join("\n")
    : source.rawText;

  return { ...source, headers: normalizedHeaders, rows, rawText };
}

export function processKnowledgeSource(source: KnowledgeSource): ProcessResult {
  return processBaseKnowledgeSource(normalizeStructuredSource(source));
}
