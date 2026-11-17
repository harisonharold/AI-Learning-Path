"""OpenTelemetry for the Python services (NFR-9). Off unless OTEL_EXPORTER_OTLP_ENDPOINT is set.

Exported span attributes are redacted like logs (X-03): sensitive keys and registered secret values never leave."""

from __future__ import annotations

import os
from collections.abc import Sequence
from typing import Any

from opentelemetry import propagate, trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SpanExporter, SpanExportResult

from atlas_common.logging_json import redact


class RedactingExporter(SpanExporter):
    def __init__(self, inner: SpanExporter) -> None:
        self._inner = inner

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        return self._inner.export([redact_span(s) for s in spans])

    def shutdown(self) -> None:
        self._inner.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return self._inner.force_flush(timeout_millis)


def redact_span(span: ReadableSpan) -> ReadableSpan:
    attrs: dict[str, Any] = dict(span.attributes or {})
    clean = redact(attrs)
    span._attributes = clean  # pyright: ignore[reportAttributeAccessIssue, reportPrivateUsage]
    return span


def setup_tracing(service: str) -> bool:
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip()
    if not endpoint:
        return False
    provider = TracerProvider(resource=Resource.create({"service.name": service}))
    exporter = OTLPSpanExporter(endpoint=endpoint.rstrip("/") + "/v1/traces")
    provider.add_span_processor(BatchSpanProcessor(RedactingExporter(exporter)))
    trace.set_tracer_provider(provider)
    return True


def context_from_traceparent(traceparent: str | None) -> Any:
    """Continues a trace started in web (W3C traceparent carried in the job data)."""
    return propagate.extract({"traceparent": traceparent} if traceparent else {})
