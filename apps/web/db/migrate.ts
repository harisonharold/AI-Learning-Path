// Applies db/migrations with Drizzle's migrator. Run with the DDL-capable user (DATABASE_MIGRATE_URL).
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export async function runMigrations(url: string, folder = join(dirname(fileURLToPath(import.meta.url)), "migrations")): Promise<void> {
  const conn = await mysql.createConnection({ uri: url, multipleStatements: false });
  try {
    await migrate(drizzle(conn), { migrationsFolder: folder });
  } finally {
    await conn.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_MIGRATE_URL (or DATABASE_URL) is required");
    process.exit(1);
  }
  await runMigrations(url);
  console.log(JSON.stringify({ level: "info", msg: "migrations applied" }));
}
