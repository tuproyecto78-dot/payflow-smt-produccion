"use client";

export interface ExtractedFileContent {
  source_id: string;
  type: "pdf" | "excel" | "csv" | "txt" | "manual";
  name: string;
  rawText?: string;
  rows?: Record<string, string>[];
  headers?: string[];
}

const HEADER_WORDS = /producto|plato|menu|menú|nombre|item|art[ií]culo|bebida|combo|servicio|precio|price|costo|valor|stock|cantidad|categor[ií]a|descripci[oó]n|detalle|promoci[oó]n|d[ií]a|horario/i;

function cleanCell(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).replace(/\s+/g, " ").trim();
}

function uniqueHeaders(values: unknown[]): string[] {
  const used = new Map<string, number>();
  return values.map((value, index) => {
    const base = cleanCell(value) || `columna_${index + 1}`;
    const count = used.get(base.toLowerCase()) || 0;
    used.set(base.toLowerCase(), count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function headerScore(row: unknown[]): number {
  const cells = row.map(cleanCell).filter(Boolean);
  if (cells.length < 2) return -1;
  const keywordHits = cells.filter((cell) => HEADER_WORDS.test(cell)).length;
  const textCells = cells.filter((cell) => /[a-záéíóúñ]/i.test(cell)).length;
  const numericCells = cells.filter((cell) => /^[$€]?\s*\d+(?:[.,]\d+)?$/.test(cell)).length;
  return keywordHits * 10 + textCells * 2 - numericCells * 2 + Math.min(cells.length, 8);
}

function findHeaderRow(matrix: unknown[][]): number {
  const limit = Math.min(matrix.length, 25);
  let bestIndex = 0;
  let bestScore = -Infinity;
  for (let index = 0; index < limit; index += 1) {
    const score = headerScore(matrix[index] || []);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function matrixToRows(matrix: unknown[][]): { headers: string[]; rows: Record<string, string>[]; rawText: string } {
  const nonEmpty = matrix.filter((row) => Array.isArray(row) && row.some((cell) => cleanCell(cell)));
  if (!nonEmpty.length) return { headers: [], rows: [], rawText: "" };

  const headerIndex = findHeaderRow(nonEmpty);
  const maxColumns = Math.max(...nonEmpty.map((row) => row.length));
  const headerRow = Array.from({ length: maxColumns }, (_, index) => nonEmpty[headerIndex]?.[index] ?? "");
  const headers = uniqueHeaders(headerRow);
  const rows: Record<string, string>[] = [];

  for (let index = headerIndex + 1; index < nonEmpty.length; index += 1) {
    const values = nonEmpty[index] || [];
    if (!values.some((cell) => cleanCell(cell))) continue;
    const row: Record<string, string> = {};
    let meaningful = 0;
    headers.forEach((header, column) => {
      const value = cleanCell(values[column]);
      row[header] = value;
      if (value) meaningful += 1;
    });
    if (meaningful > 0) rows.push(row);
  }

  const rawText = [headers.join("\t"), ...rows.map((row) => headers.map((header) => row[header] || "").join("\t"))].join("\n");
  return { headers, rows, rawText };
}

export async function readFileContent(file: File, sourceId: string): Promise<ExtractedFileContent> {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (extension === "xlsx" || extension === "xls") return readExcel(file, sourceId);
  if (extension === "csv") return readCsv(file, sourceId);
  if (extension === "pdf") return readPdf(file, sourceId);
  return { source_id: sourceId, type: "txt", name: file.name, rawText: await file.text() };
}

async function readExcel(file: File, sourceId: string): Promise<ExtractedFileContent> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheets: Array<{ headers: string[]; rows: Record<string, string>[]; rawText: string }> = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "", raw: false });
    const parsed = matrixToRows(matrix);
    if (parsed.rows.length || parsed.rawText.trim()) sheets.push(parsed);
  }

  if (!sheets.length) {
    return { source_id: sourceId, type: "excel", name: file.name, headers: [], rows: [], rawText: "" };
  }

  // Preserve all sheets as text; use the richest sheet as the structured source.
  const richest = [...sheets].sort((a, b) => b.rows.length - a.rows.length)[0];
  return {
    source_id: sourceId,
    type: "excel",
    name: file.name,
    headers: richest.headers,
    rows: richest.rows,
    rawText: sheets.map((sheet) => sheet.rawText).filter(Boolean).join("\n\n"),
  };
}

async function readCsv(file: File, sourceId: string): Promise<ExtractedFileContent> {
  const text = await file.text();
  const matrix = parseDelimited(text);
  const parsed = matrixToRows(matrix);
  return { source_id: sourceId, type: "csv", name: file.name, ...parsed };
}

function parseDelimited(text: string): string[][] {
  const firstLines = text.split(/\r?\n/).slice(0, 5).join("\n");
  const commaCount = (firstLines.match(/,/g) || []).length;
  const semicolonCount = (firstLines.match(/;/g) || []).length;
  const delimiter = semicolonCount > commaCount ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && char === delimiter) {
      row.push(field);
      field = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

async function readPdf(file: File, sourceId: string): Promise<ExtractedFileContent> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const raw = new TextDecoder("latin1").decode(bytes);
  let text = "";
  const blocks = raw.matchAll(/BT\s*(.*?)\s*ET/gs);
  for (const block of blocks) {
    for (const match of block[1].matchAll(/\(([^)]*)\)\s*Tj/g)) text += `${decodePdfString(match[1])} `;
    for (const array of block[1].matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      for (const match of array[1].matchAll(/\(([^)]*)\)/g)) text += decodePdfString(match[1]);
      text += " ";
    }
    text += "\n";
  }
  return { source_id: sourceId, type: "pdf", name: file.name, rawText: text.trim() };
}

function decodePdfString(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\(\d{1,3})/g, (_match, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)));
}
