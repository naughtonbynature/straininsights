import { normalizeTerpeneName } from "./terpene-knowledge.js";
import type { ParsedLabResult } from "./pdf-parser.js";

// Column mapping: normalized key -> possible CSV column names
const COLUMN_MAP: Record<string, string[]> = {
  productName: ["product name", "product", "name", "sample name", "item name"],
  strainName: ["strain name", "strain", "cultivar"],
  productType: ["product type", "type", "category", "matrix"],
  brandName: ["brand", "brand name", "company", "manufacturer"],
  batchNumber: ["batch number", "batch", "lot", "lot number", "batch #", "lot #"],
  testDate: ["test date", "date", "sample date", "analysis date", "date tested"],
  labName: ["lab name", "lab", "laboratory", "testing lab"],

  // Cannabinoids
  totalThc: ["total thc %", "total thc", "total thc (% w/w)", "sc - total thc (% w/w)", "thc total", "%thc total"],
  totalCbd: ["total cbd %", "total cbd", "total cbd (% w/w)", "sc - total cbd (% w/w)", "cbd total"],
  totalCannabinoids: ["total cannabinoids %", "total cannabinoids", "total cannabinoids (% w/w)"],
  thc: ["thc %", "thc", "delta9-thc %", "d9-thc %", "δ9-thc %", "sc - thc (% w/w)"],
  thca: ["thca %", "thca", "sc - thca (% w/w)"],
  cbd: ["cbd %", "cbd", "sc - cbd (% w/w)"],
  cbda: ["cbda %", "cbda", "sc - cbda (% w/w)"],
  cbg: ["cbg %", "cbg", "sc - cbg (% w/w)"],
  cbga: ["cbga %", "cbga"],
  cbn: ["cbn %", "cbn", "sc - cbn (% w/w)"],
  thcv: ["thcv %", "thcv", "sc - thcv (% w/w)"],
  cbc: ["cbc %", "cbc", "sc - cbc (% w/w)"],

  // Terpenes
  totalTerpenes: ["total terpenes %", "total terpenes", "total terpenes (% w/w)"],
  limonene: ["limonene %", "limonene", "d-limonene %", "d-limonene"],
  myrcene: ["myrcene %", "myrcene", "β-myrcene %", "beta-myrcene %", "b-myrcene %"],
  caryophyllene: [
    "beta-caryophyllene %",
    "β-caryophyllene %",
    "caryophyllene %",
    "b-caryophyllene %",
  ],
  humulene: ["alpha-humulene %", "α-humulene %", "humulene %", "a-humulene %"],
  linalool: ["linalool %", "linalool"],
  "alpha-pinene": ["alpha-pinene %", "α-pinene %", "a-pinene %", "α-pinene %"],
  "beta-pinene": ["beta-pinene %", "β-pinene %", "b-pinene %"],
  terpinolene: ["terpinolene %", "terpinolene"],
  ocimene: ["ocimene %", "ocimene", "β-ocimene %", "b-ocimene %"],
  bisabolol: ["bisabolol %", "α-bisabolol %", "a-bisabolol %", "bisabolol"],
  fenchol: ["fenchol %", "fenchol"],
  nerolidol: ["nerolidol %", "nerolidol", "trans-nerolidol %"],
  guaiol: ["guaiol %", "guaiol"],
  camphene: ["camphene %", "camphene"],
};

function parseValue(val: string): number {
  if (!val) return 0;
  const trimmed = val.trim();
  if (
    trimmed === "" ||
    trimmed === "ND" ||
    trimmed === "N/D" ||
    trimmed === "<LOQ" ||
    trimmed === "BLQ" ||
    trimmed === "-"
  )
    return 0;
  const num = parseFloat(trimmed.replace(",", ".").replace("%", "").trim());
  return isNaN(num) ? 0 : num;
}

function normalizeColumnName(col: string): string {
  return col.toLowerCase().trim().replace(/\s+/g, " ");
}

function findColumn(headers: string[], keys: string[]): number {
  const normalizedHeaders = headers.map(normalizeColumnName);
  for (const key of keys) {
    const idx = normalizedHeaders.indexOf(normalizeColumnName(key));
    if (idx !== -1) return idx;
  }
  // partial match fallback
  for (const key of keys) {
    const normalKey = normalizeColumnName(key);
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (normalizedHeaders[i].includes(normalKey) || normalKey.includes(normalizedHeaders[i])) {
        return i;
      }
    }
  }
  return -1;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export const MAX_CSV_ROWS = 50;

export function parseCSV(csvContent: string): ParsedLabResult[] {
  const lines = csvContent
    .split("\n")
    .map((l) => l.replace(/\r/g, "").trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  // Enforce row limit (header + data rows)
  const dataRowCount = lines.length - 1;
  if (dataRowCount > MAX_CSV_ROWS) {
    throw new Error(`CSV contains ${dataRowCount} rows. Maximum is ${MAX_CSV_ROWS} per upload.`);
  }

  // Find header row (first non-empty row)
  // Handle multi-line headers by merging consecutive header lines before data
  let headerLine = 0;
  const headers = parseCSVLine(lines[0]);

  // Build column index map
  const colMap: Record<string, number> = {};
  for (const [fieldKey, possibleNames] of Object.entries(COLUMN_MAP)) {
    const idx = findColumn(headers, possibleNames);
    if (idx !== -1) colMap[fieldKey] = idx;
  }

  // Also detect any additional terpene/cannabinoid columns not in our map
  const extraTerpenes: Array<{ key: string; idx: number }> = [];
  const knownTerpeneNames = [
    "limonene", "myrcene", "caryophyllene", "humulene", "linalool",
    "pinene", "terpinolene", "ocimene", "bisabolol", "fenchol",
    "nerolidol", "guaiol", "camphene", "geraniol", "borneol",
    "valencene", "sabinene", "eucalyptol",
  ];
  for (let i = 0; i < headers.length; i++) {
    const h = normalizeColumnName(headers[i]);
    for (const t of knownTerpeneNames) {
      if (h.includes(t)) {
        const key = normalizeTerpeneName(headers[i]);
        if (!Object.values(colMap).includes(i)) {
          extraTerpenes.push({ key, idx: i });
        }
        break;
      }
    }
  }

  const results: ParsedLabResult[] = [];

  for (let i = headerLine + 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    if (cells.every((c) => !c)) continue;

    const get = (field: string): string => {
      const idx = colMap[field];
      return idx !== undefined && idx < cells.length ? cells[idx] : "";
    };

    const getNum = (field: string): number => parseValue(get(field));

    // Build cannabinoids object
    const cannabinoids: Record<string, number> = {};
    for (const name of ["thc", "thca", "cbd", "cbda", "cbg", "cbga", "cbn", "thcv", "cbc"]) {
      const v = getNum(name);
      if (v > 0) cannabinoids[name] = v;
    }

    // Build terpenes object
    const terpenes: Record<string, number> = {};
    for (const name of [
      "limonene", "myrcene", "caryophyllene", "humulene", "linalool",
      "alpha-pinene", "beta-pinene", "terpinolene", "ocimene", "bisabolol",
      "fenchol", "nerolidol", "guaiol", "camphene",
    ]) {
      const v = getNum(name);
      if (v > 0) terpenes[name] = v;
    }
    // Extra terpenes
    for (const { key, idx } of extraTerpenes) {
      if (idx < cells.length) {
        const v = parseValue(cells[idx]);
        if (v > 0) terpenes[key] = v;
      }
    }

    // Totals
    let totalThc = getNum("totalThc");
    let totalCbd = getNum("totalCbd");
    const totalCannabinoids = getNum("totalCannabinoids");
    let totalTerpenes = getNum("totalTerpenes");

    if (!totalThc) {
      totalThc = (cannabinoids["thc"] || 0) + (cannabinoids["thca"] || 0) * 0.877;
    }
    if (!totalCbd) {
      totalCbd = (cannabinoids["cbd"] || 0) + (cannabinoids["cbda"] || 0) * 0.877;
    }
    if (!totalTerpenes) {
      totalTerpenes = Object.values(terpenes).reduce((s, v) => s + v, 0);
    }

    // Dominant terpene
    const sortedTerpenes = Object.entries(terpenes).sort((a, b) => b[1] - a[1]);
    const dominantTerpene = sortedTerpenes[0]?.[0] || "";

    const productName = get("productName") || get("strainName") || `Product ${i}`;

    results.push({
      productName,
      strainName: get("strainName") || productName,
      productType: get("productType") || "flower",
      brandName: get("brandName") || "",
      batchNumber: get("batchNumber") || "",
      testDate: get("testDate") || "",
      labName: get("labName") || "",
      cannabinoids,
      totalThc,
      totalCbd,
      totalCannabinoids,
      terpenes,
      totalTerpenes,
      dominantTerpene,
    });
  }

  return results;
}
