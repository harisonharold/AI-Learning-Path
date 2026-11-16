import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "../src/env.ts";

describe("worker-node env (fail fast)", () => {
  it("exits 78 naming the missing variable", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => { throw new Error("exit"); }) as never);
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(() => loadEnv({ INTERNAL_HMAC_KEY: "x".repeat(40) })).toThrow("exit");
    expect(exit).toHaveBeenCalledWith(78);
    expect(String(err.mock.calls[0]?.[0])).toContain("REDIS_URL");
    exit.mockRestore(); err.mockRestore();
  });
  it("accepts a valid env", () => {
    expect(loadEnv({ REDIS_URL: "redis://r:6379", INTERNAL_HMAC_KEY: "x".repeat(40) }).HEALTH_PORT).toBe(8002);
  });
});
