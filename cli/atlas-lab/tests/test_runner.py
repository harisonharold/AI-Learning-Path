"""Experiment runs: samples from ATLAS_METRIC lines or $ATLAS_LAB_OUT; failures kept; timeouts; valid payloads."""

import json
import sys
from pathlib import Path

from atlas_lab.runner import Plan, run_plan, shutdown_script
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[3]

SCHEMA = json.loads((ROOT / "packages/contracts/schemas/benchmark.schema.json").read_text())
ENV = {
    "cpu": "test",
    "cpu_count": 1,
    "os": "test",
    "python": "3.12",
    "libs": {},
    "git_sha": None,
    "container_digest": None,
    "gpu": [],
}


def noop(*_: object) -> None:
    pass


def valid(p: dict) -> None:  # type: ignore[type-arg]
    body = {k: v for k, v in p.items() if k != "kind"}
    Draft202012Validator(SCHEMA, format_checker=Draft202012Validator.FORMAT_CHECKER).validate(body)


def plan(code: str, **kw: object) -> Plan:
    return Plan(project_id=1, config_name="c", config={"n": 1}, command=[sys.executable, "-c", code], **kw)  # type: ignore[arg-type]


def test_metric_lines_become_samples_and_warmups_are_flagged() -> None:
    out = run_plan(
        plan("for v in (1.5, 2.5, 3.0): print('ATLAS_METRIC latency_ms ms', v)", repeat=2, warmup=1), ENV, noop
    )
    assert [p["is_warmup"] for p in out] == [True, False, False]
    assert out[1]["metrics"] == [{"name": "latency_ms", "unit": "ms", "samples": [1.5, 2.5, 3.0]}]
    for p in out:
        valid(p)


def test_out_file_samples() -> None:
    data = "{'metrics': {'tokens_per_s': {'unit': 'tokens/s', 'samples': [100, 120]}}}"
    code = f"import json, os; json.dump({data}, open(os.environ['ATLAS_LAB_OUT'], 'w'))"
    out = run_plan(plan(code, repeat=1, warmup=0), ENV, noop)
    assert out[0]["metrics"][0] == {"name": "tokens_per_s", "unit": "tokens/s", "samples": [100.0, 120.0]}


def test_failures_and_timeouts_are_kept_as_failed_runs() -> None:
    out = run_plan(plan("import sys; sys.stderr.write('boom'); sys.exit(3)", repeat=1, warmup=0), ENV, noop)
    assert out[0]["status"] == "failed" and "Exit code 3" in out[0]["failure_note"] and "boom" in out[0]["failure_note"]
    valid(out[0])
    slow = run_plan(plan("import time; time.sleep(5)", repeat=1, warmup=0, timeout_s=0.5), ENV, noop)
    assert slow[0]["status"] == "failed" and "Timed out" in slow[0]["failure_note"]
    none = run_plan(plan("print('no metrics')", repeat=1, warmup=0), ENV, noop)
    assert "reported no samples" in none[0]["failure_note"]


def test_the_runner_token_is_not_passed_to_the_benchmark(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("ATLAS_LAB_TOKEN", "atl_" + "x" * 43)
    out = run_plan(
        plan(
            "import os; print('ATLAS_METRIC leaked count', 1 if 'ATLAS_LAB_TOKEN' in os.environ else 0)",
            repeat=1,
            warmup=0,
        ),
        ENV,
        noop,
    )
    assert out[0]["metrics"][0]["samples"] == [0.0]


def test_shutdown_script_is_written_not_run(tmp_path: Path) -> None:
    p = shutdown_script(1.5, tmp_path / "s.sh")
    text = p.read_text()
    assert "sleep 5400" in text and "shutdown -h now" in text and p.stat().st_mode & 0o111
