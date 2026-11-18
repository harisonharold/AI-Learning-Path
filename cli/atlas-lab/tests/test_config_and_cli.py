"""Token handling (T-R4): hidden prompt or stdin only, 0600 file, redacted output; upload error display; notebooks."""

import json
import stat
from pathlib import Path
from typing import Any

import pytest
from atlas_lab import config, notebook
from atlas_lab.api import ApiError, Client
from atlas_lab.cli import app
from typer.testing import CliRunner

TOKEN = "atl_" + "A" * 43
runner = CliRunner()


def fake_whoami(self: Client) -> dict[str, Any]:
    return {"ok": True, "scopes": ["results:write"]}


def test_login_reads_the_token_from_stdin_and_saves_it_0600(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(Client, "whoami", fake_whoami)
    r = runner.invoke(app, ["login", "--url", "http://atlas.test", "--token-stdin"], input=TOKEN + "\n")
    assert r.exit_code == 0, r.output
    assert TOKEN not in r.output
    p = config.config_path()
    assert stat.S_IMODE(p.stat().st_mode) == 0o600
    assert json.loads(p.read_text()) == {"url": "http://atlas.test", "token": TOKEN}


def test_login_prompt_hides_input(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, Any] = {}
    monkeypatch.setattr(Client, "whoami", fake_whoami)

    def fake_prompt(text: str, hide_input: bool = False, **_: Any) -> str:
        seen["hide"] = hide_input
        return TOKEN

    monkeypatch.setattr("atlas_lab.cli.typer.prompt", fake_prompt)
    assert runner.invoke(app, ["login", "--token"]).exit_code == 0
    assert seen["hide"] is True


def test_login_rejects_a_malformed_token() -> None:
    r = runner.invoke(app, ["login", "--token-stdin"], input="not-a-token\n")
    assert r.exit_code == 1


def test_tokens_are_redacted_from_messages() -> None:
    assert TOKEN not in config.redact(f"bad token {TOKEN} in header")


def test_upload_shows_per_field_errors(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    config.save(config.Config("http://atlas.test", TOKEN))

    def bad(self: Client, payload: dict[str, Any]) -> dict[str, Any]:
        raise ApiError(
            422,
            {
                "error": {
                    "code": "VALIDATION_FAILED",
                    "message": "Request failed validation.",
                    "details": {"fields": [{"path": "metrics.0.samples", "message": "Too small"}]},
                }
            },
        )

    monkeypatch.setattr(Client, "upload", bad)
    f = tmp_path / "r.json"
    f.write_text(json.dumps({"schema_version": "1"}))
    r = runner.invoke(app, ["upload", str(f)])
    assert r.exit_code == 1
    assert "metrics.0.samples: Too small" in r.output


def test_commands_need_a_login() -> None:
    r = runner.invoke(app, ["run", "ex-w01-log-levels"])
    assert r.exit_code == 1 and "not logged in" in r.output


def test_notebook_round_trip(tmp_path: Path) -> None:
    payload = {
        "kind": "benchmark",
        "schema_version": "1",
        "project_id": 2,
        "config_name": "c",
        "status": "ok",
        "metrics": [{"name": "latency_ms", "unit": "ms", "samples": [1.0, 2.0]}],
    }
    nb_path = notebook.export(payload, tmp_path / "run.ipynb")
    nb = json.loads(nb_path.read_text())
    assert nb["nbformat"] == 4 and all("id" in c for c in nb["cells"])
    assert notebook.import_(nb_path) == payload
    (tmp_path / "plain.ipynb").write_text(json.dumps({"nbformat": 4, "metadata": {}, "cells": []}))
    with pytest.raises(ValueError, match=r"no atlas_lab\.upload"):
        notebook.import_(tmp_path / "plain.ipynb")
