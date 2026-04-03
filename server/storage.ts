import { type User, type InsertUser, users, labResults, type LabResult, type InsertLabResult } from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

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

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.username, username)).get();
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    return db.insert(users).values(insertUser).returning().get();
  }

  async createLabResult(result: InsertLabResult): Promise<LabResult> {
    return db.insert(labResults).values(result).returning().get();
  }

  async getLabResult(id: string): Promise<LabResult | undefined> {
    return db.select().from(labResults).where(eq(labResults.id, id)).get();
  }

  async getLabResultsByUser(userId: string): Promise<LabResult[]> {
    return db
      .select()
      .from(labResults)
      .where(eq(labResults.userId, userId))
      .orderBy(desc(labResults.createdAt))
      .all();
  }

  async updateLabResult(
    id: string,
    updates: Partial<InsertLabResult>
  ): Promise<LabResult | undefined> {
    const result = await db
      .update(labResults)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(labResults.id, id))
      .returning()
      .get();
    return result;
  }

  async deleteLabResult(id: string): Promise<void> {
    await db.delete(labResults).where(eq(labResults.id, id)).run();
  }
}

export const storage = new DatabaseStorage();
