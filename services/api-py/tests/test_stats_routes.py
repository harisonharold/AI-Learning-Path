"""api-py stats and report routes: HMAC required, fixture reproduced over HTTP (AT-21), bad samples -> 422."""

import json
from pathlib import Path
from typing import Any

import httpx
from api_py.app import Env, create_app
from atlas_common.hmac_sig import sign_request
from fastapi.testclient import TestClient

KEY = "k" * 40
FIXTURES = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "fixtures"


class MemStore:
    def claim(self, nonce: str, ttl_seconds: int) -> bool:
        return True


def call(path: str, payload: dict[str, Any], signed: bool = True) -> httpx.Response:
    c = TestClient(create_app(Env(REDIS_URL="redis://127.0.0.1:1", INTERNAL_HMAC_KEY=KEY), MemStore()))
    body = json.dumps(payload).encode()
    headers = sign_request(KEY, "POST", path, body) if signed else {}
    return c.post(path, content=body, headers={"content-type": "application/json", **headers})


def test_routes_require_a_signature() -> None:
    for path in ("/stats/summary", "/stats/compare", "/reports/render"):
        assert call(path, {}, signed=False).status_code == 401


def test_at21_compare_over_http_matches_the_fixed_seed_fixture() -> None:
    f = json.loads((FIXTURES / "stats-compare.fixture.json").read_text())
    r = call("/stats/compare", f["input"])
    assert r.status_code == 200
    got = r.json()
    assert got["diff"]["p50"]["ci95"] == f["expected"]["diff"]["p50"]["ci95"]
    assert got["mann_whitney"] == f["expected"]["mann_whitney"]


def test_summary_route() -> None:
    r = call("/stats/summary", {"metrics": [{"name": "latency", "values": [1, 2, 3, 4]}], "resamples": 100})
    assert r.status_code == 200
    m = r.json()["metrics"]["latency"]
    assert m["p50"] == 2.5 and m["n"] == 4 and "ci95" in m and "histogram" in m and "cdf" in m


def test_bad_samples_are_422() -> None:
    assert call("/stats/summary", {"metrics": [{"name": "x", "values": []}]}).status_code == 422
    assert call("/stats/compare", {"a": [1], "b": [2], "resamples": 5}).status_code == 422
