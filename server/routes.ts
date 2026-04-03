import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage, db } from "./storage.js";
import { labResults } from "@shared/schema";
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
function ensureSchema() {
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS lab_results (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        instance_id TEXT,
        product_name TEXT NOT NULL,
        strain_name TEXT,
        product_type TEXT,
        brand_name TEXT,
        batch_number TEXT,
        test_date TEXT,
        lab_name TEXT,
        cannabinoids TEXT,
        total_thc REAL,
        total_cbd REAL,
        total_cannabinoids REAL,
        terpenes TEXT,
        total_terpenes REAL,
        dominant_terpene TEXT,
        product_description TEXT,
        strain_description TEXT,
        terpene_insight TEXT,
        web_draft_status TEXT DEFAULT 'none',
        crm_draft_status TEXT DEFAULT 'none',
        ugc_draft_status TEXT DEFAULT 'none',
        source_type TEXT,
        source_filename TEXT,
        raw_data TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  } catch (e) {
    // Table already exists
  }
}

function getUserId(req: Request): string {
  // Use instance ID from Heady SDK header, or fallback to IP-based default
  return (
    (req.headers["x-heady-user-id"] as string) ||
    (req.headers["x-instance-id"] as string) ||
    "default-user"
  );
}

async function callLLM(prompt: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return "LLM API key not configured. Please set OPENROUTER_API_KEY environment variable.";
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "anthropic/claude-3.5-haiku",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 600,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LLM API error: ${err}`);
  }

  const data = (await response.json()) as any;
  return data.choices?.[0]?.message?.content || "";
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  ensureSchema();

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

  // Generate descriptions via LLM
  app.post("/api/results/:id/generate", async (req, res) => {
    try {
      const result = await storage.getLabResult(req.params.id);
      if (!result) return res.status(404).json({ message: "Not found" });

      const cannabinoids = result.cannabinoids ? JSON.parse(result.cannabinoids) : {};
      const terpenes = result.terpenes ? JSON.parse(result.terpenes) : {};
      const profileInterpretation = interpretProfile(cannabinoids, terpenes);
      const knowledgeBase = buildKnowledgeBaseText();

      const productPrompt = `${knowledgeBase}

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

      const [productDescription, strainDescription, terpeneInsight] = await Promise.all([
        callLLM(productPrompt),
        callLLM(strainPrompt),
        callLLM(insightPrompt),
      ]);

      const updated = await storage.updateLabResult(req.params.id, {
        productDescription,
        strainDescription,
        terpeneInsight,
      });

      res.json({ productDescription, strainDescription, terpeneInsight, result: updated });
    } catch (err: any) {
      console.error("Generate error:", err);
      res.status(500).json({ message: err.message || "Generation failed" });
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
