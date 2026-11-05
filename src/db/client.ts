import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

function resolveDatabasePath(): string {
  return process.env.DATABASE_URL ?? "data/brandforge.db";
}

function openConnection(): Database.Database {
  const connection = new Database(resolveDatabasePath());
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  connection.pragma("busy_timeout = 5000");
  return connection;
}

export const sqlite = openConnection();
export const db = drizzle(sqlite, { schema });
