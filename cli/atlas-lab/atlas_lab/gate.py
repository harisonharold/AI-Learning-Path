"""Gate test runs: hidden tests from the server's bundle, executed in Docker with no network (D-15, FR-5b).

The learner's code runs only on the learner's machine (D §security: the hosted server never runs user code).
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from atlas_lab import __version__
from atlas_lab.canonical import canonical_json, sha256_hex
from atlas_lab.runner import now_iso

MARKER = "ATLAS_LAB_RESULT "


class GateError(Exception):
    pass


def bundle_sha(manifest: dict[str, Any], files: dict[str, str]) -> str:
    return sha256_hex(canonical_json({"manifest": manifest, "files": files}))


def verify_bundle(bundle: dict[str, Any]) -> None:
    got = bundle_sha(bundle["manifest"], bundle["files"])
    if got != bundle["sha256"]:
        raise GateError(
            f"bundle hash mismatch (got {got[:12]}, server says {str(bundle['sha256'])[:12]}); refusing to run it"
        )
    if "@sha256:" not in bundle["manifest"]["image"]:
        raise GateError("bundle image is not pinned by digest; refusing to run it")


@dataclass(frozen=True)
class Prepared:
    bundle_dir: Path
    work_dir: Path
    argv: list[str]
    name: str
    timeout_s: int


def docker_argv(manifest: dict[str, Any], bundle_dir: Path, work_dir: Path, name: str) -> list[str]:
    mem = f"{int(manifest['memory_mb'])}m"
    return [
        "docker",
        "run",
        "--rm",
        "--name",
        name,
        "--network",
        "none",  # no network at all while learner code runs
        "--read-only",
        "--tmpfs",
        "/tmp:rw,size=64m,noexec,nosuid",  # noqa: S108 - a tmpfs inside the container
        "--cpus",
        str(manifest["cpus"]),
        "--memory",
        mem,
        "--memory-swap",
        mem,
        "--pids-limit",
        "256",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--user",
        "65534:65534",
        "-v",
        f"{bundle_dir}:/bundle:ro",
        "-v",
        f"{work_dir}:/work:ro",
        manifest["image"],
        *manifest["command"],
    ]


def prepare(bundle: dict[str, Any], solution: Path, root: Path) -> Prepared:
    m = bundle["manifest"]
    bdir, wdir = root / "bundle", root / "work"
    for d in (root, bdir, wdir):
        d.mkdir(exist_ok=True)
        d.chmod(0o755)  # the container user (nobody) must be able to read them
    for fname, text in bundle["files"].items():
        if "/" in fname or fname.startswith("."):
            raise GateError(f"unsafe file name in bundle: {fname!r}")
        (bdir / fname).write_text(text)
    (bdir / "tests.txt").write_text("\n".join(m["tests"]) + "\n")
    shutil.copyfile(solution, wdir / m["submission"])
    for p in [*bdir.iterdir(), *wdir.iterdir()]:
        p.chmod(0o644)
    name = f"atlas-lab-{uuid.uuid4().hex[:12]}"
    return Prepared(bdir, wdir, docker_argv(m, bdir, wdir, name), name, int(m["timeout_seconds"]))


def parse_results(stdout: str, tests: list[str]) -> list[dict[str, Any]]:
    line = next((x for x in stdout.splitlines() if x.startswith(MARKER)), None)
    if line is None:
        raise GateError("the test harness printed no result line")
    results: list[dict[str, Any]] = json.loads(line[len(MARKER) :])["results"]
    by_name = {r["test"]: r for r in results}
    out: list[dict[str, Any]] = []
    for t in tests:  # exactly the bundle's tests, in order; a missing one counts as failed
        r = by_name.get(t, {"test": t, "passed": False, "duration_ms": 0.0, "message": "not reported by the harness"})
        item: dict[str, Any] = {
            "test": t,
            "passed": bool(r["passed"]),
            "duration_ms": max(0.0, float(r["duration_ms"])),
        }
        if r.get("message"):
            item["message"] = str(r["message"])[:2000]
        out.append(item)
    return out


def image_digest(image: str) -> str:
    return "sha256:" + image.split("@sha256:", 1)[1]


def run_gate(bundle: dict[str, Any], solution: Path, env: dict[str, Any], docker: str = "docker") -> dict[str, Any]:
    verify_bundle(bundle)
    if not shutil.which(docker):
        raise GateError("Docker is required for gate tests (they run with --network none). Install Docker and retry.")
    if not solution.is_file():
        raise GateError(f"solution file not found: {solution}")
    m = bundle["manifest"]
    pull = subprocess.run([docker, "pull", "-q", m["image"]], capture_output=True, text=True, check=False)  # noqa: S603
    if pull.returncode != 0:
        raise GateError(f"docker pull failed: {pull.stderr.strip()[-500:]}")
    with tempfile.TemporaryDirectory(prefix="atlas-lab-gate-") as tmp:
        prep = prepare(bundle, solution, Path(tmp))
        argv = [docker, *prep.argv[1:]]
        started = now_iso()
        try:
            p = subprocess.run(argv, capture_output=True, text=True, timeout=prep.timeout_s + 30, check=False)  # noqa: S603
        except subprocess.TimeoutExpired:
            subprocess.run([docker, "kill", prep.name], capture_output=True, check=False)  # noqa: S603
            results = [
                {"test": t, "passed": False, "duration_ms": 0.0, "message": f"timed out after {prep.timeout_s} s"}
                for t in m["tests"]
            ]
            stdout = ""
        else:
            stdout = p.stdout
            if p.returncode != 0 and MARKER not in stdout:
                raise GateError(f"the container failed (exit {p.returncode}): {(p.stderr or '').strip()[-800:]}")
            results = parse_results(stdout, list(m["tests"]))
        return {
            "kind": "gate_tests",
            "schema_version": "1",
            "bundle": bundle["ref"],
            "bundle_sha256": bundle["sha256"],
            "results": results,
            "docker": {"image_digest": image_digest(m["image"]), "network": "none"},
            "env": env,
            "runner_version": __version__,
            "started_at": started,
            "ended_at": now_iso(),
        }
