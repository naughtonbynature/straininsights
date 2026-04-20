import { type User, type InsertUser, type LabResult, type InsertLabResult } from "@shared/schema";
import { supabase } from "./supabase";

// ── camelCase ↔ snake_case helpers ──────────────────────────
function toSnake(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) out[k.replace(/([A-Z])/g, "_$1").toLowerCase()] = v;
  return out;
}
function toCamel(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
  return out;
}

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Lab results
  createLabResult(result: InsertLabResult): Promise<LabResult>;
  getLabResult(id: string): Promise<LabResult | undefined>;
  getLabResultsByUser(userId: string): Promise<LabResult[]>;
  updateLabResult(id: string, updates: Partial<InsertLabResult>): Promise<LabResult | undefined>;
  deleteLabResult(id: string): Promise<void>;
}

export class SupabaseStorage implements IStorage {
  // ── Users (not actively used) ──────────────────────────────
  async getUser(id: number): Promise<User | undefined> {
    return undefined;
  }
  async getUserByUsername(username: string): Promise<User | undefined> {
    return undefined;
  }
  async createUser(user: InsertUser): Promise<User> {
    throw new Error("User creation not supported");
  }

  // ── Lab Results ────────────────────────────────────────────
  async createLabResult(result: InsertLabResult): Promise<LabResult> {
    const row = toSnake(result as Record<string, any>);
    const { data, error } = await supabase
      .from("straininsights_results")
      .insert(row)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toCamel(data) as LabResult;
  }

  async getLabResult(id: string): Promise<LabResult | undefined> {
    const { data, error } = await supabase
      .from("straininsights_results")
      .select()
      .eq("id", id)
      .single();
    if (error || !data) return undefined;
    return toCamel(data) as LabResult;
  }

  async getLabResultsByUser(userId: string): Promise<LabResult[]> {
    const { data, error } = await supabase
      .from("straininsights_results")
      .select()
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map((row) => toCamel(row) as LabResult);
  }

  async updateLabResult(id: string, updates: Partial<InsertLabResult>): Promise<LabResult | undefined> {
    const row = toSnake({ ...updates, updatedAt: new Date().toISOString() } as Record<string, any>);
    const { data, error } = await supabase
      .from("straininsights_results")
      .update(row)
      .eq("id", id)
      .select()
      .single();
    if (error || !data) return undefined;
    return toCamel(data) as LabResult;
  }

  async deleteLabResult(id: string): Promise<void> {
    const { error } = await supabase
      .from("straininsights_results")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
  }
}

export const storage = new SupabaseStorage();
