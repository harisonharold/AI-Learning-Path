import { describe, expect, it } from "vitest";
import { RedactingExporter, redactSpan } from "../internal/telemetry.ts";
import { registerSecrets } from "../internal/log.ts";

type Span = Parameters<typeof redactSpan>[0];
const span = (attributes: Record<string, unknown>) => ({ name: "s", attributes }) as unknown as Span;

describe("X-03 for traces: exported span attributes are redacted", () => {
  it("redacts sensitive keys and registered secret values; keeps the rest", () => {
    registerSecrets(["super-secret-hmac-key-value"]);
    const s = redactSpan(span({ "http.request.header.cookie": "better-auth.session_token=abc", note: "uses super-secret-hmac-key-value", "atlas.job_id": "j1" }));
    expect(s.attributes["http.request.header.cookie"]).toBe("[REDACTED]");
    expect(String(s.attributes.note)).not.toContain("super-secret-hmac-key-value");
    expect(s.attributes["atlas.job_id"]).toBe("j1");
    expect(s.name).toBe("s");
  });
  it("the exporter hands only redacted spans to the real exporter", async () => {
    let got: Span[] = [];
    const inner = { export: (sp: Span[], done: (r: { code: number }) => void) => { got = sp; done({ code: 0 }); }, shutdown: async () => {} };
    await new Promise<void>((resolve) => new RedactingExporter(inner as never).export([span({ authorization: "Bearer x" })], () => resolve()));
    expect(got[0]!.attributes.authorization).toBe("[REDACTED]");
  });
});
