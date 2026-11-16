"""Internal request signing; byte-for-byte the same as apps/web/modules/platform/internal/hmac.ts (PLAN D-16).

signature = hex(HMAC-SHA256(key, METHOD \\n path \\n timestamp \\n nonce \\n hex(sha256(body))))
Reject when |now - timestamp| > 300 s or the nonce was already seen (Redis SET NX EX 600). Store errors fail closed.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import time
from dataclasses import dataclass
from typing import Literal, Protocol

MAX_SKEW_SECONDS = 300
NONCE_TTL_SECONDS = 600
H_TS, H_NONCE, H_SIG = "x-atlas-timestamp", "x-atlas-nonce", "x-atlas-signature"

_TS = re.compile(r"^\d{1,12}$")
_NONCE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
_SIG = re.compile(r"^[0-9a-f]{64}$")


def canonical(method: str, path: str, ts: str, nonce: str, body: bytes) -> bytes:
    return "\n".join([method.upper(), path, ts, nonce, hashlib.sha256(body).hexdigest()]).encode()


def signature(key: str, method: str, path: str, ts: str, nonce: str, body: bytes) -> str:
    return hmac.new(key.encode(), canonical(method, path, ts, nonce, body), hashlib.sha256).hexdigest()


def sign_request(key: str, method: str, path: str, body: bytes, now: float | None = None) -> dict[str, str]:
    ts = str(int(now if now is not None else time.time()))
    nonce = secrets.token_urlsafe(16)
    return {H_TS: ts, H_NONCE: nonce, H_SIG: signature(key, method, path, ts, nonce, body)}


class NonceStore(Protocol):
    def claim(self, nonce: str, ttl_seconds: int) -> bool:
        """True if the nonce is new. Must raise if the store is unavailable."""
        ...


Reason = Literal["missing_headers", "bad_timestamp", "stale", "bad_signature", "replayed", "nonce_store_unavailable"]


@dataclass(frozen=True)
class Verdict:
    ok: bool
    reason: Reason | None = None


def verify_request(
    key: str,
    store: NonceStore,
    method: str,
    path: str,
    headers: dict[str, str],
    body: bytes,
    now: float | None = None,
) -> Verdict:
    ts, nonce, sig = headers.get(H_TS), headers.get(H_NONCE), headers.get(H_SIG)
    if not ts or not nonce or not sig:
        return Verdict(False, "missing_headers")
    if not (_TS.match(ts) and _NONCE.match(nonce) and _SIG.match(sig)):
        return Verdict(False, "bad_timestamp")
    current = int(now if now is not None else time.time())
    if abs(current - int(ts)) > MAX_SKEW_SECONDS:
        return Verdict(False, "stale")
    if not hmac.compare_digest(signature(key, method, path, ts, nonce, body), sig):
        return Verdict(False, "bad_signature")
    try:
        fresh = store.claim(nonce, NONCE_TTL_SECONDS)
    except Exception:
        return Verdict(False, "nonce_store_unavailable")
    return Verdict(True) if fresh else Verdict(False, "replayed")


class RedisLike(Protocol):
    def set(self, name: str, value: str, *, nx: bool = ..., ex: int = ...) -> object: ...


class RedisNonceStore:
    def __init__(self, client: RedisLike) -> None:
        self._r = client

    def claim(self, nonce: str, ttl_seconds: int) -> bool:
        return bool(self._r.set(f"hmac:nonce:{nonce}", "1", nx=True, ex=ttl_seconds))
