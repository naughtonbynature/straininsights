import { normalizeTerpeneName } from "./terpene-knowledge.js";
import type { ParsedLabResult } from "./pdf-parser.js";

// Column mapping: normalized key -> possible CSV column names
// Our template uses clean headers like "THC (% w/w)", but we also accept
// CCA lab format ("SC - THC (% w/w)") and simple headers ("THC %").
// Order matters — first match wins.
const COLUMN_MAP: Record<string, string[]> = {
  // Product info
  productName: ["product name", "product", "name", "sample name", "item name"],
  strainName: ["strain name", "strain", "cultivar"],
  productType: ["product type", "type", "category", "matrix"],
  brandName: ["brand", "brand name", "company", "manufacturer"],
  batchNumber: ["batch number", "batch", "lot", "lot number", "batch #", "lot #"],
  testDate: ["test date", "date", "sample date", "analysis date", "date tested"],
  labName: ["lab name", "lab", "laboratory", "testing lab"],

  // Cannabinoids — clean format, then CCA "SC-" prefix, then simple
  totalThc: [
    "total thc active - (% w/w)", "total thc (% w/w)",
    "sc- total thc active - (% w/w)", "sc- total thc (% w/w)",
    "total thc %", "total thc", "thc total",
  ],
  totalCbd: [
    "total cbd active - (% w/w)", "total cbd (% w/w)",
    "sc- total cbd active - (% w/w)", "sc- total cbd (% w/w)",
    "total cbd %", "total cbd", "cbd total",
  ],
  totalCannabinoids: [
    "sum can (% w/w)", "sc- sum can (% w/w)",
    "total cannabinoids %", "total cannabinoids", "total cannabinoids (% w/w)",
  ],
  thc: ["thc (% w/w)", "sc - thc (% w/w)", "thc %", "thc", "delta9-thc %", "d9-thc %"],
  d8thc: ["d8 (% w/w)", "sc- d8 (% w/w)", "d8-thc %", "d8 thc %", "delta8-thc %"],
  thca: ["thca (% w/w)", "sc - thca (% w/w)", "thca %", "thca"],
  cbd: ["cbd (% w/w)", "sc- cbd (% w/w)", "cbd %", "cbd"],
  cbda: ["cbda (% w/w)", "sc- cbda (% w/w)", "cbda %", "cbda"],
  cbg: ["cbg (% w/w)", "sc - cbg (% w/w)", "cbg %", "cbg"],
  cbga: ["cbga (% w/w)", "sc- cbga (% w/w)", "cbga %", "cbga"],
  cbn: ["cbn (% w/w)", "sc- cbn (% w/w)", "cbn %", "cbn"],
  thcv: ["thcv (% w/w)", "sc- thcv (% w/w)", "thcv %", "thcv"],
  cbc: ["cbc (% w/w)", "sc- cbc (% w/w)", "cbc %", "cbc"],
  cbdv: ["cbdv (% w/w)", "sc- cbdv (% w/w)", "cbdv %", "cbdv"],
  cbl: ["cbl (% w/w)", "sc- cbl (% w/w)", "cbl %", "cbl"],

  // Terpenes — plain names (our template + CCA format)
  totalTerpenes: [
    "total terpene (% w/w)", "total terpenes %", "total terpenes",
    "total terpenes (% w/w)", "terpenoids total",
  ],
  limonene: ["limonene", "limonene %", "d-limonene %", "d-limonene"],
  myrcene: ["myrcene", "myrcene %", "beta-myrcene %", "b-myrcene %"],
  caryophyllene: [
    "beta caryophyllene", "beta-caryophyllene",
    "caryophyllene %", "b-caryophyllene %",
  ],
  humulene: ["alpha humulene", "alpha-humulene", "humulene %", "a-humulene %"],
  linalool: ["linalool", "linalool %"],
  "alpha-pinene": ["alpha pinene", "alpha-pinene", "a-pinene %"],
  "beta-pinene": ["beta pinene", "beta-pinene", "b-pinene %"],
  terpinolene: ["terpinolene", "terpinolene %"],
  ocimene: ["ocimene", "ocimene %", "b-ocimene %"],
  bisabolol: ["alpha bisabolol", "bisabolol", "a-bisabolol %"],
  fenchol: ["fenchol", "fenchol %"],
  nerolidol: ["nerolidol", "nerolidol %", "trans-nerolidol %"],
  guaiol: ["guaiol", "guaiol %"],
  camphene: ["camphene", "camphene %"],
  valencene: ["valencene", "valencene %"],
  geraniol: ["geraniol", "geraniol %"],
  borneol: ["borneol", "borneol %"],
  eucalyptol: ["eucalyptol", "eucalyptol %"],
  sabinene: ["sabinene", "sabinene %"],
  terpineol: ["terpineol", "terpineol %"],
  "caryophyllene-oxide": ["caryophyllene oxide", "caryophyllene oxide %"],
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
  return col.toLowerCase().replace(/[\r\n]+/g, " ").trim().replace(/\s+/g, " ");
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

/**
 * Split a single CSV row (already extracted) into cell values.
 */
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

/**
 * Split raw CSV text into logical rows, respecting quoted fields
 * that may contain newlines.
 */
function splitCSVRows(content: string): string[] {
  const rows: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      // End of a logical row
      if (char === "\r" && content[i + 1] === "\n") i++; // skip \r\n
      const trimmed = current.trim();
      if (trimmed) rows.push(trimmed);
      current = "";
    } else {
      current += char;
    }
  }
  const trimmed = current.trim();
  if (trimmed) rows.push(trimmed);

  return rows;
}

export const MAX_CSV_ROWS = 50;

export function parseCSV(csvContent: string): ParsedLabResult[] {
  const lines = splitCSVRows(csvContent);

  if (lines.length < 2) return [];

  // Enforce row limit (header + data rows)
  const dataRowCount = lines.length - 1;
  if (dataRowCount > MAX_CSV_ROWS) {
    throw new Error(`CSV contains ${dataRowCount} rows. Maximum is ${MAX_CSV_ROWS} per upload.`);
  }

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

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    if (cells.every((c) => !c)) continue;

    const get = (field: string): string => {
      const idx = colMap[field];
      return idx !== undefined && idx < cells.length ? cells[idx] : "";
    };

    const getNum = (field: string): number => parseValue(get(field));

    // Build cannabinoids object
    const cannabinoids: Record<string, number> = {};
    for (const name of ["thc", "d8thc", "thca", "cbd", "cbda", "cbg", "cbga", "cbn", "thcv", "cbc", "cbdv", "cbl"]) {
      const v = getNum(name);
      if (v > 0) cannabinoids[name] = v;
    }

    // Build terpenes object
    const terpenes: Record<string, number> = {};
    for (const name of [
      "limonene", "myrcene", "caryophyllene", "humulene", "linalool",
      "alpha-pinene", "beta-pinene", "terpinolene", "ocimene", "bisabolol",
      "fenchol", "nerolidol", "guaiol", "camphene", "valencene", "geraniol",
      "borneol", "eucalyptol", "sabinene", "terpineol", "caryophyllene-oxide",
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
