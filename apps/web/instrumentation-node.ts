import { EnvError, getEnv, registerSecrets, secretValues } from "./modules/platform/service.ts";

/** Fail fast on invalid env (exit 78 = EX_CONFIG) and register secrets for log redaction. */
try {
  registerSecrets(secretValues(getEnv()));
  const { startTracing } = await import("./modules/platform/internal/telemetry-boot.ts");
  if (startTracing("web")) process.stdout.write(JSON.stringify({ level: "info", msg: "tracing enabled" }) + "\n");
} catch (e) {
  if (e instanceof EnvError) {
    for (const i of e.issues) process.stderr.write(JSON.stringify({ level: "fatal", msg: "invalid environment", var: i.path, problem: i.message }) + "\n");
    process.exit(78);
  }
  throw e;
}

// In containers, migrations run at boot with the DDL-capable user; the app itself connects as the DML-only user.
if (process.env.DATABASE_MIGRATE_URL && process.env.MIGRATIONS_DIR) {
  const { runMigrations } = await import("./db/migrate.ts");
  for (let attempt = 1; ; attempt++) {
    try {
      await runMigrations(process.env.DATABASE_MIGRATE_URL, process.env.MIGRATIONS_DIR);
      process.stdout.write(JSON.stringify({ level: "info", msg: "migrations applied" }) + "\n");
      // Content seed (curriculum, gates, exercises, sources) runs with the app user after migrations; idempotent.
      const { seed } = await import("./modules/learning/service.ts");
      await seed();
      process.stdout.write(JSON.stringify({ level: "info", msg: "content seeded" }) + "\n");
      break;
    } catch (e) {
      if (attempt >= 30) { process.stderr.write(JSON.stringify({ level: "fatal", msg: "migrations failed", error: String(e) }) + "\n"); process.exit(1); }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
