"""Pure job handlers (unit-testable without Redis). P0 has one: diag.echo."""

from __future__ import annotations

from typing import Any


class UnknownJobKind(Exception):
    pass


def handle(kind: str, payload: dict[str, Any]) -> dict[str, Any]:
    if kind == "diag.echo":
        return {"echo": str(payload.get("message", "")), "worker": "worker-py"}
    raise UnknownJobKind(kind)
