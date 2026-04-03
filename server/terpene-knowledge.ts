export interface TerpeneInfo {
  name: string;
  aroma: string[];
  taste: string[];
  effects: string[];
  thresholds: { low: number; medium: number; high: number; veryHigh: number };
  description: string;
  significanceNote: string;
}

export interface CannabinoidInfo {
  name: string;
  type: string;
  thresholds: { low: number; medium: number; high: number; veryHigh: number };
  description: string;
  contentNote: string;
}

export interface ProfileInterpretation {
  experienceType: string; // energetic, balanced, relaxing, sedating
  dominantTerpene: string | null;
  dominantTerpeneInfo: TerpeneInfo | null;
  aromaProfile: string[];
  tasteProfile: string[];
  effectsProfile: string[];
  standoutCannabinoids: string[];
  unusualFlags: string[];
  summary: string;
}

export const TERPENE_PROFILES: Record<string, TerpeneInfo> = {
  limonene: {
    name: "Limonene",
    aroma: ["citrus", "lemon", "orange", "grapefruit", "tangy"],
    taste: ["bright citrus", "lemon candy", "sweet-tart", "zesty"],
    effects: ["uplifting", "mood elevation", "stress relief", "energetic"],
    thresholds: { low: 0.3, medium: 0.8, high: 1.5, veryHigh: 2.0 },
    description:
      "The second most common cannabis terpene. At high concentrations (>1.5%), it dominates the flavor profile with unmistakable citrus. Recent 2025 research (Raz et al.) shows limonene directly activates CB1 receptors at 40-60% the strength of THC in lab systems, contributing to uplifting effects beyond just aroma.",
    significanceNote:
      "Even at 0.3%, limonene noticeably impacts taste. Above 1%, it defines the strain's character.",
  },
  myrcene: {
    name: "Myrcene (β-Myrcene)",
    aroma: ["earthy", "musky", "herbal", "clove", "cardamom"],
    taste: ["earthy", "slightly sweet", "herbal", "mango-like"],
    effects: ["relaxation", "sedation", "body-heavy", "calming"],
    thresholds: { low: 0.5, medium: 1.0, high: 1.5, veryHigh: 1.8 },
    description:
      "The most common cannabis terpene, responsible for the classic 'cannabis smell.' Myrcene-dominant strains produce the traditional 'indica' experience — body relaxation, sedation, and couch-lock effects. Found abundantly in hops, lemongrass, and mango.",
    significanceNote:
      "Above 0.5%, myrcene becomes the primary driver of sedative effects. The old rule that 'myrcene above 0.5% makes it an indica' has some basis — myrcene-linalool combinations create the classic body-heavy experience.",
  },
  caryophyllene: {
    name: "β-Caryophyllene",
    aroma: ["peppery", "spicy", "woody", "warm"],
    taste: ["black pepper", "clove", "cinnamon", "spicy warmth"],
    effects: ["anti-inflammatory", "stress relief", "body comfort", "grounding"],
    thresholds: { low: 0.3, medium: 0.6, high: 1.0, veryHigh: 1.5 },
    description:
      "The only terpene known to directly bind CB2 receptors in the endocannabinoid system, making it unique among terpenes. This gives it genuine anti-inflammatory potential beyond typical aromatherapy claims. 2025 research confirms CB2-mediated anxiolytic effects.",
    significanceNote:
      "At any detectable amount, caryophyllene is pharmacologically active via CB2. Above 0.6%, it significantly shapes the 'body' component of the experience.",
  },
  linalool: {
    name: "Linalool",
    aroma: ["floral", "lavender", "sweet", "slightly spicy"],
    taste: ["floral", "lavender", "subtle sweetness"],
    effects: ["calming", "anxiety relief", "sedation support", "anti-stress"],
    thresholds: { low: 0.1, medium: 0.2, high: 0.4, veryHigh: 0.6 },
    description:
      "The lavender terpene. Even in small amounts, linalool shifts the experience toward calm. Combined with myrcene, it creates the classic 'indica' sedation profile. Found in lavender, birch bark, and rosewood.",
    significanceNote:
      "Linalool is potent at low concentrations. Even 0.1-0.2% measurably contributes to relaxation. Above 0.4% is genuinely high for cannabis.",
  },
  pinene: {
    name: "α-Pinene / β-Pinene",
    aroma: ["pine", "fresh", "sharp", "forest", "resinous"],
    taste: ["pine needles", "rosemary", "crisp", "herbal"],
    effects: ["alertness", "mental clarity", "focus", "memory retention"],
    thresholds: { low: 0.1, medium: 0.2, high: 0.4, veryHigh: 0.6 },
    description:
      "The most common terpene in nature (found in pine trees, rosemary, basil). In cannabis, pinene counteracts THC-related memory impairment and sedation. Strains with notable pinene tend to feel 'clearer' even at high THC levels.",
    significanceNote:
      "Pinene is the 'clarity' terpene. Even moderate amounts (0.2%+) help prevent the foggy, forgetful effects some users experience with high-THC cannabis.",
  },
  "alpha-pinene": {
    name: "α-Pinene",
    aroma: ["pine", "fresh", "sharp", "forest", "resinous"],
    taste: ["pine needles", "rosemary", "crisp", "herbal"],
    effects: ["alertness", "mental clarity", "focus", "memory retention"],
    thresholds: { low: 0.1, medium: 0.2, high: 0.4, veryHigh: 0.6 },
    description:
      "Found in pine trees, rosemary, and basil. Counteracts THC-related memory impairment and sedation.",
    significanceNote:
      "Even moderate amounts (0.2%+) help prevent the foggy effects of high-THC cannabis.",
  },
  "beta-pinene": {
    name: "β-Pinene",
    aroma: ["pine", "fresh", "herbal", "woody"],
    taste: ["pine", "crisp", "slightly floral"],
    effects: ["alertness", "focus", "clarity"],
    thresholds: { low: 0.1, medium: 0.2, high: 0.4, veryHigh: 0.6 },
    description:
      "The beta isomer of pinene, contributing fresh pine and woody notes alongside mental clarity.",
    significanceNote: "Works synergistically with alpha-pinene to enhance clarity.",
  },
  humulene: {
    name: "α-Humulene",
    aroma: ["earthy", "woody", "hoppy", "subtle spice"],
    taste: ["earthy", "herbal", "slightly bitter", "hop-like"],
    effects: ["appetite suppression", "anti-inflammatory", "grounding"],
    thresholds: { low: 0.1, medium: 0.2, high: 0.3, veryHigh: 0.5 },
    description:
      "Found abundantly in hops (hence the name). Notable for being one of the few terpenes associated with appetite SUPPRESSION rather than the stereotypical 'munchies.' Often co-occurs with caryophyllene.",
    significanceNote:
      "Humulene is subtle but meaningful. Its presence (especially alongside caryophyllene) adds woody depth without sweetness.",
  },
  terpinolene: {
    name: "Terpinolene",
    aroma: ["floral", "herbal", "pine", "slightly citrus"],
    taste: ["complex", "fruity-herbal", "apple-like", "slightly sweet"],
    effects: ["uplifting", "creative", "cerebral", "energetic"],
    thresholds: { low: 0.1, medium: 0.3, high: 0.5, veryHigh: 0.8 },
    description:
      "The rarest dominant terpene — only about 10% of strains are terpinolene-dominant. When it does dominate, it creates a distinctly 'sativa-like' experience: cerebral, creative, and uplifting. Found in lilac, tea tree, and nutmeg.",
    significanceNote:
      "Terpinolene-dominant strains are genuinely rare and prized. Even as a secondary terpene, it adds fruity-herbal complexity.",
  },
  ocimene: {
    name: "Ocimene",
    aroma: ["sweet", "herbal", "tropical", "woody"],
    taste: ["sweet", "tropical", "mango-like"],
    effects: ["uplifting", "energetic"],
    thresholds: { low: 0.05, medium: 0.1, high: 0.3, veryHigh: 0.5 },
    description:
      "A sweet, tropical terpene found in mint, parsley, and orchids. Contributes the sweet, tropical notes in some strains.",
    significanceNote:
      "Ocimene is typically a supporting player but adds noticeable tropical sweetness even at low concentrations.",
  },
  bisabolol: {
    name: "α-Bisabolol",
    aroma: ["floral", "chamomile", "sweet", "delicate"],
    taste: ["light floral", "honey-like", "gentle"],
    effects: ["calming", "soothing", "gentle relaxation"],
    thresholds: { low: 0.05, medium: 0.1, high: 0.2, veryHigh: 0.4 },
    description:
      "The chamomile terpene. Known for its gentle, soothing character. Often present in strains with calming profiles.",
    significanceNote:
      "Bisabolol is a quality indicator — its presence adds sophistication to the terpene profile.",
  },
  fenchol: {
    name: "Fenchol",
    aroma: ["camphor", "pine", "lemon", "earthy"],
    taste: ["herbal", "slightly minty", "earthy"],
    effects: ["anti-inflammatory", "antimicrobial"],
    thresholds: { low: 0.05, medium: 0.1, high: 0.15, veryHigh: 0.2 },
    description:
      "Found in basil and wild celery. A secondary terpene that contributes earthy-herbal complexity.",
    significanceNote: "Fenchol is rarely dominant but adds herbal depth to complex profiles.",
  },
  nerolidol: {
    name: "Nerolidol",
    aroma: ["floral", "woody", "citrus peel", "fresh bark"],
    taste: ["subtle floral", "woody", "light citrus"],
    effects: ["sedating", "calming", "anti-anxiety"],
    thresholds: { low: 0.05, medium: 0.1, high: 0.2, veryHigh: 0.4 },
    description:
      "Found in neroli, ginger, and jasmine. A secondary terpene with calming, sedating properties that complement linalool.",
    significanceNote: "Adds a refined, floral-woody dimension to complex terpene profiles.",
  },
  guaiol: {
    name: "Guaiol",
    aroma: ["woody", "pine", "floral", "rose-like"],
    taste: ["piney", "woody", "delicate floral"],
    effects: ["anti-inflammatory", "antimicrobial", "calming"],
    thresholds: { low: 0.05, medium: 0.1, high: 0.2, veryHigh: 0.3 },
    description:
      "A sesquiterpene alcohol found in cypress pine and guaiacum. Rare in cannabis, adds woody-piney depth.",
    significanceNote: "Its presence signals a particularly complex, natural terpene profile.",
  },
  camphene: {
    name: "Camphene",
    aroma: ["camphor", "earthy", "herbal", "fir needles"],
    taste: ["herbal", "earthy", "slightly minty"],
    effects: ["potential antioxidant", "cardiovascular support"],
    thresholds: { low: 0.05, medium: 0.1, high: 0.2, veryHigh: 0.3 },
    description:
      "Found in fir needles, ginger, and camphor oil. Rarely dominant, contributes earthy-herbal depth.",
    significanceNote: "A minor supporting terpene that adds complexity to the background notes.",
  },
};

export const CANNABINOID_PROFILES: Record<string, CannabinoidInfo> = {
  thc: {
    name: "THC (Δ9-THC)",
    type: "intoxicating",
    thresholds: { low: 10, medium: 20, high: 25, veryHigh: 30 },
    description:
      "The primary psychoactive cannabinoid. Responsible for the 'high.' In distillates/vapes, percentages are much higher (70-90%) since plant material is removed.",
    contentNote:
      "For flower: <15% mild, 15-20% moderate, 20-25% strong, >25% very potent. For vapes/concentrates: 70-90% is standard.",
  },
  cbd: {
    name: "CBD",
    type: "non-intoxicating",
    thresholds: { low: 0.5, medium: 2, high: 5, veryHigh: 15 },
    description:
      "The primary non-intoxicating cannabinoid. Can moderate THC's anxiety and memory effects. In 1:1 ratios with THC, produces a more balanced, clear-headed experience.",
    contentNote:
      "In most recreational flower, CBD is trace (<1%). Products marketed as 'CBD-rich' typically have >5% CBD.",
  },
  cbg: {
    name: "CBG",
    type: "non-intoxicating",
    thresholds: { low: 0.5, medium: 1, high: 2, veryHigh: 3 },
    description:
      "The 'parent' cannabinoid — CBGA is the precursor to THC, CBD, and CBC. CBG is associated with focus, anti-inflammatory effects, and potential appetite stimulation. Often called the 'stem cell' cannabinoid.",
    contentNote:
      "CBG above 1% is notable and worth highlighting. Above 2% is genuinely significant — it means the product has an unusually complex cannabinoid profile.",
  },
  thcv: {
    name: "THCV",
    type: "dose-dependent",
    thresholds: { low: 0.5, medium: 1, high: 2, veryHigh: 3 },
    description:
      "At low doses: non-intoxicating, associated with appetite suppression, energy, and clarity. At higher doses: intoxicating like THC but with a shorter, more cerebral high. Genuinely rare in most cannabis.",
    contentNote:
      "THCV above 1% is rare and marketable. It's the 'sports car' cannabinoid — fast onset, short duration, energetic. Products with notable THCV appeal to consumers who want 'functional' cannabis.",
  },
  cbn: {
    name: "CBN",
    type: "mildly intoxicating",
    thresholds: { low: 0.2, medium: 0.5, high: 1, veryHigh: 2 },
    description:
      "Formed when THC oxidizes (ages). Associated with sedation and sleep. Mildly intoxicating at ~10% the strength of THC. Often marketed in 'sleep' products.",
    contentNote:
      "CBN above 0.5% suggests either intentional formulation for sleep or aged/degraded THC. Context matters.",
  },
  cbc: {
    name: "CBC",
    type: "non-intoxicating",
    thresholds: { low: 0.1, medium: 0.3, high: 0.5, veryHigh: 1 },
    description:
      "Non-intoxicating, associated with potential mood support and anti-inflammatory effects. Works synergistically with other cannabinoids.",
    contentNote:
      "CBC is rarely prominent but its presence indicates a complex, whole-plant formulation.",
  },
  delta8: {
    name: "Δ8-THC",
    type: "mildly intoxicating",
    thresholds: { low: 0.1, medium: 0.5, high: 1, veryHigh: 5 },
    description:
      "A milder version of Δ9-THC. About 50-75% as potent. Produces a clearer, less anxious high.",
    contentNote:
      "If Δ8 is present at notable levels in a Δ9 product, it adds to the overall effect profile.",
  },
};

export function normalizeTerpeneName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[αα]/g, "alpha-")
    .replace(/[ββ]/g, "beta-")
    .replace(/[γ]/g, "gamma-")
    .replace(/[δ]/g, "delta-")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function lookupTerpene(name: string): TerpeneInfo | undefined {
  const normalized = normalizeTerpeneName(name);
  if (TERPENE_PROFILES[normalized]) return TERPENE_PROFILES[normalized];

  // fuzzy match
  for (const key of Object.keys(TERPENE_PROFILES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return TERPENE_PROFILES[key];
    }
  }
  return undefined;
}

export function interpretProfile(
  cannabinoids: Record<string, number>,
  terpenes: Record<string, number>
): ProfileInterpretation {
  const terpeneEntries = Object.entries(terpenes)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  const dominantTerpeneKey = terpeneEntries[0]?.[0] || null;
  const dominantTerpeneInfo = dominantTerpeneKey
    ? lookupTerpene(dominantTerpeneKey) || null
    : null;

  // Determine experience type based on terpenes
  const myrcene = terpenes["myrcene"] || terpenes["beta-myrcene"] || 0;
  const limonene = terpenes["limonene"] || 0;
  const linalool = terpenes["linalool"] || 0;
  const terpinolene = terpenes["terpinolene"] || 0;
  const pinene =
    (terpenes["pinene"] || 0) +
    (terpenes["alpha-pinene"] || 0) +
    (terpenes["beta-pinene"] || 0);

  let experienceType = "balanced";
  if (myrcene > 0.5 && linalool > 0.1) {
    experienceType = "sedating";
  } else if (myrcene > 0.5) {
    experienceType = "relaxing";
  } else if (terpinolene > 0.3 || limonene > 1.0 || pinene > 0.3) {
    experienceType = "energetic";
  } else if (limonene > 0.5 || terpinolene > 0.1) {
    experienceType = "uplifting";
  }

  // Build aroma/taste profiles from top 3 terpenes
  const aromaProfile: string[] = [];
  const tasteProfile: string[] = [];
  const effectsProfile: string[] = [];
  for (const [key] of terpeneEntries.slice(0, 3)) {
    const info = lookupTerpene(key);
    if (info) {
      aromaProfile.push(...info.aroma.slice(0, 2));
      tasteProfile.push(...info.taste.slice(0, 2));
      effectsProfile.push(...info.effects.slice(0, 2));
    }
  }

  // Standout cannabinoids
  const standoutCannabinoids: string[] = [];
  if ((cannabinoids["cbg"] || 0) > 1)
    standoutCannabinoids.push(`CBG ${cannabinoids["cbg"].toFixed(2)}% (notable)`);
  if ((cannabinoids["thcv"] || 0) > 0.5)
    standoutCannabinoids.push(`THCV ${cannabinoids["thcv"].toFixed(2)}% (rare, functional)`);
  if ((cannabinoids["cbn"] || 0) > 0.5)
    standoutCannabinoids.push(`CBN ${cannabinoids["cbn"].toFixed(2)}% (sleep-associated)`);
  if ((cannabinoids["cbc"] || 0) > 0.3)
    standoutCannabinoids.push(`CBC ${cannabinoids["cbc"].toFixed(2)}% (whole-plant complexity)`);

  // Unusual flags
  const unusualFlags: string[] = [];
  const thc = cannabinoids["thc"] || cannabinoids["delta9-thc"] || 0;
  if (thc > 30) unusualFlags.push(`Very high THC: ${thc.toFixed(1)}%`);
  if ((terpenes["limonene"] || 0) > 3)
    unusualFlags.push(`Exceptionally high limonene: ${terpenes["limonene"].toFixed(2)}%`);
  if (myrcene > 2) unusualFlags.push(`Very high myrcene: ${myrcene.toFixed(2)}% — strong sedation expected`);

  const summary =
    dominantTerpeneInfo
      ? `${experienceType.charAt(0).toUpperCase() + experienceType.slice(1)} profile led by ${dominantTerpeneInfo.name}. ` +
        `Expect ${aromaProfile.slice(0, 2).join(", ")} aromas with ${effectsProfile.slice(0, 2).join(", ")} effects.`
      : `${experienceType.charAt(0).toUpperCase() + experienceType.slice(1)} profile with a complex terpene blend.`;

  return {
    experienceType,
    dominantTerpene: dominantTerpeneKey,
    dominantTerpeneInfo,
    aromaProfile: Array.from(new Set(aromaProfile)),
    tasteProfile: Array.from(new Set(tasteProfile)),
    effectsProfile: Array.from(new Set(effectsProfile)),
    standoutCannabinoids,
    unusualFlags,
    summary,
  };
}

export function buildKnowledgeBaseText(): string {
  const terpeneText = Object.values(TERPENE_PROFILES)
    .map(
      (t) =>
        `${t.name}: Aroma=${t.aroma.join(", ")}. Taste=${t.taste.join(", ")}. Effects=${t.effects.join(", ")}. ${t.description} ${t.significanceNote}`
    )
    .join("\n");

  const cannabinoidText = Object.values(CANNABINOID_PROFILES)
    .map(
      (c) =>
        `${c.name} (${c.type}): ${c.description} ${c.contentNote}`
    )
    .join("\n");

  return `TERPENE KNOWLEDGE BASE:\n${terpeneText}\n\nCANNABINOID KNOWLEDGE BASE:\n${cannabinoidText}`;
}
