import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { RedactingExporter } from "./telemetry.ts";

/** Starts tracing to Jaeger (OTLP/HTTP) only when OTEL_EXPORTER_OTLP_ENDPOINT is set. Next.js adds its own spans. */
export function startTracing(service: string): boolean {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint) return false;
  const exporter = new RedactingExporter(new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, "")}/v1/traces` }));
  new NodeSDK({ resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: service }), spanProcessors: [new BatchSpanProcessor({ exporter })] }).start();
  return true;
}
