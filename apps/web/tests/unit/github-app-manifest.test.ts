/** AT-27 (manifest part): the GitHub App requests read-only permissions and no webhooks. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const m = JSON.parse(readFileSync(new URL("../../../../infra/github-app/manifest.json", import.meta.url), "utf8"));

describe("GitHub App manifest", () => {
  it("requests exactly metadata, contents, issues and pull_requests, all read", () =>
    expect(m.default_permissions).toEqual({ metadata: "read", contents: "read", issues: "read", pull_requests: "read" }));
  it("has no write or admin permission anywhere", () => expect(JSON.stringify(m)).not.toMatch(/"(write|admin)"/));
  it("is private, subscribes to no events and has webhooks off", () => {
    expect(m.public).toBe(false);
    expect(m.default_events).toEqual([]);
    expect(m.hook_attributes.active).toBe(false);
  });
  it("callback matches Better Auth's /api/auth/callback/github route", () =>
    expect(m.callback_urls.every((u: string) => u.endsWith("/api/auth/callback/github"))).toBe(true));
});
