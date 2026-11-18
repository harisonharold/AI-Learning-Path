"""HTTP client for /api/runner/* (bearer token only)."""

from __future__ import annotations

from typing import Any

import httpx

from atlas_lab import __version__
from atlas_lab.config import Config, redact


class ApiError(Exception):
    def __init__(self, status: int, body: dict[str, Any]) -> None:
        err = body.get("error", {}) if isinstance(body, dict) else {}  # pyright: ignore[reportUnnecessaryIsInstance]
        self.status = status
        self.code = str(err.get("code", "HTTP_ERROR"))
        self.message = redact(str(err.get("message", f"HTTP {status}")))
        self.fields: list[dict[str, str]] = list((err.get("details") or {}).get("fields") or [])
        self.details: dict[str, Any] = dict(err.get("details") or {})
        super().__init__(f"{self.status} {self.code}: {self.message}")


class Client:
    def __init__(self, cfg: Config, transport: httpx.BaseTransport | None = None, timeout: float = 120.0) -> None:
        self._http = httpx.Client(
            base_url=cfg.url,
            timeout=timeout,
            transport=transport,
            headers={"authorization": f"Bearer {cfg.token}", "user-agent": f"atlas-lab/{__version__}"},
        )

    def _check(self, r: httpx.Response) -> dict[str, Any]:
        try:
            body: dict[str, Any] = r.json()
        except ValueError:
            body = {}
        if r.status_code >= 400:
            raise ApiError(r.status_code, body)
        return body

    def whoami(self) -> dict[str, Any]:
        return self._check(self._http.get("/api/runner/whoami"))

    def bundle(self, ref: str | None = None, exercise: str | None = None) -> dict[str, Any]:
        params = {"ref": ref} if ref else {"exercise": exercise or ""}
        return self._check(self._http.get("/api/runner/bundle", params=params))

    def upload(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._check(self._http.post("/api/runner/results", json=payload))

    def close(self) -> None:
        self._http.close()
