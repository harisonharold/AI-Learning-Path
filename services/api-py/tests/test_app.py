"""X-10 (web -> api-py direction): signed requests accepted; bad, stale, replayed, store-down all refused."""

import json

import httpx
import pytest
from api_py.app import Env, create_app
from atlas_common.hmac_sig import sign_request
from fastapi.testclient import TestClient

KEY = "k" * 40


class MemStore:
    def __init__(self, down: bool = False) -> None:
        self.seen: set[str] = set()
        self.down = down

    def claim(self, nonce: str, ttl_seconds: int) -> bool:
        if self.down:
            raise ConnectionError("down")
        if nonce in self.seen:
            return False
        self.seen.add(nonce)
        return True


def client(store: MemStore) -> TestClient:
    return TestClient(create_app(Env(REDIS_URL="redis://127.0.0.1:1", INTERNAL_HMAC_KEY=KEY), store))


BODY = json.dumps({"message": "ping"}).encode()


def post(c: TestClient, headers: dict[str, str], body: bytes = BODY) -> httpx.Response:
    return c.post("/diag/echo", content=body, headers={"content-type": "application/json", **headers})


def test_signed_request_ok() -> None:
    r = post(client(MemStore()), sign_request(KEY, "POST", "/diag/echo", BODY))
    assert r.status_code == 200
    assert r.json() == {"echo": "ping", "service": "api-py"}


def test_unsigned_401_with_error_shape() -> None:
    r = post(client(MemStore()), {})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "BAD_SIGNATURE"


def test_bad_signature_401() -> None:
    h = sign_request("z" * 40, "POST", "/diag/echo", BODY)
    assert post(client(MemStore()), h).status_code == 401


def test_stale_401() -> None:
    import time

    h = sign_request(KEY, "POST", "/diag/echo", BODY, now=time.time() - 301)
    assert post(client(MemStore()), h).json()["error"]["details"]["reason"] == "stale"


def test_replay_401() -> None:
    c = client(MemStore())
    h = sign_request(KEY, "POST", "/diag/echo", BODY)
    assert post(c, h).status_code == 200
    r = post(c, h)
    assert r.status_code == 401
    assert r.json()["error"]["details"]["reason"] == "replayed"


def test_nonce_store_down_503() -> None:
    assert post(client(MemStore(down=True)), sign_request(KEY, "POST", "/diag/echo", BODY)).status_code == 503


@pytest.mark.parametrize("path", ["/docs", "/openapi.json", "/redoc"])
def test_no_api_docs_exposed(path: str) -> None:
    assert client(MemStore()).get(path).status_code == 404


def test_healthz_reports_redis_down() -> None:
    r = client(MemStore()).get("/healthz")
    assert r.status_code == 503
    assert r.json()["checks"]["redis"] is False
