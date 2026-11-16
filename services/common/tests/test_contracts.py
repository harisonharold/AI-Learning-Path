"""Contract fixtures validated against the shared JSON Schemas (Python side; Ajv does the TS side)."""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

ROOT = Path(__file__).parents[3] / "packages/contracts"


@pytest.mark.parametrize("name", ["job-message", "job-result"])
def test_fixtures(name: str) -> None:
    schema = json.loads((ROOT / "schemas" / f"{name}.schema.json").read_text())
    Draft202012Validator.check_schema(schema)
    v = Draft202012Validator(schema)
    for doc in json.loads((ROOT / "fixtures" / f"{name}.valid.json").read_text()):
        assert not list(v.iter_errors(doc)), doc
    for doc in json.loads((ROOT / "fixtures" / f"{name}.invalid.json").read_text()):
        assert list(v.iter_errors(doc)), doc
