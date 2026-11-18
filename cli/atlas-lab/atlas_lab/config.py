"""Token storage (THREAT T-R4): the token is read from a hidden prompt or stdin, never from a command-line value,
stored in a 0600 file, and redacted from anything atlas-lab prints."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path

TOKEN_RE = re.compile(r"^atl_[A-Za-z0-9_-]{43}$")
_REDACT = re.compile(r"atl_[A-Za-z0-9_-]{43}")


def config_path() -> Path:
    base = os.environ.get("XDG_CONFIG_HOME") or str(Path.home() / ".config")
    return Path(base) / "atlas-lab" / "config.json"


@dataclass(frozen=True)
class Config:
    url: str
    token: str


def save(cfg: Config, path: Path | None = None) -> Path:
    p = path or config_path()
    p.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump({"url": cfg.url, "token": cfg.token}, f)
    os.chmod(p, 0o600)  # also tighten a pre-existing file
    return p


def load(path: Path | None = None) -> Config | None:
    env_token, env_url = os.environ.get("ATLAS_LAB_TOKEN"), os.environ.get("ATLAS_LAB_URL")
    p = path or config_path()
    data: dict[str, str] = {}
    if p.exists():
        data = json.loads(p.read_text())
    token, url = env_token or data.get("token"), env_url or data.get("url")
    if not token or not url:
        return None
    return Config(url=url.rstrip("/"), token=token)


def redact(text: str) -> str:
    return _REDACT.sub("atl_[redacted]", text)
