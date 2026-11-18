"""Jupyter notebook export/import using the upload schema (G §6.4).

Notebooks are plain nbformat v4 JSON, written with the standard library. The upload payload travels in the notebook's
metadata under `atlas_lab.upload`, so `import` sends exactly what `export` received; the cells only display it.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _src(text: str) -> list[str]:
    lines = text.splitlines(keepends=True)
    return lines or [""]


def export(payload: dict[str, Any], path: Path) -> Path:
    metrics = ", ".join(
        f"{m['name']} ({len(m.get('samples', []))} samples, {m['unit']})" for m in payload.get("metrics", [])
    )
    nb = {
        "nbformat": 4,
        "nbformat_minor": 5,
        "metadata": {
            "atlas_lab": {"upload": payload},
            "kernelspec": {"name": "python3", "display_name": "Python 3", "language": "python"},
        },
        "cells": [
            {
                "cell_type": "markdown",
                "id": "atlas-header",
                "metadata": {},
                "source": _src(
                    f"# atlas-lab run: {payload.get('config_name', '')}\n\n"
                    f"Project {payload.get('project_id')} · status {payload.get('status')} · "
                    f"{metrics or 'no metrics'}\n\n"
                    "The upload payload is stored in this notebook's metadata (`atlas_lab.upload`). "
                    "`atlas-lab notebook import` uploads it unchanged; "
                    "the server recomputes every summary from the samples.\n"
                ),
            },
            {
                "cell_type": "code",
                "id": "atlas-load",
                "metadata": {},
                "execution_count": None,
                "outputs": [],
                "source": _src(
                    "import json, statistics\n"
                    f"nb = json.load(open({path.name!r}))  # this notebook's own file\n"
                    "upload = nb['metadata']['atlas_lab']['upload']\n"
                    "for m in upload['metrics']:\n"
                    "    s = sorted(m['samples'])\n"
                    "    print(m['name'], m['unit'], 'n =', len(s), 'median =', statistics.median(s))\n"
                ),
            },
        ],
    }
    path.write_text(json.dumps(nb, indent=1) + "\n")
    return path


def import_(path: Path) -> dict[str, Any]:
    nb = json.loads(path.read_text())
    if nb.get("nbformat") != 4:
        raise ValueError("not an nbformat v4 notebook")
    up = nb.get("metadata", {}).get("atlas_lab", {}).get("upload")
    if not isinstance(up, dict):
        raise ValueError("this notebook has no atlas_lab.upload metadata (was it exported by atlas-lab?)")
    payload: dict[str, Any] = dict(up)  # pyright: ignore[reportUnknownArgumentType]
    payload.setdefault("kind", "benchmark")
    return payload
