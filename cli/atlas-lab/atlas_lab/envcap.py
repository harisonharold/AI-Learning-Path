"""Environment capture (F.5): hardware, OS, Python, libraries, git state, container digest, GPU via nvidia-smi."""

from __future__ import annotations

import os
import platform
import re
import shutil
import subprocess
from importlib import metadata
from pathlib import Path
from typing import Any

# Libraries that commonly change benchmark results; any that are installed are recorded with their versions.
TRACKED_LIBS = (
    "numpy",
    "scipy",
    "torch",
    "triton",
    "jax",
    "jaxlib",
    "cupy",
    "vllm",
    "sglang",
    "transformers",
    "flash-attn",
    "xformers",
    "tensorrt",
    "onnxruntime",
    "ray",
    "pandas",
    "pyarrow",
    "uvloop",
    "httpx",
    "grpcio",
)


def _run(cmd: list[str], timeout: float = 10.0, cwd: str | None = None) -> str | None:
    exe = shutil.which(cmd[0])
    if not exe:
        return None
    try:
        r = subprocess.run([exe, *cmd[1:]], capture_output=True, text=True, timeout=timeout, cwd=cwd, check=False)  # noqa: S603
    except (OSError, subprocess.TimeoutExpired):
        return None
    return r.stdout if r.returncode == 0 else None


def cpu_model() -> str:
    try:
        for line in Path("/proc/cpuinfo").read_text().splitlines():
            if line.lower().startswith("model name"):
                return line.split(":", 1)[1].strip()[:200]
    except OSError:
        pass
    out = _run(["sysctl", "-n", "machdep.cpu.brand_string"])
    return (out or platform.processor() or platform.machine() or "unknown").strip()[:200]


def memory_mb() -> int | None:
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemTotal:"):
                return int(line.split()[1]) // 1024
    except (OSError, ValueError):
        pass
    out = _run(["sysctl", "-n", "hw.memsize"])
    return int(out) // (1024 * 1024) if out and out.strip().isdigit() else None


def libs(extra: tuple[str, ...] = ()) -> dict[str, str]:
    out: dict[str, str] = {}
    for name in (*TRACKED_LIBS, *extra):
        try:
            out[name] = metadata.version(name)[:100]
        except metadata.PackageNotFoundError:
            continue
    return out


def git_state(cwd: str | None = None) -> tuple[str | None, bool | None]:
    sha = _run(["git", "rev-parse", "HEAD"], cwd=cwd)
    if not sha or not re.fullmatch(r"[0-9a-f]{40}", sha.strip()):
        return None, None
    status = _run(["git", "status", "--porcelain"], cwd=cwd)
    return sha.strip(), bool(status and status.strip())


def gpus() -> tuple[list[dict[str, Any]], str | None]:
    """GPU list and `nvidia-smi topo -m` output; empty when nvidia-smi is absent."""
    out = _run(["nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader,nounits"])
    if out is None:
        return [], None
    header = _run(["nvidia-smi"]) or ""
    m = re.search(r"CUDA Version:\s*([0-9.]+)", header)
    cuda = m.group(1) if m else None
    found: list[dict[str, Any]] = []
    for line in out.strip().splitlines()[:16]:
        parts = [p.strip() for p in line.split(",")]
        if len(parts) >= 3:
            mem = int(float(parts[1])) if re.fullmatch(r"[0-9.]+", parts[1]) else 0
            found.append({"name": parts[0][:200], "memory_mb": mem, "driver": parts[2][:50], "cuda": cuda})
    topo = _run(["nvidia-smi", "topo", "-m"])
    return found, (topo.strip()[:20000] if topo else None)


def capture(cwd: str | None = None, extra_libs: tuple[str, ...] = ()) -> dict[str, Any]:
    gpu_list, topo = gpus()
    sha, dirty = git_state(cwd)
    env: dict[str, Any] = {
        "cpu": cpu_model(),
        "cpu_count": os.cpu_count() or 1,
        "os": platform.platform()[:200],
        "python": platform.python_version(),
        "libs": libs(extra_libs),
        "git_sha": sha,
        "container_digest": os.environ.get("ATLAS_CONTAINER_DIGEST") or None,
        "gpu": gpu_list,
    }
    mem = memory_mb()
    if mem:
        env["memory_mb"] = mem
    if dirty is not None:
        env["git_dirty"] = dirty
    if topo:
        env["gpu_topology"] = topo
    return env
