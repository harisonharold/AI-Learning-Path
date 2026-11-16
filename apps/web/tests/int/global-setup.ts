import { fileURLToPath } from "node:url";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import type { TestProject } from "vitest/node";
import { runMigrations } from "../../db/migrate.ts";

let mysql: StartedTestContainer | undefined;
let redis: StartedTestContainer | undefined;

/** Real MySQL 8.4 (with infra/mysql/my.cnf) + Redis 7 per test run; migrations applied with Drizzle's migrator. */
export async function setup(project: TestProject) {
  [mysql, redis] = await Promise.all([
    new GenericContainer("mysql:8.4")
      .withEnvironment({ MYSQL_ROOT_PASSWORD: "root", MYSQL_DATABASE: "atlas" })
      .withCopyFilesToContainer([{ source: fileURLToPath(new URL("../../../../infra/mysql/my.cnf", import.meta.url)), target: "/etc/mysql/conf.d/atlas.cnf" }])
      .withExposedPorts(3306)
      .withWaitStrategy(Wait.forLogMessage(/port: 3306 {2}MySQL Community Server/))
      .withStartupTimeout(180_000)
      .start(),
    new GenericContainer("redis:7-alpine").withExposedPorts(6379).withWaitStrategy(Wait.forLogMessage("Ready to accept connections")).start(),
  ]);
  const dbUrl = `mysql://root:root@${mysql.getHost()}:${mysql.getMappedPort(3306)}/atlas`;
  const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  for (let i = 0; ; i++) {
    try { await runMigrations(dbUrl); break; } catch (e) { if (i > 30) throw e; await new Promise((r) => setTimeout(r, 1000)); }
  }
  project.provide("dbUrl", dbUrl);
  project.provide("redisUrl", redisUrl);
}

export async function teardown() {
  await Promise.all([mysql?.stop(), redis?.stop()]);
}

declare module "vitest" {
  export interface ProvidedContext { dbUrl: string; redisUrl: string }
}
