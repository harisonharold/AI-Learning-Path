import { createHmac, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { inject } from "vitest";
import { setDbForTests } from "../../db/client.ts";
import { account, session, user } from "../../db/schema/index.ts";
import { setRedisForTests } from "../../modules/platform/internal/redis.ts";

export const ALLOWED_ID = "123658133";
export const SECRET = "test-better-auth-secret-0123456789abcdef";
export const APP = "http://localhost:3000";

/** Must run before route modules call getEnv(). */
export function testEnv() {
  Object.assign(process.env, {
    ATLAS_ENV: "test",
    APP_ORIGIN: APP,
    SANDBOX_ORIGIN: "http://127.0.0.1:3000",
    DATABASE_URL: inject("dbUrl"),
    REDIS_URL: inject("redisUrl"),
    BETTER_AUTH_SECRET: SECRET,
    ALLOWED_GITHUB_USER_ID: ALLOWED_ID,
    TOKEN_ENC_KEY: Buffer.alloc(32, 3).toString("base64"),
    INTERNAL_HMAC_KEY: "test-internal-hmac-key-0123456789abcdef",
    GITHUB_APP_CLIENT_ID: "Iv1.test",
    GITHUB_APP_CLIENT_SECRET: "test-client-secret",
  });
  return { db: setDbForTests(inject("dbUrl")), redis: setRedisForTests(inject("redisUrl")) };
}

/**
 * Fixture user with a session cookie signed exactly as better-call does (HMAC-SHA256, base64).
 * Inserted directly: real sign-up only admits the allowlisted GitHub id, so a second user can only exist as a fixture.
 */
export async function fixtureUser(db: ReturnType<typeof testEnv>["db"], githubId: string) {
  const prior = await db.select({ userId: account.userId }).from(account).where(and(eq(account.providerId, "github"), eq(account.accountId, githubId)));
  for (const p of prior) await db.delete(user).where(eq(user.id, p.userId));
  const id = randomUUID();
  const token = randomUUID().replace(/-/g, "");
  await db.insert(user).values({ id, name: `u-${githubId}`, email: `${githubId}-${id.slice(0, 8)}@example.test` });
  await db.insert(account).values({ id: randomUUID(), userId: id, providerId: "github", accountId: githubId });
  await db.insert(session).values({ id: randomUUID(), userId: id, token, expiresAt: new Date(Date.now() + 3600_000) });
  const sig = createHmac("sha256", SECRET).update(token).digest("base64");
  return { id, cookie: `better-auth.session_token=${encodeURIComponent(`${token}.${sig}`)}` };
}

export function req(url: string, init: RequestInit & { cookie?: string; sameOrigin?: boolean } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.sameOrigin) headers.set("origin", APP);
  return new Request(APP + url, { ...init, headers });
}
