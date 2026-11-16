"""Structured JSON logs with secret redaction (X-03)."""

from __future__ import annotations

import json
import re
import sys
from datetime import UTC, datetime
from typing import Any

_SENSITIVE = re.compile(r"(secret|token|password|authorization|cookie|api[-_]?key|private[-_]?key|signature)", re.I)
_known: list[str] = []


def register_secrets(values: list[str]) -> None:
    _known[:] = [v for v in values if len(v) >= 6]


def redact(value: Any, depth: int = 0) -> Any:
    if depth > 8:
        return "[depth]"
    if isinstance(value, str):
        for s in _known:
            value = value.replace(s, "[REDACTED]")
        return value
    if isinstance(value, dict):
        return {
            str(k): ("[REDACTED]" if _SENSITIVE.search(str(k)) else redact(v, depth + 1))
            for k, v in value.items()  # pyright: ignore[reportUnknownVariableType]
        }
    if isinstance(value, list | tuple):
        return [redact(v, depth + 1) for v in value]  # pyright: ignore[reportUnknownVariableType]
    return value


def log(level: str, msg: str, **fields: Any) -> None:
    line = {"ts": datetime.now(UTC).isoformat(), "level": level, "msg": redact(msg), **redact(fields)}
    sys.stdout.write(json.dumps(line, default=str) + "\n")
    sys.stdout.flush()
