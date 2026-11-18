"""AT-17: `atlas-lab run --dry-run` prints the captured env (CPU, OS, Python, git SHA; GPU fields when nvidia-smi
exists) and a cost estimate when --gpu-rate is given. Nothing runs and nothing is uploaded."""

import json
from pathlib import Path

from atlas_lab.cli import app
from typer.testing import CliRunner

runner = CliRunner()


def dry(*extra: str) -> dict:  # type: ignore[type-arg]
    r = runner.invoke(
        app, ["run", "bench", "--project", "1", "--dry-run", *extra, "--", "python", "-c", "raise SystemExit(9)"]
    )
    assert r.exit_code == 0, r.output
    return json.loads(r.output)


def test_env_fields_without_gpu(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("PATH", "/usr/bin:/bin")  # no nvidia-smi here
    out = dry()
    env = out["env"]
    assert env["cpu"] and env["cpu_count"] >= 1 and env["os"] and env["python"]
    assert env["gpu"] == [] and "gpu_topology" not in env
    assert "git_sha" in env  # 40-hex inside a checkout, null outside one
    assert out["cost_estimate"] is None
    assert out["plan"]["command"] == ["python", "-c", "raise SystemExit(9)"]


def test_gpu_fields_when_nvidia_smi_exists(fake_nvidia_smi: Path) -> None:
    env = dry()["env"]
    assert env["gpu"] == [{"name": "NVIDIA L4", "memory_mb": 23034, "driver": "550.54.15", "cuda": "12.4"}]
    assert env["gpu_topology"] == "GPU0 X"


def test_cost_estimate_with_gpu_rate_and_max_hours() -> None:
    c = dry("--gpu-rate", "0.80", "--max-hours", "2.5")["cost_estimate"]
    assert c["max_usd"] == 2.0 and c["hours"] == 2.5 and c["rate_usd_per_hour"] == 0.8
    assert "Estimate only" in c["note"]


def test_cost_estimate_from_timeouts_or_a_warning_without_limits() -> None:
    c = dry("--gpu-rate", "3.60", "--timeout", "600", "--repeat", "5", "--warmup", "1")["cost_estimate"]
    assert c["hours"] == 1.0 and c["max_usd"] == 3.6
    assert dry("--gpu-rate", "1")["cost_estimate"]["max_usd"] is None


def test_dry_run_writes_no_shutdown_script(tmp_path: Path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.chdir(tmp_path)
    dry("--max-hours", "1")
    assert not (tmp_path / "atlas-lab-shutdown.sh").exists()
