/** Runs once at server boot. Node-only work lives in instrumentation-node.ts. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./instrumentation-node.ts");
}
