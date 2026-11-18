"""worker-py: handler behaviour and that its callbacks verify under the shared HMAC rules."""

import json
from typing import Any

import httpx
import pytest
from atlas_common.hmac_sig import verify_request
from worker_py.callback import post_result
from worker_py.handlers import UnknownJobKind, handle

KEY = "k" * 40
JOB = "0b6f7c2e-8c1a-4f0e-9b53-2a7d1e9c4f10"


def test_echo() -> None:
    assert handle("diag.echo", {"message": "ping"}) == {"echo": "ping", "worker": "worker-py"}


def test_unknown_kind_raises() -> None:
    with pytest.raises(UnknownJobKind):
        handle("shell.exec", {})


def test_callback_is_verifiable_and_targets_internal_route() -> None:
    seen: dict[str, Any] = {}

    class Store:
        def claim(self, nonce: str, ttl_seconds: int) -> bool:
            return True

    def handler(req: httpx.Request) -> httpx.Response:
        headers = {k.lower(): v for k, v in req.headers.items()}
        seen["verdict"] = verify_request(KEY, Store(), req.method, req.url.path, headers, req.content)
        seen["path"] = req.url.path
        return httpx.Response(200, json={"ok": True})

    with httpx.Client(transport=httpx.MockTransport(handler)) as c:
        r = post_result(c, "http://web:3000", KEY, JOB, {"status": "done", "result": {"echo": "x"}, "attempts": 1})
    assert r.status_code == 200
    assert seen["path"] == f"/api/internal/jobs/{JOB}/result"
    assert seen["verdict"].ok is True


def test_callback_body_matches_contract() -> None:
    from pathlib import Path

    from jsonschema import Draft202012Validator

    schema = json.loads((Path(__file__).parents[3] / "packages/contracts/schemas/job-result.schema.json").read_text())
    captured: list[bytes] = []

    def handler(req: httpx.Request) -> httpx.Response:
        captured.append(req.content)
        return httpx.Response(200)

    with httpx.Client(transport=httpx.MockTransport(handler)) as c:
        post_result(c, "http://web:3000", KEY, JOB, {"status": "failed", "error": "boom", "attempts": 5})
    assert not list(Draft202012Validator(schema).iter_errors(json.loads(captured[0])))


def test_stats_summarize_job() -> None:
    from worker_py.handlers import handle

    out = handle(
        "stats.summarize", {"run_id": 7, "metrics": [{"name": "lat", "values": [1, 2, 3, 4]}], "resamples": 100}
    )
    assert out["run_id"] == 7 and out["metrics"]["lat"]["p50"] == 2.5 and out["metrics"]["lat"]["basis_n"] == 4


def test_bad_input_fails_without_retry_semantics() -> None:
    import pytest
    from worker_py.handlers import BadJobInput, handle

    with pytest.raises(BadJobInput):
        handle("stats.summarize", {"metrics": [{"name": "lat", "values": [float("nan")]}]})
