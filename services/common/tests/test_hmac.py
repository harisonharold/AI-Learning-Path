"""X-10 (Python side) + shared vectors: web and the Python services must agree byte-for-byte."""

import json
from pathlib import Path

import pytest
from atlas_common.hmac_sig import H_NONCE, H_SIG, H_TS, sign_request, signature, verify_request

VECTORS = json.loads((Path(__file__).parents[3] / "packages/contracts/hmac-vectors.json").read_text())
KEY = "k" * 40
PATH = "/api/internal/jobs/0b6f7c2e-8c1a-4f0e-9b53-2a7d1e9c4f10/result"
BODY = b'{"status":"done","attempts":1}'
NOW = 1_763_300_000.0


class MemStore:
    def __init__(self) -> None:
        self.seen: set[str] = set()

    def claim(self, nonce: str, ttl_seconds: int) -> bool:
        if nonce in self.seen:
            return False
        self.seen.add(nonce)
        return True


class DownStore:
    def claim(self, nonce: str, ttl_seconds: int) -> bool:
        raise ConnectionError("redis down")


@pytest.mark.parametrize("v", VECTORS["vectors"])
def test_shared_vectors(v: dict[str, str]) -> None:
    got = signature(VECTORS["key"], v["method"], v["path"], v["timestamp"], v["nonce"], v["body"].encode())
    assert got == v["signature"]


def _signed(now: float = NOW) -> dict[str, str]:
    return sign_request(KEY, "POST", PATH, BODY, now=now)


def test_valid_request_accepted() -> None:
    assert verify_request(KEY, MemStore(), "POST", PATH, _signed(), BODY, now=NOW).ok


def test_bad_signature_rejected() -> None:
    h = _signed()
    h[H_SIG] = "0" * 64
    assert verify_request(KEY, MemStore(), "POST", PATH, h, BODY, now=NOW).reason == "bad_signature"


def test_wrong_key_rejected() -> None:
    h = sign_request("x" * 40, "POST", PATH, BODY, now=NOW)
    assert verify_request(KEY, MemStore(), "POST", PATH, h, BODY, now=NOW).reason == "bad_signature"


def test_older_than_five_minutes_rejected() -> None:
    assert verify_request(KEY, MemStore(), "POST", PATH, _signed(NOW - 301), BODY, now=NOW).reason == "stale"


def test_exactly_five_minutes_accepted() -> None:
    assert verify_request(KEY, MemStore(), "POST", PATH, _signed(NOW - 300), BODY, now=NOW).ok


def test_more_than_five_minutes_in_future_rejected() -> None:
    assert verify_request(KEY, MemStore(), "POST", PATH, _signed(NOW + 301), BODY, now=NOW).reason == "stale"


def test_reused_nonce_rejected_even_with_fresh_signature() -> None:
    store = MemStore()
    h = _signed()
    assert verify_request(KEY, store, "POST", PATH, h, BODY, now=NOW).ok
    # re-sign with a later timestamp but the same nonce
    ts = str(int(NOW + 10))
    h2 = {H_TS: ts, H_NONCE: h[H_NONCE], H_SIG: signature(KEY, "POST", PATH, ts, h[H_NONCE], BODY)}
    assert verify_request(KEY, store, "POST", PATH, h2, BODY, now=NOW + 10).reason == "replayed"


def test_replay_of_identical_request_rejected() -> None:
    store = MemStore()
    h = _signed()
    assert verify_request(KEY, store, "POST", PATH, h, BODY, now=NOW).ok
    assert verify_request(KEY, store, "POST", PATH, h, BODY, now=NOW).reason == "replayed"


def test_body_altered_after_signing_rejected() -> None:
    assert verify_request(KEY, MemStore(), "POST", PATH, _signed(), BODY + b" ", now=NOW).reason == "bad_signature"


def test_path_altered_rejected() -> None:
    assert verify_request(KEY, MemStore(), "POST", PATH + "x", _signed(), BODY, now=NOW).reason == "bad_signature"


def test_nonce_store_down_fails_closed() -> None:
    assert verify_request(KEY, DownStore(), "POST", PATH, _signed(), BODY, now=NOW).reason == "nonce_store_unavailable"


def test_bad_signature_does_not_burn_nonce() -> None:
    store = MemStore()
    h = _signed()
    bad = {**h, H_SIG: "f" * 64}
    assert not verify_request(KEY, store, "POST", PATH, bad, BODY, now=NOW).ok
    assert verify_request(KEY, store, "POST", PATH, h, BODY, now=NOW).ok


@pytest.mark.parametrize("drop", [H_TS, H_NONCE, H_SIG])
def test_missing_header_rejected(drop: str) -> None:
    h = _signed()
    del h[drop]
    assert verify_request(KEY, MemStore(), "POST", PATH, h, BODY, now=NOW).reason == "missing_headers"
