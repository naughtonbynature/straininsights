import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
// Schema types imported where needed via storage
import multer from "multer";
import { randomUUID } from "crypto";
import path from "path";
import { parseCOAPdf } from "./pdf-parser.js";
import { parseCSV } from "./csv-parser.js";
import { interpretProfile, buildKnowledgeBaseText } from "./terpene-knowledge.js";
import { readFileSync, existsSync } from "fs";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// Run DB migration
// Tables now live in Supabase (straininsights_results) — no local schema creation needed

function getUserId(req: Request): string {
  // Use instance ID from Heady SDK header, or fallback to IP-based default
  return (
    (req.headers["x-heady-user-id"] as string) ||
    (req.headers["x-instance-id"] as string) ||
    "default-user"
  );
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // CSV template download
  app.get("/api/template.csv", (_req, res) => {
    const templatePath = path.join(process.cwd(), "public", "template.csv");
    if (existsSync(templatePath)) {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="straininsights-template.csv"');
      res.send(readFileSync(templatePath));
    } else {
      res.status(404).json({ message: "Template not found" });
    }
  });

  // Upload endpoint - parse PDF or CSV, return parsed data for confirmation
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { originalname, buffer, mimetype } = req.file;
      const ext = path.extname(originalname).toLowerCase();

      let parsed: any[];

      if (ext === ".pdf" || mimetype === "application/pdf") {
        const result = await parseCOAPdf(buffer);
        parsed = [result];
      } else if (ext === ".csv" || mimetype === "text/csv" || mimetype === "application/csv") {
        const content = buffer.toString("utf-8");
        parsed = parseCSV(content);
        if (parsed.length === 0) {
          return res.status(400).json({ message: "No valid data found in CSV" });
        }
      } else {
        return res
          .status(400)
          .json({ message: "Unsupported file type. Please upload PDF or CSV." });
      }

      res.json({
        sourceType: ext === ".pdf" ? "pdf" : "csv",
        sourceFilename: originalname,
        results: parsed,
      });
    } catch (err: any) {
      console.error("Upload error:", err);
      res.status(500).json({ message: err.message || "Failed to parse file" });
    }
  });

  // Save confirmed lab result(s)
  app.post("/api/results", async (req, res) => {
    try {
      const userId = getUserId(req);
      const { results: items, sourceType, sourceFilename } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "No results provided" });
      }

      const saved: any[] = [];
      for (const item of items) {
        const now = new Date().toISOString();
        const id = randomUUID();
        const result = await storage.createLabResult({
          id,
          userId,
          instanceId: req.headers["x-instance-id"] as string || null,
          productName: item.productName || "Unknown Product",
          strainName: item.strainName || null,
          productType: item.productType || null,
          brandName: item.brandName || null,
          batchNumber: item.batchNumber || null,
          testDate: item.testDate || null,
          labName: item.labName || null,
          cannabinoids: item.cannabinoids ? JSON.stringify(item.cannabinoids) : null,
          totalThc: item.totalThc || null,
          totalCbd: item.totalCbd || null,
          totalCannabinoids: item.totalCannabinoids || null,
          terpenes: item.terpenes ? JSON.stringify(item.terpenes) : null,
          totalTerpenes: item.totalTerpenes || null,
          dominantTerpene: item.dominantTerpene || null,
          productDescription: null,
          strainDescription: null,
          webDraftStatus: "none",
          crmDraftStatus: "none",
          ugcDraftStatus: "none",
          sourceType: sourceType || null,
          sourceFilename: sourceFilename || null,
          rawData: JSON.stringify(item),
          createdAt: now,
          updatedAt: now,
        });
        saved.push(result);
      }

      res.json({ results: saved });
    } catch (err: any) {
      console.error("Save error:", err);
      res.status(500).json({ message: err.message || "Failed to save results" });
    }
  });

  // ── POS lab data: top products with lab results from Dutchie sync ──────────
  app.get("/api/pos-products", async (req, res) => {
    try {
      const instanceId = req.headers["x-heady-team-id"] as string;
      if (!instanceId) return res.json({ available: false, products: [] });

      const { supabase } = await import("./supabase");

      // Get products that have lab results, joined with sales data
      const { data: labProducts } = await supabase
        .from("pos_lab_results")
        .select("product_id, lab_test, value, unit, strain, strain_type, batch_name")
        .eq("instance_id", instanceId)
        .limit(10000);

      if (!labProducts || labProducts.length === 0) {
        return res.json({ available: false, products: [] });
      }

      // Group lab results by product_id
      const labsByProduct = new Map<number, any[]>();
      for (const lr of labProducts) {
        if (!labsByProduct.has(lr.product_id)) labsByProduct.set(lr.product_id, []);
        labsByProduct.get(lr.product_id)!.push(lr);
      }

      // Get product names + sales data for these product IDs
      const productIds = Array.from(labsByProduct.keys());
      const { data: products } = await supabase
        .from("pos_products")
        .select("product_id, product_name, brand_name, category, strain, strain_type")
        .eq("instance_id", instanceId)
        .in("product_id", productIds);

      // Get revenue for these products (last 90 days)
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data: salesData } = await supabase.rpc("pos_top_products", {
        p_instance_id: instanceId,
        p_from: ninetyDaysAgo.slice(0, 10),
        p_to: new Date().toISOString().slice(0, 10),
        p_limit: 50000,
      });
      const salesByProductId = new Map<number, any>();
      if (salesData) {
        for (const s of salesData) {
          if (s.product_id) salesByProductId.set(s.product_id, s);
        }
      }

      // Build the product list with lab data + sales
      const result = (products || []).map((p: any) => {
        const labs = labsByProduct.get(p.product_id) || [];
        const sales = salesByProductId.get(p.product_id);
        // Split into cannabinoids + terpenes
        const cannabinoids: Record<string, number> = {};
        const terpenes: Record<string, number> = {};
        let totalThc = 0, totalCbd = 0;
        for (const lr of labs) {
          const test = lr.lab_test?.toLowerCase() || "";
          if (/thc|cbd|cbg|cbn|cbda|thca|thcv|cbc|cbt/i.test(lr.lab_test)) {
            cannabinoids[lr.lab_test] = lr.value;
            if (test.includes("thc") && !test.includes("thca") && !test.includes("thcv")) totalThc = Math.max(totalThc, lr.value || 0);
            if (test === "cbd") totalCbd = lr.value || 0;
          } else if (lr.value > 0) {
            terpenes[lr.lab_test] = lr.value;
          }
        }
        const dominantTerpene = Object.entries(terpenes).sort(([,a],[,b]) => (b as number) - (a as number))[0]?.[0] || null;

        return {
          productId: p.product_id,
          productName: p.product_name,
          brandName: p.brand_name,
          category: p.category,
          strain: labs[0]?.strain || p.strain || null,
          strainType: labs[0]?.strain_type || p.strain_type || null,
          revenue: sales?.revenue || 0,
          unitsSold: sales?.units_sold || 0,
          cannabinoids,
          terpenes,
          totalThc,
          totalCbd,
          totalTerpenes: Object.values(terpenes).reduce((s, v) => s + (v as number), 0),
          dominantTerpene,
          hasLabData: true,
        };
      }).sort((a: any, b: any) => (b.revenue || 0) - (a.revenue || 0));

      res.json({ available: true, products: result });
    } catch (err: any) {
      console.error("POS products error:", err);
      res.json({ available: false, products: [], error: err.message });
    }
  });

  // ── POS lab data: search products by name ──────────────────────────────────
  app.get("/api/pos-products/search", async (req, res) => {
    try {
      const instanceId = req.headers["x-heady-team-id"] as string;
      const query = (req.query.q as string || "").trim();
      if (!instanceId || !query) return res.json({ products: [] });

      const { supabase } = await import("./supabase");

      // Search products by name (case-insensitive)
      const { data: products } = await supabase
        .from("pos_products")
        .select("product_id, product_name, brand_name, category, strain, strain_type")
        .eq("instance_id", instanceId)
        .ilike("product_name", `%${query}%`)
        .limit(20);

      if (!products || products.length === 0) return res.json({ products: [] });

      // Get lab results for matched products
      const productIds = products.map((p: any) => p.product_id);
      const { data: labData } = await supabase.rpc("pos_product_lab_results", {
        p_instance_id: instanceId,
        p_product_ids: productIds,
      });

      const labsByProduct = new Map<number, any[]>();
      if (labData) {
        for (const lr of labData) {
          if (!labsByProduct.has(lr.product_id)) labsByProduct.set(lr.product_id, []);
          labsByProduct.get(lr.product_id)!.push(lr);
        }
      }

      const result = products.map((p: any) => {
        const labs = labsByProduct.get(p.product_id) || [];
        const cannabinoids: Record<string, number> = {};
        const terpenes: Record<string, number> = {};
        for (const lr of labs) {
          if (/thc|cbd|cbg|cbn|cbda|thca|thcv|cbc|cbt/i.test(lr.lab_test)) {
            cannabinoids[lr.lab_test] = lr.value;
          } else if (lr.value > 0) {
            terpenes[lr.lab_test] = lr.value;
          }
        }
        return {
          productId: p.product_id,
          productName: p.product_name,
          brandName: p.brand_name,
          category: p.category,
          strain: p.strain,
          strainType: p.strain_type,
          cannabinoids,
          terpenes,
          hasLabData: labs.length > 0,
        };
      });

      res.json({ products: result });
    } catch (err: any) {
      res.json({ products: [] });
    }
  });

  // ── Import a POS product directly into StrainInsights workflow ─────────────
  app.post("/api/results/from-pos", async (req, res) => {
    try {
      const userId = getUserId(req);
      const instanceId = req.headers["x-heady-team-id"] as string || null;
      const { product } = req.body; // product object from /api/pos-products

      if (!product || !product.productName) {
        return res.status(400).json({ message: "Product data required" });
      }

      const now = new Date().toISOString();
      const id = randomUUID();
      const dominantTerpene = Object.entries(product.terpenes || {})
        .sort(([,a],[,b]) => (b as number) - (a as number))[0]?.[0] || null;

      const result = await storage.createLabResult({
        id,
        userId,
        instanceId,
        productName: product.productName,
        strainName: product.strain || null,
        productType: product.category || null,
        brandName: product.brandName || null,
        batchNumber: null,
        testDate: null,
        labName: null,
        cannabinoids: JSON.stringify(product.cannabinoids || {}),
        totalThc: product.totalThc || null,
        totalCbd: product.totalCbd || null,
        totalCannabinoids: null,
        terpenes: JSON.stringify(product.terpenes || {}),
        totalTerpenes: product.totalTerpenes || null,
        dominantTerpene: dominantTerpene,
        productDescription: null,
        strainDescription: null,
        webDraftStatus: "none",
        crmDraftStatus: "none",
        ugcDraftStatus: "none",
        sourceType: "pos_sync",
        sourceFilename: null,
        rawData: JSON.stringify(product),
        createdAt: now,
        updatedAt: now,
      });

      res.json({ result });
    } catch (err: any) {
      console.error("POS import error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // List all results for user
  app.get("/api/results", async (req, res) => {
    try {
      const userId = getUserId(req);
      const results = await storage.getLabResultsByUser(userId);
      res.json({ results });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Get single result
  app.get("/api/results/:id", async (req, res) => {
    try {
      const result = await storage.getLabResult(req.params.id);
      if (!result) return res.status(404).json({ message: "Not found" });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Update result
  app.patch("/api/results/:id", async (req, res) => {
    try {
      const result = await storage.updateLabResult(req.params.id, req.body);
      if (!result) return res.status(404).json({ message: "Not found" });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Delete result
  app.delete("/api/results/:id", async (req, res) => {
    try {
      await storage.deleteLabResult(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Return the 3 LLM prompts for frontend to call sdk.callLLM() — no direct LLM call here
  app.post("/api/results/:id/generate-prompts", async (req, res) => {
    try {
      const result = await storage.getLabResult(req.params.id);
      if (!result) return res.status(404).json({ message: "Not found" });

      const cannabinoids = result.cannabinoids ? JSON.parse(result.cannabinoids) : {};
      const terpenes = result.terpenes ? JSON.parse(result.terpenes) : {};
      const profileInterpretation = interpretProfile(cannabinoids, terpenes);
      const knowledgeBase = buildKnowledgeBaseText();

      // Optional brand voice from request body (injected by frontend if brand guide available)
      const brandVoice: string = req.body?.brandVoice || "";
      const brandVoiceNote = brandVoice
        ? `\nBrand Voice: ${brandVoice}\n`
        : "";

      const productPrompt = `${knowledgeBase}
${brandVoiceNote}
LAB DATA:
Product: ${result.productName}
Strain: ${result.strainName || "Unknown"}
Type: ${result.productType || "flower"}
Brand: ${result.brandName || "Unknown"}
Total THC: ${result.totalThc?.toFixed(1) || "N/A"}%
Total CBD: ${result.totalCbd?.toFixed(2) || "N/A"}%
Cannabinoids: ${JSON.stringify(cannabinoids, null, 2)}
Terpenes: ${JSON.stringify(terpenes, null, 2)}
Dominant Terpene: ${result.dominantTerpene || "Unknown"}
Profile Summary: ${profileInterpretation.summary}
Standout Cannabinoids: ${profileInterpretation.standoutCannabinoids.join(", ") || "none"}

Write a compelling product description for ${result.productName}. Include specific cannabinoid and terpene percentages. Mention the dominant terpene's aroma and taste. Reference any standout minor cannabinoids. Keep it under 150 words. Use confident, knowledgeable brand voice. No preamble — just the description.`;

      const strainPrompt = `${knowledgeBase}
${brandVoiceNote}
STRAIN DATA:
Strain: ${result.strainName || result.productName}
Terpenes: ${JSON.stringify(terpenes, null, 2)}
Dominant Terpene: ${result.dominantTerpene || "Unknown"}
Profile: ${profileInterpretation.summary}
Aroma Notes: ${profileInterpretation.aromaProfile.join(", ")}
Taste Notes: ${profileInterpretation.tasteProfile.join(", ")}
Experience Type: ${profileInterpretation.experienceType}

Write a strain description for ${result.strainName || result.productName} that focuses on the GENERAL character of this strain — what it tends to be like, not specific product numbers. Describe likely aromas, flavors, and effects based on the terpene profile. Use 'tends to' and 'may' language. Keep it under 120 words. No preamble — just the description.`;

      const insightPrompt = `You are a cannabis terpene and cannabinoid expert.
${brandVoiceNote}
LAB DATA:
Product: ${result.productName}
Strain: ${result.strainName || "Unknown"}
Type: ${result.productType || "flower"}
Total THC: ${result.totalThc?.toFixed(1) || "N/A"}%
Total CBD: ${result.totalCbd?.toFixed(2) || "N/A"}%
Cannabinoids: ${JSON.stringify(cannabinoids, null, 2)}
Terpenes: ${JSON.stringify(terpenes, null, 2)}
Dominant Terpene: ${result.dominantTerpene || "Unknown"}
Profile Summary: ${profileInterpretation.summary}
Aroma Notes: ${profileInterpretation.aromaProfile.join(", ")}
Experience Type: ${profileInterpretation.experienceType}
Standout Cannabinoids: ${profileInterpretation.standoutCannabinoids.join(", ") || "none"}

Write a 2-3 sentence scientific-yet-accessible insight about this product's terpene and cannabinoid interaction. Mention the entourage effect if minor cannabinoids are present. Reference specific percentages. No preamble — just the insight.`;

      res.json({ productPrompt, strainPrompt, insightPrompt });
    } catch (err: any) {
      console.error("Generate-prompts error:", err);
      res.status(500).json({ message: err.message || "Failed to build prompts" });
    }
  });

  // Handoff to Neural bot
  app.post("/api/results/:id/handoff/:type", async (req, res) => {
    try {
      const result = await storage.getLabResult(req.params.id);
      if (!result) return res.status(404).json({ message: "Not found" });

      const type = req.params.type as "web" | "crm" | "ugc";

      const cannabinoids = result.cannabinoids ? JSON.parse(result.cannabinoids) : {};
      const terpenes = result.terpenes ? JSON.parse(result.terpenes) : {};

      const handoffPayload = {
        source: "straininsights",
        targetBot:
          type === "web"
            ? "web-copywriter"
            : type === "crm"
            ? "email-sms-copywriter"
            : "ugc-script",
        type: "product-spotlight",
        data: {
          productName: result.productName,
          strainName: result.strainName,
          productType: result.productType,
          productDescription: result.productDescription,
          strainDescription: result.strainDescription,
          terpeneProfile: terpenes,
          cannabinoidProfile: cannabinoids,
          brandName: result.brandName,
          totalThc: result.totalThc,
          totalCbd: result.totalCbd,
          dominantTerpene: result.dominantTerpene,
        },
      };

      // Update workflow status
      const statusField =
        type === "web"
          ? "webDraftStatus"
          : type === "crm"
          ? "crmDraftStatus"
          : "ugcDraftStatus";

      await storage.updateLabResult(req.params.id, { [statusField]: "sent" });

      res.json({ ok: true, payload: handoffPayload });
    } catch (err: any) {
      console.error("Handoff error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
