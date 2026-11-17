import { context, propagation } from "@opentelemetry/api";
import type { ExportResult } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace";
import { redact } from "./log.ts";

/** Exported span attributes are redacted like logs (X-03): sensitive keys and registered secret values never leave. */
export class RedactingExporter implements SpanExporter {
  constructor(private readonly inner: SpanExporter) {}
  export(spans: ReadableSpan[], done: (r: ExportResult) => void): void {
    this.inner.export(spans.map(redactSpan), done);
  }
  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }
  forceFlush(): Promise<void> {
    return this.inner.forceFlush?.() ?? Promise.resolve();
  }
}

export function redactSpan(span: ReadableSpan): ReadableSpan {
  const attributes = redact({ ...span.attributes }) as ReadableSpan["attributes"];
  return new Proxy(span, { get: (t, k) => (k === "attributes" ? attributes : Reflect.get(t, k)) });
}

/** W3C traceparent of the active span, carried in job data so worker-py continues the same trace. */
export function currentTraceparent(): string | undefined {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier.traceparent;
}
