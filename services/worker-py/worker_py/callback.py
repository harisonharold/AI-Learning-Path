"""Posts job results back to web over HMAC (worker-py never writes the DB)."""

from __future__ import annotations

import json
from typing import Any

import httpx
from atlas_common.hmac_sig import sign_request
from opentelemetry import propagate


def post_result(client: httpx.Client, web_url: str, key: str, job_id: str, body: dict[str, Any]) -> httpx.Response:
    path = f"/api/internal/jobs/{job_id}/result"
    raw = json.dumps(body, separators=(",", ":")).encode()
    headers = {"content-type": "application/json", **sign_request(key, "POST", path, raw)}
    propagate.inject(headers)  # traceparent: the callback joins the job's trace
    return client.post(web_url.rstrip("/") + path, content=raw, headers=headers, timeout=10)
