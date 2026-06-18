import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./deals-schema";
import path from "path";

const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), "deals.sqlite");
const sqlite = new Database(dbPath);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS deals (
    deal_id TEXT PRIMARY KEY,
    item_title TEXT NOT NULL,
    buyer_phone TEXT NOT NULL,
    seller_phone TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'released',
    timestamp TEXT NOT NULL
  )
`);

export const db = drizzle(sqlite, { schema });
