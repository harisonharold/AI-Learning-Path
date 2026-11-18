"""Pure job handlers (unit-testable without Redis)."""

from __future__ import annotations

from typing import Any

from atlas_common import report, stats


class UnknownJobKind(Exception):
    pass


class BadJobInput(Exception):
    """Input that can never succeed; the job fails without retries being useful."""


def _summarize(payload: dict[str, Any]) -> dict[str, Any]:
    seed = int(payload.get("seed", stats.DEFAULT_SEED))
    resamples = int(payload.get("resamples", stats.DEFAULT_RESAMPLES))
    out: dict[str, Any] = {}
    for m in payload.get("metrics", []):
        try:
            out[str(m["name"])] = stats.summarize(m["values"], seed, resamples)
        except (KeyError, stats.StatsInputError) as e:
            raise BadJobInput(f"metric {m.get('name')!r}: {e}") from e
    return {"run_id": payload.get("run_id"), "metrics": out}


def handle(kind: str, payload: dict[str, Any]) -> dict[str, Any]:
    if kind == "diag.echo":
        return {"echo": str(payload.get("message", "")), "worker": "worker-py"}
    if kind == "stats.summarize":
        return _summarize(payload)
    if kind == "report.render":
        try:
            return {"project_id": payload.get("project_id"), **report.build(payload)}
        except (KeyError, stats.StatsInputError) as e:
            raise BadJobInput(str(e)) from e
    raise UnknownJobKind(kind)
