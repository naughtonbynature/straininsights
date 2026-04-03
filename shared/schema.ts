import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const labResults = sqliteTable("lab_results", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  instanceId: text("instance_id"),

  // Product info
  productName: text("product_name").notNull(),
  strainName: text("strain_name"),
  productType: text("product_type"), // flower, vape, concentrate, edible, pre-roll, topical
  brandName: text("brand_name"),
  batchNumber: text("batch_number"),
  testDate: text("test_date"),
  labName: text("lab_name"),

  // Cannabinoid data (stored as JSON)
  cannabinoids: text("cannabinoids"), // JSON: { thc: 80.1, cbd: 0.185, cbg: 2.24, ... }
  totalThc: real("total_thc"),
  totalCbd: real("total_cbd"),
  totalCannabinoids: real("total_cannabinoids"),

  // Terpene data (stored as JSON)
  terpenes: text("terpenes"), // JSON: { limonene: 3.39, caryophyllene: 1.15, ... }
  totalTerpenes: real("total_terpenes"),
  dominantTerpene: text("dominant_terpene"),

  // Generated content
  productDescription: text("product_description"),
  strainDescription: text("strain_description"),
  terpeneInsight: text("terpene_insight"),

  // Workflow tracking
  webDraftStatus: text("web_draft_status").default("none"), // none, sent, complete
  crmDraftStatus: text("crm_draft_status").default("none"),
  ugcDraftStatus: text("ugc_draft_status").default("none"),

  // Source
  sourceType: text("source_type"), // pdf, csv
  sourceFilename: text("source_filename"),
  rawData: text("raw_data"), // full JSON of all parsed data

  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertLabResultSchema = createInsertSchema(labResults);
export type InsertLabResult = z.infer<typeof insertLabResultSchema>;
export type LabResult = typeof labResults.$inferSelect;
