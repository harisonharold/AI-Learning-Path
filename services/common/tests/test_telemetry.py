"""X-03 for traces: exported span attributes are redacted; tracing is off without an endpoint."""

from collections.abc import Sequence

import pytest
from atlas_common.logging_json import register_secrets
from atlas_common.telemetry import RedactingExporter, context_from_traceparent, setup_tracing
from opentelemetry import trace
from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor, SpanExporter, SpanExportResult


class Capture(SpanExporter):
    def __init__(self) -> None:
        self.spans: list[ReadableSpan] = []

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        self.spans.extend(spans)
        return SpanExportResult.SUCCESS


def test_span_attributes_redacted() -> None:
    secret = "hmac-secret-value-123456"  # noqa: S105 - test fixture
    register_secrets([secret])
    cap = Capture()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(RedactingExporter(cap)))
    with provider.get_tracer("t").start_as_current_span("s") as s:
        s.set_attribute("http.request.header.authorization", "Bearer abc")
        s.set_attribute("note", f"uses {secret}")
        s.set_attribute("atlas.job_id", "j1")
    attrs = dict(cap.spans[0].attributes or {})
    assert attrs["http.request.header.authorization"] == "[REDACTED]"
    assert secret not in str(attrs["note"])
    assert attrs["atlas.job_id"] == "j1"


def test_tracing_off_without_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    assert setup_tracing("x") is False


def test_traceparent_continues_trace() -> None:
    tp = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
    ctx = context_from_traceparent(tp)
    span_ctx = trace.get_current_span(ctx).get_span_context()
    assert format(span_ctx.trace_id, "032x") == "4bf92f3577b34da6a3ce929d0e0e4736"
