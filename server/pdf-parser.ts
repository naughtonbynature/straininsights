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
  cannabinoids: Record<string, number>; // name -> percentage
  totalThc: number;
  totalCbd: number;
  totalCannabinoids: number;
  terpenes: Record<string, number>; // name -> percentage
  totalTerpenes: number;
  dominantTerpene: string;
}

// Known cannabinoid names to look for
const CANNABINOID_NAMES = [
  "Δ9-THC", "Delta9-THC", "D9-THC", "d9-THC", "THC",
  "THCA", "THCV", "THCVA",
  "Δ8-THC", "Delta8-THC", "D8-THC",
  "CBD", "CBDA", "CBG", "CBGA",
  "CBN", "CBC", "CBCA", "CBCV",
  "Total THC", "Total CBD", "Total Cannabinoids",
];

// Known terpene names
const TERPENE_NAMES = [
  "Limonene", "D-Limonene",
  "β-Myrcene", "Beta-Myrcene", "Myrcene",
  "β-Caryophyllene", "Beta-Caryophyllene", "Caryophyllene",
  "α-Humulene", "Alpha-Humulene", "Humulene",
  "Linalool",
  "α-Pinene", "Alpha-Pinene", "Pinene",
  "β-Pinene", "Beta-Pinene",
  "Terpinolene",
  "Ocimene", "β-Ocimene", "cis-Ocimene", "trans-Ocimene",
  "α-Bisabolol", "Bisabolol",
  "Fenchol",
  "Nerolidol", "Trans-Nerolidol", "Cis-Nerolidol",
  "Guaiol",
  "Camphene",
  "Geraniol",
  "Borneol",
  "Valencene",
  "Sabinene",
  "Eucalyptol", "1,8-Cineole",
  "3-Carene",
  "Total Terpenes",
];

function parsePercentage(value: string): number {
  if (!value) return 0;
  const cleaned = value.trim().replace(",", ".");
  if (cleaned === "ND" || cleaned === "N/D" || cleaned === "<LOQ" || cleaned === "BLQ") return 0;
  // Handle mg/g -> convert to % (divide by 10)
  const mgMatch = cleaned.match(/^([\d.]+)\s*mg\/g/i);
  if (mgMatch) return parseFloat(mgMatch[1]) / 10;
  const pctMatch = cleaned.match(/^([\d.]+)\s*%?/);
  if (pctMatch) return parseFloat(pctMatch[1]);
  return 0;
}

function extractProductInfo(text: string): Partial<ParsedLabResult> {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const result: Partial<ParsedLabResult> = {};

  // Try to find batch number
  const batchPatterns = [
    /batch\s*(?:number|#|no\.?)?[:\s]+([A-Z0-9-]+)/i,
    /lot\s*(?:number|#|no\.?)?[:\s]+([A-Z0-9-]+)/i,
    /batch[:\s]+([A-Z0-9-]+)/i,
    /sample\s*id[:\s]+([A-Z0-9-]+)/i,
  ];
  for (const pat of batchPatterns) {
    const m = text.match(pat);
    if (m) { result.batchNumber = m[1].trim(); break; }
  }

  // Test date
  const datePatterns = [
    /(?:test|analysis|report|sample)\s*date[:\s]+([A-Za-z0-9,\s\/\-]+)/i,
    /date\s*(?:of\s*)?(?:test|analysis|report)[:\s]+([A-Za-z0-9,\s\/\-]+)/i,
    /(?:tested|reported|completed)[:\s]+([A-Za-z0-9,\s\/\-]+)/i,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
    /([A-Za-z]+\s+\d{1,2},?\s+\d{4})/,
  ];
  for (const pat of datePatterns) {
    const m = text.match(pat);
    if (m) {
      const date = m[1].trim().split("\n")[0].trim();
      if (date.length < 30) { result.testDate = date; break; }
    }
  }

  // Lab name - look for known labs or generic patterns
  const labPatterns = [
    /(?:tested by|laboratory|lab name|testing lab)[:\s]+([^\n]+)/i,
    /(SC Labs|Steep Hill|ProVerde|Anresco|Cannalysis|Confident Cannabis|Metrc|TagLeaf|Kaycha|Weedmaps Labs|Florist Farms|CannaSafe|Veda Scientific)/i,
  ];
  for (const pat of labPatterns) {
    const m = text.match(pat);
    if (m) { result.labName = m[1].trim().split("\n")[0].trim(); break; }
  }

  // Product type inference
  const textLower = text.toLowerCase();
  if (textLower.includes("vape") || textLower.includes("cartridge") || textLower.includes("cart")) {
    result.productType = "vape";
  } else if (textLower.includes("concentrate") || textLower.includes("wax") || textLower.includes("shatter") || textLower.includes("rosin") || textLower.includes("resin")) {
    result.productType = "concentrate";
  } else if (textLower.includes("edible") || textLower.includes("gummy") || textLower.includes("chocolate") || textLower.includes("infused")) {
    result.productType = "edible";
  } else if (textLower.includes("pre-roll") || textLower.includes("preroll") || textLower.includes("pre roll")) {
    result.productType = "pre-roll";
  } else if (textLower.includes("topical") || textLower.includes("lotion") || textLower.includes("cream")) {
    result.productType = "topical";
  } else {
    result.productType = "flower";
  }

  // Product name: usually one of the first substantial lines
  const productNamePatterns = [
    /(?:product\s*name|sample\s*name|strain\s*name|product)[:\s]+([^\n]+)/i,
    /(?:matrix|type)[:\s]+([^\n]+)/i,
  ];
  for (const pat of productNamePatterns) {
    const m = text.match(pat);
    if (m) {
      const name = m[1].trim().split("\n")[0].trim();
      if (name.length > 1 && name.length < 100) {
        result.productName = name;
        break;
      }
    }
  }

  if (!result.productName) {
    // Use first non-trivial line as product name
    for (const line of lines.slice(0, 10)) {
      if (line.length > 2 && line.length < 80 && !/^(page|certificate|report|coa|laboratory|http|www)/i.test(line)) {
        result.productName = line;
        break;
      }
    }
    result.productName = result.productName || "Unknown Product";
  }

  return result;
}

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

  for (const line of lines) {
    const lineTrimmed = line.trim();

    // Total THC
    if (/total\s*thc/i.test(lineTrimmed)) {
      const m = lineTrimmed.match(/total\s*thc[^%\d]*([\d.]+)\s*%?/i);
      if (m) totalThc = parseFloat(m[1]);
    }

    // Total CBD
    if (/total\s*cbd/i.test(lineTrimmed)) {
      const m = lineTrimmed.match(/total\s*cbd[^%\d]*([\d.]+)\s*%?/i);
      if (m) totalCbd = parseFloat(m[1]);
    }

    // Total Cannabinoids
    if (/total\s*cannabinoid/i.test(lineTrimmed)) {
      const m = lineTrimmed.match(/total\s*cannabinoid[^%\d]*([\d.]+)\s*%?/i);
      if (m) totalCannabinoids = parseFloat(m[1]);
    }

    // Individual cannabinoids
    for (const cName of CANNABINOID_NAMES) {
      if (cName.startsWith("Total")) continue;
      const escapedName = cName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/Δ/g, "[Δδ]");
      const pattern = new RegExp(`\\b${escapedName}\\b[:\\s]+(ND|N\\/D|<LOQ|BLQ|[\\d.]+)\\s*%?`, "i");
      const m = lineTrimmed.match(pattern);
      if (m) {
        const val = parsePercentage(m[1]);
        const key = normalizeTerpeneName(cName);
        if (!cannabinoids[key] || val > 0) {
          cannabinoids[key] = val;
        }
      }
    }
  }

  // Also try a broad pattern for lines like "Δ9-THC 22.5 % ..."
  const broadPattern =
    /([Δδ]9-THC|[Δδ]8-THC|THCA|THCV|THCVA|CBDA|CBGA|CBCA|CBCV|THC|CBD|CBG|CBN|CBC)\s+(ND|N\/D|<LOQ|BLQ|[\d.]+)\s*%?/gi;
  let m: RegExpExecArray | null;
  while ((m = broadPattern.exec(text)) !== null) {
    const val = parsePercentage(m[2]);
    const key = normalizeTerpeneName(m[1]);
    if (!cannabinoids[key]) cannabinoids[key] = val;
  }

  // Compute totals from parsed data if not found
  if (!totalThc) {
    const thc = cannabinoids["thc"] || cannabinoids["9-thc"] || cannabinoids["delta9-thc"] || 0;
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

  // Total terpenes line
  for (const line of lines) {
    if (/total\s*terpene/i.test(line)) {
      const m = line.match(/total\s*terpene[^%\d]*([\d.]+)\s*%?/i);
      if (m) totalTerpenes = parseFloat(m[1]);
    }
  }

  // Individual terpenes
  for (const tName of TERPENE_NAMES) {
    if (tName.startsWith("Total")) continue;
    const escapedName = tName
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/α/g, "[αa]")
      .replace(/β/g, "[βb]");
    const pattern = new RegExp(
      `\\b${escapedName}\\b[:\\s]+(ND|N\\/D|<LOQ|BLQ|[\\d.]+)\\s*%?`,
      "i"
    );
    for (const line of lines) {
      const m = line.match(pattern);
      if (m) {
        const val = parsePercentage(m[1]);
        const key = normalizeTerpeneName(tName);
        if (!terpenes[key] || val > 0) {
          terpenes[key] = val;
        }
        break;
      }
    }
  }

  // Also try broad terpene extraction on lines that look like terpene data
  // Pattern: word(s) followed by a percentage
  const terpeneLinePattern =
    /([A-Za-zα-ωΑ-Ω][\w\s\-(),.]+?)\s+(ND|N\/D|<LOQ|[\d.]+)\s*(%|mg\/g)?/g;
  for (const line of lines) {
    if (
      !/terpene|limonene|myrcene|caryophyllene|linalool|pinene|humulene|terpinolene|ocimene|bisabolol|fenchol|nerolidol|guaiol|camphene|geraniol|borneol|valencene/i.test(
        line
      )
    )
      continue;
    let m2: RegExpExecArray | null;
    while ((m2 = terpeneLinePattern.exec(line)) !== null) {
      const name = m2[1].trim();
      if (name.length > 2 && name.length < 40) {
        const key = normalizeTerpeneName(name);
        if (!terpenes[key]) {
          terpenes[key] = parsePercentage(m2[2] + (m2[3] || ""));
        }
      }
    }
  }

  // Remove any zero-value entries for cleanliness
  for (const k of Object.keys(terpenes)) {
    if (terpenes[k] === 0) delete terpenes[k];
  }

  // Compute total if not found
  if (!totalTerpenes) {
    totalTerpenes = Object.values(terpenes).reduce((s, v) => s + v, 0);
  }

  // Find dominant terpene
  const sorted = Object.entries(terpenes).sort((a, b) => b[1] - a[1]);
  const dominantTerpene = sorted[0]?.[0] || "";

  return { terpenes, totalTerpenes, dominantTerpene };
}

export async function parseCOAPdf(buffer: Buffer): Promise<ParsedLabResult> {
  const parser = new PDFParse({ data: buffer });
  const textResult = await parser.getText();
  const text = textResult.text;

  const productInfo = extractProductInfo(text);
  const { cannabinoids, totalThc, totalCbd, totalCannabinoids } = extractCannabinoids(text);
  const { terpenes, totalTerpenes, dominantTerpene } = extractTerpenes(text);

  return {
    productName: productInfo.productName || "Unknown Product",
    strainName: productInfo.strainName || productInfo.productName || "",
    productType: productInfo.productType || "flower",
    brandName: productInfo.brandName || "",
    batchNumber: productInfo.batchNumber || "",
    testDate: productInfo.testDate || "",
    labName: productInfo.labName || "",
    cannabinoids,
    totalThc,
    totalCbd,
    totalCannabinoids,
    terpenes,
    totalTerpenes,
    dominantTerpene,
  };
}
