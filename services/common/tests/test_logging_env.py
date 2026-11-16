"""X-03 (Python side): secrets never reach logs. Env loader fails fast with the variable name."""

import json

import pytest
from atlas_common.env import CommonEnv, load
from atlas_common.logging_json import log, register_secrets


def test_known_secret_and_sensitive_keys_redacted(capsys: pytest.CaptureFixture[str]) -> None:
    secret = "s3cr3t-value-that-must-not-leak"  # noqa: S105 - test fixture
    register_secrets([secret])
    log("info", f"calling with {secret}", authorization="Bearer abc", nested={"api_key": "x", "ok": secret})
    out = capsys.readouterr().out
    assert secret not in out
    line = json.loads(out)
    assert line["authorization"] == "[REDACTED]"
    assert line["nested"]["api_key"] == "[REDACTED]"


def test_missing_env_exits_78(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.delenv("REDIS_URL", raising=False)
    monkeypatch.setenv("INTERNAL_HMAC_KEY", "x" * 40)
    with pytest.raises(SystemExit) as e:
        load(CommonEnv)
    assert e.value.code == 78
    assert "REDIS_URL" in capsys.readouterr().err


def test_short_hmac_key_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REDIS_URL", "redis://r:6379")
    monkeypatch.setenv("INTERNAL_HMAC_KEY", "short")
    with pytest.raises(SystemExit):
        load(CommonEnv)
