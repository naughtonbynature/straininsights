import { z } from "zod";

// ── User ────────────────────────────────────────────────────
export interface User {
  id: number;
  username: string;
  password: string;
}

export type InsertUser = { username: string; password: string };

// ── Lab Results ─────────────────────────────────────────────
export interface LabResult {
  id: string;
  userId: string;
  instanceId: string | null;

  // Product info
  productName: string;
  strainName: string | null;
  productType: string | null;
  brandName: string | null;
  batchNumber: string | null;
  testDate: string | null;
  labName: string | null;

  // Cannabinoid data (stored as JSON)
  cannabinoids: string | null;
  totalThc: number | null;
  totalCbd: number | null;
  totalCannabinoids: number | null;

  // Terpene data (stored as JSON)
  terpenes: string | null;
  totalTerpenes: number | null;
  dominantTerpene: string | null;

  // Generated content
  productDescription: string | null;
  strainDescription: string | null;
  terpeneInsight: string | null;

  // Workflow tracking
  webDraftStatus: string | null;
  crmDraftStatus: string | null;
  ugcDraftStatus: string | null;

  // Source
  sourceType: string | null;
  sourceFilename: string | null;
  rawData: string | null;

  createdAt: string;
  updatedAt: string;
}

export type InsertLabResult = Omit<LabResult, "id"> & { id?: string };
