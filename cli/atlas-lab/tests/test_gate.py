"""Gate runs: bundle hash verified before running, Docker locked down (--network none), results normalised to the
bundle's test list. The Docker test runs the real W1 bundle against the reference solution when Docker is available."""

import json
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

import pytest
from atlas_lab.gate import GateError, bundle_sha, docker_argv, parse_results, prepare, run_gate, verify_bundle

ROOT = Path(__file__).resolve().parents[3]

BUNDLE_DIR = ROOT / "content" / "gate-tests" / "w01@1"


def load_manifest() -> dict[str, Any]:
    """Minimal reader for the flat bundle.yaml (keys, quoted strings, numbers, [a, b] lists, `- item` lists)."""
    m: dict[str, Any] = {}
    key = None
    for raw in (BUNDLE_DIR / "bundle.yaml").read_text().splitlines():
        line = raw.split(" #", 1)[0].rstrip() if not raw.lstrip().startswith("#") else ""
        if not line:
            continue
        if line.startswith("  - ") and key:
            m[key].append(line[4:].strip())
            continue
        k, _, v = line.partition(":")
        key, v = k.strip(), v.strip()
        if v == "":
            m[key] = []
        elif v.startswith("["):
            m[key] = [x.strip().strip('"') for x in v[1:-1].split(",")]
        elif re.fullmatch(r"-?\d+", v):
            m[key] = int(v)
        else:
            m[key] = v.strip('"')
    return m


def bundle() -> dict[str, Any]:
    m = load_manifest()
    files = {f: (BUNDLE_DIR / f).read_text() for f in m["files"]}
    return {"ref": m["ref"], "sha256": bundle_sha(m, files), "manifest": m, "files": files}


def test_a_tampered_bundle_is_refused() -> None:
    b = bundle()
    verify_bundle(b)
    b["files"]["test_hidden.py"] += "\n# changed"
    with pytest.raises(GateError, match="hash mismatch"):
        verify_bundle(b)


def test_docker_is_locked_down() -> None:
    argv = docker_argv(bundle()["manifest"], Path("/b"), Path("/w"), "n")
    joined = " ".join(argv)
    for flag in (
        "--network none",
        "--read-only",
        "--cap-drop ALL",
        "--security-opt no-new-privileges",
        "--user 65534:65534",
        "/b:/bundle:ro",
        "/w:/work:ro",
        "--memory 256m",
        "--pids-limit 256",
    ):
        assert flag in joined
    assert re.search(r"@sha256:[0-9a-f]{64}", joined)


def test_results_follow_the_bundle_test_list() -> None:
    results = [
        {"test": "test_a", "passed": True, "duration_ms": 1},
        {"test": "extra", "passed": True, "duration_ms": 1},
    ]
    line = "ATLAS_LAB_RESULT " + json.dumps({"results": results})
    out = parse_results("noise\n" + line, ["test_a", "test_b"])
    assert [r["test"] for r in out] == ["test_a", "test_b"]
    assert out[1]["passed"] is False and "not reported" in out[1]["message"]
    with pytest.raises(GateError):
        parse_results("no marker", ["test_a"])


def test_prepare_rejects_unsafe_file_names(tmp_path: Path) -> None:
    b = bundle()
    b["files"]["../escape.py"] = "x"
    sol = tmp_path / "solution.py"
    sol.write_text("x = 1")
    with pytest.raises(GateError, match="unsafe"):
        prepare(b, sol, tmp_path / "run")


def docker_ready() -> bool:
    if not shutil.which("docker"):
        return False
    image = load_manifest()["image"]
    r = subprocess.run(["docker", "image", "inspect", image], capture_output=True, check=False)  # noqa: S603, S607
    return r.returncode == 0


@pytest.mark.skipif(not docker_ready(), reason="Docker or the pinned image is not available here")
def test_real_bundle_in_docker_reference_passes_starter_fails(tmp_path: Path) -> None:
    env = {
        "cpu": "t",
        "cpu_count": 1,
        "os": "t",
        "python": "3.12",
        "libs": {},
        "git_sha": None,
        "container_digest": None,
        "gpu": [],
    }
    ref = run_gate(bundle(), ROOT / "content/exercises/ex-w01-log-levels/solution.py", env)
    assert all(r["passed"] for r in ref["results"]) and ref["docker"]["network"] == "none"
    starter = tmp_path / "solution.py"
    starter.write_text("def count_levels(lines):\n    return {}\n")
    res = run_gate(bundle(), starter, env)
    assert not all(r["passed"] for r in res["results"])
    # Learner code has no network inside the container.
    net = tmp_path / "net.py"
    net.write_text(
        "import socket\n"
        "def count_levels(lines):\n"
        "    socket.create_connection(('1.1.1.1', 53), timeout=2)\n"
        "    return {}\n"
    )
    blocked = run_gate(bundle(), net, env)
    assert any(
        "Network is unreachable" in r.get("message", "") or "OSError" in r.get("message", "")
        for r in blocked["results"]
    )
