import os
import stat
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture
def fake_nvidia_smi(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A stand-in nvidia-smi on PATH, so GPU capture paths run without a GPU."""
    script = tmp_path / "bin" / "nvidia-smi"
    script.parent.mkdir()
    script.write_text(
        "#!/bin/sh\n"
        'case "$*" in\n'
        '  *--query-gpu=name*) echo "NVIDIA L4, 23034, 550.54.15" ;;\n'
        '  *--query-gpu=utilization*) echo "87, 10240, 61.5" ;;\n'
        '  "topo -m") echo "GPU0 X" ;;\n'
        '  *) echo "| NVIDIA-SMI 550.54.15   Driver Version: 550.54.15   CUDA Version: 12.4 |" ;;\n'
        "esac\n"
    )
    script.chmod(script.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv("PATH", f"{script.parent}{os.pathsep}{os.environ['PATH']}")
    return script


@pytest.fixture(autouse=True)
def isolated_config(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path / "cfg"))
    monkeypatch.delenv("ATLAS_LAB_TOKEN", raising=False)
    monkeypatch.delenv("ATLAS_LAB_URL", raising=False)
