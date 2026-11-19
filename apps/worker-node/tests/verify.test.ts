/** AT-22 (recorded arXiv fixture), AT-23 (captcha / access denied never verified), GitHub REST parsing, HMAC parity,
 * and the test-only env guard. Responses are served from loopback through the real safeFetch pipeline. */
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "../src/env.ts";
import { signature } from "../src/hmac.ts";
import { arxivIdFromUrl, parseArxivFeed, verifySource } from "../src/verify.ts";

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url));
const pad = "x".repeat(100 * 1024); // makes a "normal" page larger than the small-page threshold
const PAGES: Record<string, [number, Record<string, string>, string]> = {
  "/api/query?id_list=2309.06180": [200, { "content-type": "application/atom+xml" }, fx("arxiv-2309.06180.xml").toString()],
  "/api/query?id_list=9999.99999": [200, { "content-type": "application/atom+xml" }, `<feed><entry><id>http://arxiv.org/api/errors#incorrect_id_format_for_9999.99999</id><title>Error</title><summary>incorrect id format for 9999.99999</summary></entry></feed>`],
  "/repos/vllm-project/vllm": [200, { "content-type": "application/json" }, fx("github-repo-vllm.json").toString()],
  "/repos/gone/away": [404, { "content-type": "application/json" }, `{"message":"Not Found"}`],
  "/repos/busy/repo": [403, { "content-type": "application/json", "x-ratelimit-remaining": "0" }, `{"message":"API rate limit exceeded"}`],
  "/ok": [200, { "content-type": "text/html" }, "<html><head><title>MIT Missing Semester</title></head><body>ok</body></html>"],
  "/captcha": [200, { "content-type": "text/html" }, `<html><head><title>One more step</title></head><body><div class="g-recaptcha" data-sitekey="x"></div></body></html>`],
  "/denied": [403, { "content-type": "text/html" }, "<html><head><title>Access Denied</title></head><body>You don't have permission to access this server.</body></html>"],
  "/cloudflare": [503, { "content-type": "text/html" }, `<html><head><title>Just a moment...</title></head><body><div id="cf-challenge-running"></div></body></html>`],
  "/big-normal": [200, { "content-type": "text/html" }, `<html><head><title>The Algorithm</title><script>window.octocaptchaUrl="/captcha"</script></head><body>${pad}</body></html>`],
  "/settings/apps": [302, { location: "/login?return_to=%2Fsettings%2Fapps" }, ""],
  "/login?return_to=%2Fsettings%2Fapps": [200, { "content-type": "text/html" }, `<html><head><title>Sign in to GitHub</title></head><body>${pad}</body></html>`],
  "/missing": [404, { "content-type": "text/html" }, "<title>Not Found</title>"],
  "/slow-down": [429, { "content-type": "text/html" }, "<title>Too Many Requests</title>"],
  "/no-title": [200, { "content-type": "text/plain" }, "plain text"],
};

let server: Server;
let port = 0;
beforeAll(async () => {
  server = createServer((req, res) => {
    const p = PAGES[req.url ?? ""];
    if (!p) return void res.writeHead(404).end();
    res.writeHead(p[0], p[1]).end(p[2]);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => { server.close(); });

const PUBLIC = "93.184.215.14";
const fetchOptions = () => ({
  resolver: async (host: string) => (host.endsWith(".example") || host === "export.arxiv.org" || host === "api.github.com" ? [{ address: PUBLIC, family: 4 as const }] : Promise.reject(new Error(`ENOTFOUND ${host}`))),
  dial: () => ({ host: "127.0.0.1", port, tls: false }),
  totalTimeoutMs: 3000,
});
const endpoints = { arxiv: "http://export.arxiv.org/api/query", github: "http://api.github.com" };
const verify = (url: string, kind = "doc") => verifySource({ url, kind }, { endpoints, fetchOptions: fetchOptions() });

describe("AT-22: arXiv verification (recorded 2026-11-19 from the live API)", () => {
  it("stores the title returned by arXiv for 2309.06180", async () => {
    const r = await verify("https://arxiv.org/abs/2309.06180", "paper");
    expect(r.verification).toBe("verified");
    expect(r.title).toBe("Efficient Memory Management for Large Language Model Serving with PagedAttention");
    expect(r.method).toBe("arXiv export API");
    expect(r.externalId).toBe("2309.06180");
    expect((r.raw?.authors as string[])[0]).toBe("Woosuk Kwon");
    expect(String(r.raw?.abstract)).toMatch(/PagedAttention/);
  });
  it("an arXiv error entry is broken, not verified", async () => {
    expect((await verify("https://arxiv.org/abs/9999.99999", "paper")).verification).toBe("broken");
    expect(parseArxivFeed("<feed></feed>", "1234.5678").verification).toBe("broken");
  });
  it("recognises arXiv URLs and ids", () => {
    expect(arxivIdFromUrl("https://arxiv.org/abs/2309.06180v2")).toBe("2309.06180v2");
    expect(arxivIdFromUrl("https://arxiv.org/pdf/2309.06180.pdf")).toBe("2309.06180");
    expect(arxivIdFromUrl("https://example.org/abs/2309.06180")).toBeNull();
  });
});

describe("AT-23: captcha and access-denied pages are never verified", () => {
  it.each([
    ["/captcha", "partial"], ["/denied", "broken"], ["/cloudflare", "broken"],
  ])("%s -> %s", async (path, expected) => {
    const r = await verify(`http://site.example${path}`);
    expect(r.verification).toBe(expected);
    expect(r.verification).not.toBe("verified");
    expect(r.note).toMatch(/captcha or access-denied/);
  });
  it("a large normal page that merely mentions captcha in a script is verified (the first live run's false positive)", async () => {
    expect((await verify("http://site.example/big-normal")).verification).toBe("verified");
  });
  it("a redirect to a sign-in page is partial (the D-37 revoke link)", async () => {
    const r = await verify("http://site.example/settings/apps");
    expect(r).toMatchObject({ verification: "partial" });
    expect(r.note).toMatch(/sign-in/);
  });
  it("404 is broken, 429 leaves the status unchanged, no title is partial, good pages are verified", async () => {
    expect((await verify("http://site.example/missing")).verification).toBe("broken");
    expect((await verify("http://site.example/slow-down")).verification).toBe("unchanged");
    expect((await verify("http://site.example/no-title")).verification).toBe("partial");
    expect(await verify("http://site.example/ok")).toMatchObject({ verification: "verified", title: "MIT Missing Semester" });
  });
  it("an SSRF-blocked URL is broken with the block reason, a stall leaves the status unchanged", async () => {
    expect(await verify("http://localhost/x")).toMatchObject({ verification: "broken", blockReason: "blocked_host" });
    expect(await verifySource({ url: "http://site.example/ok", kind: "doc" }, { endpoints, fetchOptions: { ...fetchOptions(), dial: () => ({ host: "10.255.255.1", port: 81, tls: false }), connectTimeoutMs: 200 } }))
      .toMatchObject({ verification: "unchanged" });
  });
  it("a price page says its figures are estimates, with the date read", async () => {
    expect((await verify("http://site.example/ok", "price")).note).toMatch(/^price page \(figures are estimates, read on \d{4}-\d{2}-\d{2}\)/);
  });
});

describe("GitHub REST verification (GET only)", () => {
  it("reads licence, activity and description from the recorded /repos response", async () => {
    const r = await verify("https://github.com/vllm-project/vllm", "repo");
    expect(r.verification).toBe("verified");
    expect(r.method).toBe("GitHub REST GET /repos/{o}/{r}");
    expect(r.licence).toBe("Apache-2.0");
    expect(r.title).toMatch(/^vllm-project\/vllm: /);
    expect(r.lastActivityAt).toMatch(/^2026-/);
  });
  it("404 is broken; a rate limit leaves the status unchanged", async () => {
    expect((await verify("https://github.com/gone/away", "repo")).verification).toBe("broken");
    expect((await verify("https://github.com/busy/repo", "repo")).verification).toBe("unchanged");
  });
  it("github.com pages that aren't repos (settings) go through the page check, not the API", async () => {
    expect((await verify("https://github.com/settings/apps", "doc")).method).toMatch(/page title/);
  });
});

describe("internal signing and env", () => {
  it("signs exactly like web and worker-py (shared vectors)", () => {
    const v = JSON.parse(readFileSync(new URL("../../../packages/contracts/hmac-vectors.json", import.meta.url), "utf8")) as { key: string; vectors: { method: string; path: string; timestamp: string; nonce: string; body: string; signature: string }[] };
    for (const x of v.vectors) expect(signature(v.key, x.method, x.path, x.timestamp, x.nonce, x.body)).toBe(x.signature);
  });
  it("test-only fetch overrides are refused outside ATLAS_ENV=test", () => {
    const base = { REDIS_URL: "redis://r:6379", INTERNAL_HMAC_KEY: "k".repeat(40) };
    expect(parseEnv({ ...base, VERIFY_TEST_DNS: '{"a.b":"1.2.3.4"}' }).success).toBe(false);
    expect(parseEnv({ ...base, ATLAS_ENV: "production", GITHUB_API_URL: "http://mock:4010" }).success).toBe(false);
    expect(parseEnv({ ...base, ATLAS_ENV: "test", VERIFY_TEST_DNS: '{"a.b":"1.2.3.4"}' }).success).toBe(true);
  });
});
