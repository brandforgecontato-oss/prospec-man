import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { db, sqlite } from "./client";

migrate(db, { migrationsFolder: "./src/db/migrations" });
sqlite.close();

console.log("Migrations applied.");
