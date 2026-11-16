import "server-only";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema/index.ts";

export type Db = MySql2Database<typeof schema>;
let pool: mysql.Pool | undefined;
let db: Db | undefined;

export function getDb(url = process.env.DATABASE_URL): Db {
  if (!db) {
    if (!url) throw new Error("DATABASE_URL is required");
    pool = mysql.createPool({ uri: url, connectionLimit: 10, timezone: "Z", dateStrings: false });
    db = drizzle(pool, { schema, mode: "default" });
  }
  return db;
}

export async function pingDb(): Promise<boolean> {
  try {
    getDb();
    await pool!.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

/** Test hook: point the singleton at a specific database. */
export function setDbForTests(url: string): Db {
  db = undefined;
  void pool?.end();
  pool = undefined;
  return getDb(url);
}
