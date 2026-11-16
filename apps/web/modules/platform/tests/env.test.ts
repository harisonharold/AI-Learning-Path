import { describe, expect, it } from "vitest";
import { EnvError, parseEnv, secretValues } from "../internal/env.ts";

const ok = {
  APP_ORIGIN: "http://localhost:3000",
  SANDBOX_ORIGIN: "http://127.0.0.1:3000",
  DATABASE_URL: "mysql://atlas_app:pw-123456@mysql:3306/atlas",
  REDIS_URL: "redis://:redis-pw-1@redis:6379",
  BETTER_AUTH_SECRET: "b".repeat(40),
  ALLOWED_GITHUB_USER_ID: "123658133",
  TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString("base64"),
  INTERNAL_HMAC_KEY: "h".repeat(40),
};
const issues = (src: Record<string, string | undefined>) => {
  try { parseEnv(src); return []; } catch (e) { return (e as EnvError).issues.map((i) => i.path); }
};

describe("env loader (P0 task 3, X-01d)", () => {
  it("accepts a complete env", () => expect(issues(ok)).toEqual([]));
  it.each(["APP_ORIGIN", "SANDBOX_ORIGIN", "DATABASE_URL", "REDIS_URL", "BETTER_AUTH_SECRET", "ALLOWED_GITHUB_USER_ID", "TOKEN_ENC_KEY", "INTERNAL_HMAC_KEY"])(
    "fails naming %s when it is missing",
    (k) => expect(issues({ ...ok, [k]: undefined })).toContain(k),
  );
  it("refuses a sandbox on the same host as the app", () => expect(issues({ ...ok, SANDBOX_ORIGIN: "http://localhost:3000" })).toContain("SANDBOX_ORIGIN"));
  it.each(["123,456", "abc", "0", "-5", "123658133 456", ""])("refuses ALLOWED_GITHUB_USER_ID=%j (exactly one positive id)", (v) =>
    expect(issues({ ...ok, ALLOWED_GITHUB_USER_ID: v })).toContain("ALLOWED_GITHUB_USER_ID"));
  it("refuses a short HMAC key", () => expect(issues({ ...ok, INTERNAL_HMAC_KEY: "short" })).toContain("INTERNAL_HMAC_KEY"));
  it("refuses a TOKEN_ENC_KEY that is not 32 bytes", () => expect(issues({ ...ok, TOKEN_ENC_KEY: Buffer.alloc(16).toString("base64") })).toContain("TOKEN_ENC_KEY"));
  it("refuses GitHub endpoint overrides outside ATLAS_ENV=test", () =>
    expect(issues({ ...ok, GITHUB_OAUTH_TOKEN_URL: "http://evil.test/token" })).toContain("GITHUB_OAUTH_TOKEN_URL"));
  it("allows GitHub endpoint overrides in ATLAS_ENV=test", () => expect(issues({ ...ok, ATLAS_ENV: "test", GITHUB_OAUTH_TOKEN_URL: "http://mock:4010/x" })).toEqual([]));
  it("requires both GitHub App credentials or neither", () => expect(issues({ ...ok, GITHUB_APP_CLIENT_ID: "Iv1.x" })).toContain("GITHUB_APP_CLIENT_SECRET"));
  it("lists secrets for redaction, including DB and Redis passwords", () => {
    const s = secretValues(parseEnv(ok));
    expect(s).toEqual(expect.arrayContaining([ok.BETTER_AUTH_SECRET, ok.INTERNAL_HMAC_KEY, "pw-123456", "redis-pw-1"]));
  });
});
