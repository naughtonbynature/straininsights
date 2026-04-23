import { PDFParse } from "pdf-parse";
import { normalizeTerpeneName } from "./terpene-knowledge.js";

export interface ParsedLabResult {
  productName: string;
  strainName: string;
  productType: string;
  brandName: string;
  batchNumber: string;
  testDate: string;
  labName: string;
  cannabinoids: Record<string, number>; // name -> percentage (%)
  totalThc: number;
  totalCbd: number;
  totalCannabinoids: number;
  terpenes: Record<string, number>; // name -> percentage (%)
  totalTerpenes: number;
  dominantTerpene: string;
}

// ── Row-aware parser for COA PDFs ────────────────────────────────────────────
//
// IMPORTANT: Cannabis COA PDFs (TagLeaf, SC Labs, Confident Cannabis, etc.)
// render data as TABLES. When pdf-parse linearizes them, each analyte row
// becomes a single line whose cells are separated by whitespace or tabs.
// Example TagLeaf row:
//
//   "CBG \t22.4 mg \t2.24 % \t22.4 mg/g \t0.0913 mg/g \t0.401 mg/g \tN/A"
//
// The OLD parser used regexes like `\bCBG\b[:\s]+([\d.]+)\s*%?` which grab
// the FIRST number after the name — that's the `Labeled Amount` in `mg`,
// not the `%`. So CBG displayed as 22.40% when the real value is 2.24%.
//
// The NEW parser tokenizes each row into (value, unit) cells and picks the
// first cell whose unit is "%". That is ALWAYS the concentration we want,
// regardless of which columns the lab decides to print and in what order.
// ─────────────────────────────────────────────────────────────────────────────

/** Canonical cannabinoid labels we recognize as row prefixes. */
const CANNABINOID_PREFIXES = [
  "Total THC", "Total CBD", "Total Cannabinoids",
  "Sum of Cannabinoids",
  // Greek-delta forms
  "Δ9-THC", "Δ8-THC", "Δ9 -THC", "Δ8 -THC", "Δ -THC",
  // ASCII/word forms
  "Delta-9-THC", "Delta9-THC", "D9-THC", "d9-THC", "Delta-8-THC", "Delta8-THC", "D8-THC",
  // Acid + neutral cannabinoids
  "THCA-A", "THCA", "THCV", "THCVA",
  "CBDA", "CBDV", "CBD",
  "CBGA", "CBG",
  "CBCA", "CBCV", "CBC",
  "CBN", "CBNA",
  "CBL", "CBLA",
  "CBT",
  // Bare THC last so prefix matching prefers Δ9-THC/THCA/etc.
  "THC",
];

/** Canonical terpene labels (including Greek-prefixed forms). */
const TERPENE_PREFIXES = [
  "Total Terpenes", "Sum of Terpenes",
  "D-Limonene", "Limonene",
  "β-Myrcene", "Beta-Myrcene", "Myrcene",
  "β-Caryophyllene", "Beta-Caryophyllene", "Caryophyllene",
  "Caryophyllene Oxide",
  "α-Humulene", "Alpha-Humulene", "Humulene",
  "Linalool",
  "α-Pinene", "Alpha-Pinene",
  "β-Pinene", "Beta-Pinene",
  "Terpinolene",
  "trans-Ocimene", "cis-Ocimene", "β-Ocimene", "Ocimene",
  "α-Bisabolol", "Bisabolol",
  "Fenchol", "Fenchone",
  "trans-Nerolidol", "cis-Nerolidol", "Nerolidol",
  "Guaiol",
  "Camphene", "Camphor",
  "Geraniol", "Geranyl Acetate",
  "Borneol", "Isoborneol",
  "Valencene",
  "Sabinene",
  "Eucalyptol", "1,8-Cineole",
  "Δ3-Carene", "Δ -Carene", "3-Carene",
  "α-Terpineol", "α-Terpinene", "γ-Terpinene",
  "α-Cedrene", "Cedrol",
  "β-Eudesmol",
  "Menthol",
  "(-)-β-Citronellol", "β-Citronellol", "Citronellol",
  "Pulegone",
  "p-Cymene",
];

/**
 * Parse a single cell like "22.4 mg", "2.24 %", "0.331 %", "ND", "<LOQ",
 * into either a number-with-unit or a sentinel. Returns null for non-numeric
 * cells (e.g. "Pass", "N/A", empty). Unit is normalized: "%" or "mg/g" or
 * "mg" or "mg/pkg" or "μg/g" or "" for bare numbers.
 */
interface NumericCell {
  value: number;
  unit: string;
}
function parseCell(raw: string): NumericCell | null {
  const s = raw.trim();
  if (!s) return null;
  // Non-detect sentinels -> 0 % with explicit unit so they don't pollute "%" matches.
  // Use lowercase "nd" because downstream comparisons are case-sensitive.
  if (/^(ND|N\/D|BLQ|<\s*LOQ|<LOD|N\/A)$/i.test(s)) return { value: 0, unit: "nd" };
  // Match "<number><optional unit>" ; unit can be "%", "mg/g", "mg", "mg/pkg", "μg/g", "ug/g"
  const m = s.match(/^([\d.]+)\s*(%|mg\/pkg|mg\/g|mg|μg\/g|ug\/g)?\b/i);
  if (!m) return null;
  const value = parseFloat(m[1]);
  if (!Number.isFinite(value)) return null;
  const unit = (m[2] || "").toLowerCase();
  return { value, unit };
}

/** Split a COA row into cells by tabs (primary) or multi-space (fallback). */
function splitRowCells(row: string): string[] {
  if (row.includes("\t")) {
    return row.split("\t").map((c) => c.trim()).filter((c) => c.length > 0);
  }
  // Fallback: collapse on 2+ spaces
  return row.split(/\s{2,}/).map((c) => c.trim()).filter((c) => c.length > 0);
}

/**
 * Find the analyte prefix that this row starts with, longest-match-wins.
 * Returns the canonical prefix string AND the remainder cells (after the
 * prefix has been consumed).
 */
function matchRowPrefix(row: string, prefixes: string[]): { prefix: string; restCells: string[] } | null {
  const cells = splitRowCells(row);
  if (cells.length === 0) return null;
  const firstCell = cells[0];
  // Normalize weird Δ spacing: "Δ -THC" -> "Δ-THC", "Δ 9-THC" -> "Δ9-THC"
  const normalizedFirst = firstCell.replace(/Δ\s+/g, "Δ").replace(/\s+-/g, "-");

  // Sort by length desc so "Total Cannabinoids" beats "Total", "Δ9-THC" beats "THC".
  const sorted = [...prefixes].sort((a, b) => b.length - a.length);
  for (const p of sorted) {
    const pNorm = p.replace(/Δ\s+/g, "Δ").replace(/\s+-/g, "-");
    // Prefix must exactly equal the first cell (case-insensitive).
    if (normalizedFirst.toLowerCase() === pNorm.toLowerCase()) {
      return { prefix: p, restCells: cells.slice(1) };
    }
  }
  return null;
}

/** From the remainder cells of an analyte row, return the first "%" value.
 * Falls back to mg/g (÷10 = %) if no "%" cell is present.
 *
 * If the FIRST few cells contain an ND / <LOQ sentinel, the analyte is
 * non-detect — we return 0 immediately so we don't accidentally read an LOD
 * column that appears later in the row as a real value.
 */
function pickPercent(restCells: string[]): number | null {
  const parsed = restCells.map(parseCell);

  // Early non-detect: any of the first 3 cells is ND/<LOQ/BLQ ⇒ the analyte
  // wasn't detected. Later cells on ND rows are LOD/LOQ, not concentrations.
  for (let i = 0; i < Math.min(3, parsed.length); i++) {
    if (parsed[i] && parsed[i]!.unit === "nd") return 0;
  }

  // Prefer explicit % column
  for (const c of parsed) {
    if (c && c.unit === "%") return c.value;
  }
  // Fallback: mg/g → % by ÷10 (only when no % column present)
  for (const c of parsed) {
    if (c && c.unit === "mg/g") return c.value / 10;
  }
  // Last resort: skip — we'd rather return null than guess wrong.
  return null;
}

// ── Product / strain / metadata extraction ───────────────────────────────────

/**
 * Pull the COA title line. TagLeaf renders the title as:
 *   "Grapes & Cream 1.0g Vape Cart (1g) (Distillate) //  Client: ..."
 * We strip the trailing "(Matrix)" paren group and the "// Client: ..." suffix.
 */
function extractProductName(text: string): { productName: string; strainName: string } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // TagLeaf signature line: "<title> (<matrix>) // Client: <company>"
  for (const line of lines) {
    if (line.includes("//") && /client/i.test(line)) {
      let title = line.split("//")[0].trim();
      // Strip a trailing "(Distillate)" / "(Flower)" / "(Solventless)" paren
      title = title.replace(/\s*\([^()]+\)\s*$/g, "").trim();
      if (title.length > 0 && title.length < 120) {
        return { productName: title, strainName: deriveStrainName(title) };
      }
    }
  }

  // SC Labs / Confident Cannabis style: often "Sample Name: Xxx" or first bold line
  const sampleNameMatch = text.match(/(?:product\s*name|sample\s*name|item\s*name)[:\s]+([^\n]{2,120})/i);
  if (sampleNameMatch) {
    const title = sampleNameMatch[1].trim().replace(/\s*\([^()]+\)\s*$/g, "").trim();
    if (title.length > 0) return { productName: title, strainName: deriveStrainName(title) };
  }

  // Fallback: use first non-boilerplate line
  for (const l of lines.slice(0, 20)) {
    if (l.length > 3 && l.length < 120 &&
        !/^(page|certificate|report|coa|laboratory|http|www|analyte|batch|license|total|sample|produced|collected|received|matrix|submatrix)/i.test(l)) {
      return { productName: l, strainName: deriveStrainName(l) };
    }
  }

  return { productName: "Unknown Product", strainName: "" };
}

/** Derive strain name from a product title by stripping size/form descriptors. */
function deriveStrainName(title: string): string {
  let s = title;
  // Strip trailing "(1g)", "(3.5g)", "(10ct)" etc.
  s = s.replace(/\s*\([^()]+\)\s*$/g, "").trim();
  // Strip common form/size suffixes
  s = s
    .replace(/\s+\d+(\.\d+)?\s*(g|mg|oz|ml)\s+(Vape\s+Cart|Vape\s+Cartridge|Cartridge|Disposable|Pre[-\s]?Roll|Gummies?|Chocolate|Tincture|Flower|Rosin|Resin|Live\s+Resin|Live\s+Rosin|Badder|Wax|Shatter|Cart|Pen|Blunt)\b.*$/i, "")
    .replace(/\s+(Vape\s+Cart|Vape\s+Cartridge|Cartridge|Disposable|Pre[-\s]?Roll|Gummies?|Chocolate|Tincture|Flower|Rosin|Resin|Live\s+Resin|Live\s+Rosin|Badder|Wax|Shatter|Cart|Pen|Blunt)\b.*$/i, "")
    .replace(/\s+\d+(\.\d+)?\s*(g|mg|oz|ml)\b.*$/i, "")
    .trim();
  return s || title;
}

/** Product type inference from the full COA text. */
function inferProductType(text: string): string {
  const t = text.toLowerCase();
  // Order matters: check vape before concentrate (rosin vape cart).
  if (/\bvape\b|\bcartridge\b|\bdisposable\b|\bcart\b|\ball[\s-]?in[\s-]?one\b|\baio\b|\bvape\s*pen\b/i.test(t)) return "vape";
  if (/\bpre[-\s]?roll\b|\bblunt\b|\binfused\s*pre[-\s]?roll\b/i.test(t)) return "pre-roll";
  if (/\bgummy\b|\bgummies\b|\bchocolate\b|\bedible\b|\bbeverage\b|\bmints?\b|\bbaked\s*goods?\b|\bchews?\b/i.test(t)) return "edible";
  if (/\btincture\b/i.test(t)) return "tincture";
  if (/\btopical\b|\bbalm\b|\blotion\b|\bcream\b|\bsalve\b/i.test(t)) return "topical";
  if (/\bconcentrate\b|\brosin\b|\bresin\b|\bwax\b|\bshatter\b|\bbadder\b|\bsugar\s*wax\b|\bhash\b|\bdiamond\b/i.test(t)) return "concentrate";
  if (/\bflower\b|\bbud\b|\bpopcorn\b/i.test(t)) return "flower";
  return "flower";
}

function extractBatchNumber(text: string): string {
  const patterns = [
    /batch\s*(?:no\.?|number|#)\s*:?\s*([A-Z0-9-]+)/i,
    /lot\s*(?:no\.?|number|#)\s*:?\s*([A-Z0-9-]+)/i,
    /sample\s*id\s*:?\s*([A-Z0-9-]+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return "";
}

function extractTestDate(text: string): string {
  // TagLeaf: "Produced: Feb 18, 2026"
  const patterns = [
    /produced\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    /(?:test|analysis|report|collected|received)\s*(?:on|date)?\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    /([A-Za-z]{3,}\s+\d{1,2},?\s+\d{4})/,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return "";
}

function extractLabName(text: string): string {
  const patterns = [
    /(Infinite Chemical Analysis(?:\s+Labs)?(?:,?\s*CA)?)/i,
    /(SC Labs|Steep Hill|ProVerde|Anresco|Cannalysis|Confident Cannabis|TagLeaf|Kaycha|CannaSafe|Veda Scientific)/i,
    /(?:tested by|laboratory|lab name|testing lab)\s*:?\s*([^\n]+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim().split("\n")[0].trim();
  }
  return "";
}

function extractBrandName(text: string): string {
  // TagLeaf: "Manufacturer\nCentral Coast Ag Products, LLC"
  const m = text.match(/manufacturer[:\s]*\n?\s*([^\n]{2,80})/i);
  if (m) return m[1].trim().replace(/,?\s*LLC$|,?\s*Inc\.?$/i, "").trim();
  return "";
}

// ── Main extractors (row-aware) ──────────────────────────────────────────────

function extractCannabinoids(text: string): {
  cannabinoids: Record<string, number>;
  totalThc: number;
  totalCbd: number;
  totalCannabinoids: number;
} {
  const cannabinoids: Record<string, number> = {};
  let totalThc = 0;
  let totalCbd = 0;
  let totalCannabinoids = 0;

  const lines = text.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const match = matchRowPrefix(line, CANNABINOID_PREFIXES);
    if (!match) continue;

    const pct = pickPercent(match.restCells);
    if (pct === null) continue;

    // Totals go to dedicated fields, not the individual dictionary.
    if (/^total\s*thc$/i.test(match.prefix)) { totalThc = pct; continue; }
    if (/^total\s*cbd$/i.test(match.prefix)) { totalCbd = pct; continue; }
    if (/^total\s*cannabinoids?$/i.test(match.prefix)) { totalCannabinoids = pct; continue; }
    if (/^sum\s*of\s*cannabinoids?$/i.test(match.prefix)) {
      if (!totalCannabinoids) totalCannabinoids = pct;
      continue;
    }

    // Normalize Δ9-THC → "thc" so existing consumers (Confirm.tsx, Detail.tsx)
    // keep working. They look up `cannabinoids.thc || cannabinoids.d9thc`.
    let key: string;
    if (/^(Δ\s*9?\s*-?\s*THC|Delta-?9-?THC|D9-?THC|d9-?THC)$/i.test(match.prefix.replace(/\s+/g, " ").trim())) {
      key = "thc";
    } else if (/^(Δ\s*8\s*-?\s*THC|Delta-?8-?THC|D8-?THC)$/i.test(match.prefix.replace(/\s+/g, " ").trim())) {
      key = "d8thc";
    } else {
      key = normalizeTerpeneName(match.prefix);
    }

    // Don't overwrite a larger value with a smaller one (row can appear twice).
    if (!(key in cannabinoids) || pct > cannabinoids[key]) {
      cannabinoids[key] = pct;
    }
  }

  // Compute totals from parts if not reported.
  if (!totalThc) {
    const thc = cannabinoids["thc"] || 0;
    const thca = cannabinoids["thca"] || 0;
    totalThc = thc + thca * 0.877;
  }
  if (!totalCbd) {
    const cbd = cannabinoids["cbd"] || 0;
    const cbda = cannabinoids["cbda"] || 0;
    totalCbd = cbd + cbda * 0.877;
  }

  return { cannabinoids, totalThc, totalCbd, totalCannabinoids };
}

function extractTerpenes(text: string): {
  terpenes: Record<string, number>;
  totalTerpenes: number;
  dominantTerpene: string;
} {
  const terpenes: Record<string, number> = {};
  let totalTerpenes = 0;

  const lines = text.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const match = matchRowPrefix(line, TERPENE_PREFIXES);
    if (!match) continue;

    const pct = pickPercent(match.restCells);
    if (pct === null) continue;

    if (/^total\s*terpenes?$/i.test(match.prefix) || /^sum\s*of\s*terpenes?$/i.test(match.prefix)) {
      totalTerpenes = pct;
      continue;
    }

    // De-duplicate across Greek/ASCII/bare-name aliases by collapsing to a
    // single canonical key. E.g. "Caryophyllene", "β-Caryophyllene", and
    // "Beta-Caryophyllene" all → "caryophyllene".
    const canonical = canonicalTerpeneKey(match.prefix);
    if (!canonical) continue;

    // Keep the largest reading if duplicates appear.
    if (!(canonical in terpenes) || pct > terpenes[canonical]) {
      terpenes[canonical] = pct;
    }
  }

  // Drop zero values for cleanliness.
  for (const k of Object.keys(terpenes)) if (terpenes[k] === 0) delete terpenes[k];

  if (!totalTerpenes) {
    totalTerpenes = Object.values(terpenes).reduce((s, v) => s + v, 0);
  }

  const dominant = Object.entries(terpenes).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  return { terpenes, totalTerpenes, dominantTerpene: dominant };
}

/**
 * Collapse alpha-/beta-/cis-/trans- variants that describe the SAME compound
 * in a dashboard sense. For the dominant-terpene display we want one row per
 * compound, not two.
 *
 * We keep chemically-distinct isomers separate (α-Pinene vs β-Pinene — those
 * smell different). But "Caryophyllene" and "β-Caryophyllene" are the same
 * compound with/without the isomer prefix → same key.
 */
function canonicalTerpeneKey(prefix: string): string {
  const norm = normalizeTerpeneName(prefix);

  // Strip redundant alpha- on compounds that only have one common isomer.
  const SAME_AS_BARE = new Set([
    "beta-caryophyllene",   // "Caryophyllene" == β-Caryophyllene in dispensary parlance
    "alpha-humulene",       // Humulene is almost always α-Humulene
    "alpha-bisabolol",      // Bisabolol is almost always α-Bisabolol
    "beta-myrcene",         // Myrcene is β-Myrcene
    "d-limonene",           // Limonene is D-Limonene (the only isomer in cannabis)
    "alpha-terpineol",      // Terpineol is α-Terpineol
  ]);
  if (SAME_AS_BARE.has(norm)) {
    return norm.replace(/^(alpha|beta|d)-/, "");
  }

  // α-Pinene and β-Pinene are DIFFERENT compounds → keep them distinct.
  // Same for α-Terpinene vs γ-Terpinene, cis-Nerolidol vs trans-Nerolidol.

  // Ignore residual-solvent / non-terpene noise that might sneak into the
  // terpene list if a COA prints them adjacent.
  if (/^(total|sum)-/.test(norm)) return "";

  return norm;
}

// ── Plausibility validation ──────────────────────────────────────────────────

export interface ValidationWarning {
  kind: "cannabinoid" | "terpene" | "total-thc" | "total-cannabinoids" | "total-terpenes";
  name: string;
  value: number;
  limit: number;
  message: string;
}

/**
 * Flag values that can't be real. Cannabis chemistry hard limits:
 *   – No single cannabinoid >99% (pure distillate tops out ~95-97%).
 *   – No individual terpene >5% (high-terpene rosin rarely tops 4%).
 *   – Total Terpenes >10% is a parse error.
 *   – Total THC >99% or Total Cannabinoids >100% is impossible.
 */
export function validateLabResult(result: Pick<ParsedLabResult,
  "cannabinoids" | "terpenes" | "totalThc" | "totalCannabinoids" | "totalTerpenes"
>): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (result.totalThc > 99) {
    warnings.push({
      kind: "total-thc", name: "Total THC", value: result.totalThc, limit: 99,
      message: `Total THC ${result.totalThc.toFixed(1)}% exceeds 99% — likely mis-parsed (mg/g column read as %?)`,
    });
  }
  if (result.totalCannabinoids > 100) {
    warnings.push({
      kind: "total-cannabinoids", name: "Total Cannabinoids", value: result.totalCannabinoids, limit: 100,
      message: `Total Cannabinoids ${result.totalCannabinoids.toFixed(1)}% exceeds 100%`,
    });
  }
  if (result.totalTerpenes > 10) {
    warnings.push({
      kind: "total-terpenes", name: "Total Terpenes", value: result.totalTerpenes, limit: 10,
      message: `Total Terpenes ${result.totalTerpenes.toFixed(2)}% exceeds 10% — implausibly high`,
    });
  }
  for (const [name, v] of Object.entries(result.cannabinoids || {})) {
    if (v > 99) {
      warnings.push({
        kind: "cannabinoid", name, value: v, limit: 99,
        message: `${name} ${v.toFixed(1)}% exceeds 99%`,
      });
    }
  }
  for (const [name, v] of Object.entries(result.terpenes || {})) {
    if (v > 5) {
      warnings.push({
        kind: "terpene", name, value: v, limit: 5,
        message: `${name} ${v.toFixed(2)}% exceeds 5% — implausibly high for a single terpene`,
      });
    }
  }
  return warnings;
}

// ── Public entrypoint ────────────────────────────────────────────────────────

export async function parseCOAPdf(buffer: Buffer): Promise<ParsedLabResult> {
  const parser = new PDFParse({ data: buffer });
  const textResult = await parser.getText();
  const text = textResult.text;

  const { productName, strainName } = extractProductName(text);
  const { cannabinoids, totalThc, totalCbd, totalCannabinoids } = extractCannabinoids(text);
  const { terpenes, totalTerpenes, dominantTerpene } = extractTerpenes(text);

  return {
    productName,
    strainName,
    productType: inferProductType(text),
    brandName: extractBrandName(text),
    batchNumber: extractBatchNumber(text),
    testDate: extractTestDate(text),
    labName: extractLabName(text),
    cannabinoids,
    totalThc,
    totalCbd,
    totalCannabinoids,
    terpenes,
    totalTerpenes,
    dominantTerpene,
  };
}
