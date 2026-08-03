import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  mergeDetectedKnowledge,
  processKnowledgeSource,
} from "../src/lib/knowledge-processor.ts";

test("extracts products, prices, categories, promotions, policies and notes", () => {
  const table = processKnowledgeSource({
    source_id: "sheet",
    type: "csv",
    name: "catalog.csv",
    headers: ["Producto", "Precio", "Categoría"],
    rows: [{ Producto: "Café", Precio: "$2.50", Categoría: "Bebidas" }],
  });
  const image = processKnowledgeSource({
    source_id: "image",
    type: "image",
    name: "menu.png",
    rawText: [
      "Promoción: 2x1 los martes",
      "Política: cambios hasta 7 días",
      "Nota: sujeto a disponibilidad",
    ].join("\n"),
  });
  const merged = mergeDetectedKnowledge([table, image]);

  assert.deepEqual(merged.products[0], {
    name: "Café",
    price: 2.5,
    category: "Bebidas",
  });
  assert.equal(merged.promotions[0], "2x1 los martes");
  assert.equal(merged.policies[0], "cambios hasta 7 días");
  assert.equal(merged.notes[0], "sujeto a disponibilidad");
});

test("catalog review is disabled by default and supports all authorized formats", async () => {
  const dialog = await readFile(new URL("../src/components/dashboard/flexible-onboarding-dialog.tsx", import.meta.url), "utf8");
  const wrapper = await readFile(new URL("../src/components/dashboard/persistent-onboarding-wrapper.tsx", import.meta.url), "utf8");

  assert.match(dialog, /new Set\(\["pdf", "xlsx", "xls", "csv", "txt", "jpg", "jpeg", "png"\]\)/);
  assert.match(dialog, /useState\(false\)/);
  assert.doesNotMatch(dialog, /setModules\(\(current\) => \(\{ \.\.\.current, usesCatalog: true \}\)\)/);
  assert.match(wrapper, /body\.knowledgeSources = activationApproved \? sourcesRef\.current : \[\]/);
  assert.match(wrapper, /body\.detectedKnowledge = activationApproved/);
});
