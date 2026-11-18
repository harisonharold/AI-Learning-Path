"""Canonical JSON must equal the web app's byte for byte (config_hash and bundle hashes depend on it)."""

import json
from pathlib import Path

import pytest
from atlas_lab.canonical import canonical_json, config_hash, js_number, sha256_hex

ROOT = Path(__file__).resolve().parents[3]

VECTORS = json.loads((ROOT / "packages/contracts/fixtures/canonical-json.vectors.json").read_text())


@pytest.mark.parametrize("v", VECTORS)
def test_shared_vectors(v: dict) -> None:  # type: ignore[type-arg]
    assert canonical_json(v["input"]) == v["canonical"]
    assert sha256_hex(v["canonical"]) == v["sha256"]


@pytest.mark.parametrize(
    ("x", "js"),
    [
        (1.0, "1"),
        (100.0, "100"),
        (0.1, "0.1"),
        (1e21, "1e+21"),
        (1e-7, "1e-7"),
        (1.5e16, "15000000000000000"),
        (1e-6, "0.000001"),
        (-0.0, "0"),
        (12345678901234567890.0, "12345678901234567000"),
        (-2.5e-8, "-2.5e-8"),
        (5e-324, "5e-324"),
    ],
)
def test_numbers_format_like_javascript(x: float, js: str) -> None:
    assert js_number(x) == js


def test_config_hash_matches_the_upload_fixture() -> None:
    f = json.loads((ROOT / "packages/contracts/fixtures/benchmark.valid.json").read_text())
    assert config_hash(f["config"]) == f["config_hash"]


def test_float_and_int_spellings_hash_the_same_as_in_javascript() -> None:
    assert config_hash({"lr": 1.0, "b": 2}) == config_hash({"b": 2, "lr": 1})
