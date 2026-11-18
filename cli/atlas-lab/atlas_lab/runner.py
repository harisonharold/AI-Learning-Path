"""Benchmark runs: repeat a command, collect its samples, build one upload per repetition (FR-14, F.5).

A benchmark command reports samples either by printing lines `ATLAS_METRIC <name> <unit> <value>` or by writing JSON
`{"metrics": {"<name>": {"unit": "ms", "samples": [...]}}}` to the file named by $ATLAS_LAB_OUT.
"""

from __future__ import annotations

import json
import math
import os
import re
import shlex
import shutil
import subprocess
import tempfile
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from atlas_lab.canonical import config_hash

METRIC_LINE = re.compile(r"^ATLAS_METRIC\s+([a-z][a-z0-9_.]{0,63})\s+([A-Za-z%/]{1,16})\s+(\S+)\s*$")


def now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


@dataclass
class Plan:
    project_id: int
    config_name: str
    config: dict[str, Any]
    command: list[str]
    repeat: int = 5
    warmup: int = 1
    baseline: bool = False
    timeout_s: float | None = None  # per repetition
    max_hours: float | None = None  # whole session
    gpu_rate: float | None = None  # USD per hour


def cost_estimate(plan: Plan) -> dict[str, Any] | None:
    """Pre-flight GPU cost (C §8 guardrail 2): hours x rate. Uses --max-hours as the bound when given."""
    if plan.gpu_rate is None:
        return None
    if plan.max_hours is not None:
        hours = plan.max_hours
        basis = "--max-hours (the session is stopped at this limit)"
    elif plan.timeout_s is not None:
        hours = plan.timeout_s * (plan.repeat + plan.warmup) / 3600
        basis = "per-repetition timeout x repetitions"
    else:
        return {
            "rate_usd_per_hour": plan.gpu_rate,
            "hours": None,
            "max_usd": None,
            "note": "No time limit given: set --max-hours to bound the cost.",
        }
    return {
        "rate_usd_per_hour": plan.gpu_rate,
        "hours": round(hours, 4),
        "max_usd": round(hours * plan.gpu_rate, 2),
        "basis": basis,
        "note": "Estimate only; your provider's bill is authoritative. Prices change.",
    }


def shutdown_script(max_hours: float, path: Path) -> Path:
    """Writes (does not run) a script that powers the machine off after max_hours. The learner arms it."""
    secs = math.ceil(max_hours * 3600)
    path.write_text(
        "#!/bin/sh\n"
        "# Written by atlas-lab. Powers this machine off after the --max-hours limit so a rented GPU stops billing.\n"
        "# Arm it yourself on the GPU box:  nohup sh atlas-lab-shutdown.sh >/dev/null 2>&1 &\n"
        "# Disarm: kill the sleeping process (pkill -f atlas-lab-shutdown.sh).\n"
        f"sleep {secs}\n"
        "sync\n"
        "sudo -n shutdown -h now || shutdown -h now || poweroff\n"
    )
    path.chmod(0o755)
    return path


class GpuSampler:
    """Samples util/memory/power with nvidia-smi once per interval, if nvidia-smi exists."""

    def __init__(self, interval_s: float = 1.0) -> None:
        self.interval_s = interval_s
        self.points: list[dict[str, float | int]] = []
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._exe = shutil.which("nvidia-smi")

    def start(self) -> None:
        if not self._exe:
            return
        self._t0 = time.monotonic()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def _loop(self) -> None:
        assert self._exe
        while not self._stop.is_set():
            try:
                out = (
                    subprocess.run(  # noqa: S603
                        [
                            self._exe,
                            "--query-gpu=utilization.gpu,memory.used,power.draw",
                            "--format=csv,noheader,nounits",
                        ],
                        capture_output=True,
                        text=True,
                        timeout=5,
                        check=False,
                    )
                    .stdout.strip()
                    .splitlines()
                )
                if out:
                    parts = [p.strip() for p in out[0].split(",")]
                    pt: dict[str, float | int] = {
                        "t_ms": int((time.monotonic() - self._t0) * 1000),
                        "util_pct": min(100.0, float(parts[0])),
                        "mem_mb": float(parts[1]),
                    }
                    if len(parts) > 2 and re.fullmatch(r"[0-9.]+", parts[2]):
                        pt["power_w"] = float(parts[2])
                    self.points.append(pt)
            except (OSError, ValueError, subprocess.TimeoutExpired, IndexError):
                pass
            self._stop.wait(self.interval_s)

    def stop(self) -> list[dict[str, float | int]]:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=10)
        return self.points


@dataclass
class RepResult:
    ok: bool
    metrics: dict[str, dict[str, Any]] = field(default_factory=lambda: {})
    note: str | None = None
    started_at: str = ""
    ended_at: str = ""
    gpu: list[dict[str, float | int]] = field(default_factory=lambda: [])


def parse_metrics(stdout: str, out_file: Path | None) -> dict[str, dict[str, Any]]:
    metrics: dict[str, dict[str, Any]] = {}
    for line in stdout.splitlines():
        m = METRIC_LINE.match(line.strip())
        if m:
            name, unit, value = m.groups()
            v = float(value)
            if math.isfinite(v):
                metrics.setdefault(name, {"unit": unit, "samples": []})["samples"].append(v)
    if out_file and out_file.exists() and out_file.stat().st_size:
        data = json.loads(out_file.read_text())
        for name, spec in dict(data.get("metrics", {})).items():
            metrics.setdefault(name, {"unit": spec["unit"], "samples": []})["samples"].extend(
                float(x) for x in spec["samples"]
            )
    return metrics


def run_once(plan: Plan, deadline: float | None, cwd: str | None = None) -> RepResult:
    with tempfile.TemporaryDirectory(prefix="atlas-lab-") as tmp:
        out_file = Path(tmp) / "out.json"
        env = {**os.environ, "ATLAS_LAB_OUT": str(out_file)}
        env.pop("ATLAS_LAB_TOKEN", None)  # the benchmark never needs the runner token
        timeout = plan.timeout_s
        if deadline is not None:
            left = deadline - time.monotonic()
            if left <= 0:
                return RepResult(
                    False,
                    note="Stopped: --max-hours limit reached before this repetition.",
                    started_at=now_iso(),
                    ended_at=now_iso(),
                )
            timeout = min(timeout, left) if timeout else left
        sampler = GpuSampler()
        started = now_iso()
        sampler.start()
        try:
            p = subprocess.run(  # noqa: S603 - the learner's own benchmark command, on their machine
                plan.command, capture_output=True, text=True, timeout=timeout, env=env, cwd=cwd, check=False
            )
        except subprocess.TimeoutExpired:
            return RepResult(
                False,
                note=f"Timed out after {timeout:.0f} s.",
                started_at=started,
                ended_at=now_iso(),
                gpu=sampler.stop(),
            )
        except OSError as e:
            return RepResult(
                False,
                note=f"Could not start the command: {e}",
                started_at=started,
                ended_at=now_iso(),
                gpu=sampler.stop(),
            )
        gpu = sampler.stop()
        ended = now_iso()
        if p.returncode != 0:
            tail = (p.stderr or p.stdout)[-1500:].strip()
            return RepResult(
                False, note=f"Exit code {p.returncode}. {tail}"[:4000], started_at=started, ended_at=ended, gpu=gpu
            )
        try:
            metrics = parse_metrics(p.stdout, out_file)
        except (ValueError, KeyError, TypeError) as e:
            return RepResult(False, note=f"Could not read metrics: {e}", started_at=started, ended_at=ended, gpu=gpu)
        if not metrics:
            return RepResult(
                False,
                note="The command reported no samples (print ATLAS_METRIC lines or write $ATLAS_LAB_OUT).",
                started_at=started,
                ended_at=ended,
                gpu=gpu,
            )
        return RepResult(True, metrics=metrics, started_at=started, ended_at=ended, gpu=gpu)


def payload(plan: Plan, env: dict[str, Any], rep: RepResult, warmup: bool) -> dict[str, Any]:
    body: dict[str, Any] = {
        "kind": "benchmark",
        "schema_version": "1",
        "project_id": plan.project_id,
        "config_name": plan.config_name,
        "config": plan.config,
        "config_hash": config_hash(plan.config),
        "env": env,
        "metrics": [{"name": k, "unit": v["unit"], "samples": v["samples"]} for k, v in rep.metrics.items()]
        if rep.ok
        else [],
        "status": "ok" if rep.ok else "failed",
        "is_baseline": plan.baseline,
        "is_warmup": warmup,
        "started_at": rep.started_at,
        "ended_at": rep.ended_at,
        "command": shlex.join(plan.command)[:2000],
    }
    if not rep.ok:
        body["failure_note"] = rep.note or "failed"
    if rep.gpu:
        body["gpu_timeline"] = rep.gpu
    return body


def run_plan(
    plan: Plan, env: dict[str, Any], on_rep: Callable[[int, bool, RepResult], None], cwd: str | None = None
) -> list[dict[str, Any]]:
    """Runs warm-ups then repetitions; failed repetitions are kept (F.5) and uploaded as failed runs."""
    deadline = time.monotonic() + plan.max_hours * 3600 if plan.max_hours else None
    out: list[dict[str, Any]] = []
    for i in range(plan.warmup + plan.repeat):
        warm = i < plan.warmup
        rep = run_once(plan, deadline, cwd)
        on_rep(i, warm, rep)
        out.append(payload(plan, env, rep, warm))
        if deadline is not None and time.monotonic() >= deadline:
            break
    return out
