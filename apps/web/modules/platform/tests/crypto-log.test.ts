import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "../internal/crypto.ts";
import { log, redact, registerSecrets, setSink } from "../internal/log.ts";

describe("AES-256-GCM envelope", () => {
  const key = randomBytes(32);
  const keys = new Map([[1, key]]);
  it("round-trips", () => expect(decrypt(encrypt("sk-ant-test", key, 1, "user-a:anthropic"), keys, "user-a:anthropic")).toBe("sk-ant-test"));
  it("ciphertext swapped to another user (different AAD) fails to decrypt", () =>
    expect(() => decrypt(encrypt("sk-ant-test", key, 1, "user-a:anthropic"), keys, "user-b:anthropic")).toThrow());
  it("tampered ciphertext fails", () => {
    const c = encrypt("secret", key, 1, "aad");
    c[15] = c[15]! ^ 1;
    expect(() => decrypt(c, keys, "aad")).toThrow();
  });
  it("unknown key id fails", () => expect(() => decrypt(encrypt("x", key, 2, "a"), keys, "a")).toThrow(/unknown key id/));
  it("does not contain the plaintext", () => expect(encrypt("plain-secret-value", key, 1, "a").includes(Buffer.from("plain-secret-value"))).toBe(false));
});

describe("X-03 log redaction", () => {
  it("removes registered secret values and sensitive keys", () => {
    const lines: string[] = [];
    setSink((l) => lines.push(l));
    registerSecrets(["super-secret-hmac-key-value"]);
    log("info", "using super-secret-hmac-key-value now", { authorization: "Bearer abcdefghij", nested: { refresh_token: "r", ok: "x super-secret-hmac-key-value" }, cookie: "c" });
    const out = lines.join("\n");
    expect(out).not.toContain("super-secret-hmac-key-value");
    expect(out).not.toContain("abcdefghij");
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.authorization).toBe("[REDACTED]");
    expect(parsed.nested.refresh_token).toBe("[REDACTED]");
    expect(parsed.cookie).toBe("[REDACTED]");
  });
  it("redacts bearer tokens in free text", () => expect(redact("header was Bearer ghu_1234567890abcdef")).toBe("header was Bearer [REDACTED]"));
});
