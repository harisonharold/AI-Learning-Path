import { describe, expect, it, vi } from "vitest";
import { isAllowedGitHubId } from "../internal/allowlist.ts";
import { exchangeCode, fetchAllowedUser, type GitHubOAuthConfig } from "../internal/github-oauth.ts";

const ALLOWED = "123658133";

describe("X-01 allowlist by numeric GitHub id", () => {
  it.each([[123658133, true], ["123658133", true], [123658134, false], ["harisonharold", false], [null, false], [" 123658133", false], ["0123658133", false]])(
    "isAllowedGitHubId(%j) = %s",
    (id, expected) => expect(isAllowedGitHubId(id, ALLOWED)).toBe(expected),
  );
});

function cfg(fetchImpl: typeof fetch, onRejected = vi.fn(async () => {})): GitHubOAuthConfig {
  return { clientId: "Iv1.test", clientSecret: "secret-xyz", tokenUrl: "https://github.com/login/oauth/access_token", apiUrl: "https://api.github.com", allowedId: ALLOWED, onRejected, fetchImpl };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("GitHub user lookup", () => {
  it("(a) returns the allowlisted account", async () => {
    const f = vi.fn(async () => json({ id: 123658133, login: "harisonharold", name: "Harison", email: null, avatar_url: "https://avatars.githubusercontent.com/u/1" }));
    const u = await fetchAllowedUser(cfg(f as unknown as typeof fetch), "tok");
    expect(u?.id).toBe("123658133");
    expect(u?.email).toBe("123658133+harisonharold@users.noreply.github.com");
  });
  it("(b) refuses any other id and reports it", async () => {
    const rejected = vi.fn(async () => {});
    const f = vi.fn(async () => json({ id: 999, login: "someone" }));
    expect(await fetchAllowedUser(cfg(f as unknown as typeof fetch, rejected), "tok")).toBeNull();
    expect(rejected).toHaveBeenCalledWith("999", "someone");
  });
  it("(c) refuses an account that renamed itself to the owner's login", async () => {
    const f = vi.fn(async () => json({ id: 555, login: "harisonharold" }));
    expect(await fetchAllowedUser(cfg(f as unknown as typeof fetch), "tok")).toBeNull();
  });
  it("uses GET for the user lookup", async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => json({ id: 123658133, login: "x" }));
    await fetchAllowedUser(cfg(f as unknown as typeof fetch), "tok");
    expect(f.mock.calls[0]![1]!.method).toBe("GET");
  });
});

describe("AT-27 (auth part): the token exchange is the single POST", () => {
  it("POSTs only to the token endpoint and parses expiry", async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => json({ access_token: "ghu_x", refresh_token: "ghr_y", expires_in: 28800, refresh_token_expires_in: 15897600, token_type: "bearer", scope: "" }));
    const t = await exchangeCode(cfg(f as unknown as typeof fetch), { code: "c", redirectURI: "http://localhost:3000/api/auth/callback/github", codeVerifier: "v" });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0]![0]).toBe("https://github.com/login/oauth/access_token");
    expect(f.mock.calls[0]![1]!.method).toBe("POST");
    expect(f.mock.calls[0]![1]!.redirect).toBe("error");
    expect(t.accessToken).toBe("ghu_x");
    expect(t.accessTokenExpiresAt).toBeInstanceOf(Date);
  });
  it("throws on an error response without leaking the client secret", async () => {
    const f = vi.fn(async () => json({ error: "bad_verification_code" }, 200));
    await expect(exchangeCode(cfg(f as unknown as typeof fetch), { code: "c", redirectURI: "r" })).rejects.toThrow(/bad_verification_code/);
    await expect(exchangeCode(cfg(f as unknown as typeof fetch), { code: "c", redirectURI: "r" })).rejects.not.toThrow(/secret-xyz/);
  });
});
