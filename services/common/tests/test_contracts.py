"""Upload contracts from the Python side: the generated JSON Schemas accept the valid fixtures and reject the invalid
one at the expected fields (AT-16)."""

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

C = Path(__file__).resolve().parents[3] / "packages" / "contracts"


def load(p: str) -> Any:
    return json.loads((C / p).read_text())


def validator(name: str) -> Draft202012Validator:
    schema = load(f"schemas/{name}.schema.json")
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=Draft202012Validator.FORMAT_CHECKER)


def test_valid_fixtures_pass() -> None:
    validator("benchmark").validate(load("fixtures/benchmark.valid.json"))
    validator("gate-result").validate(load("fixtures/gate-result.valid.json"))


def test_invalid_fixture_fails_on_expected_fields() -> None:
    f = load("fixtures/benchmark.invalid.json")
    errors = list(validator("benchmark").iter_errors(f["body"]))
    paths = {".".join(str(p) for p in e.absolute_path) for e in errors}
    # Field-level rules expressible in JSON Schema; cross-field rules are server-only (see the schema's $comment).
    for p in ["schema_version", "config_hash", "env.git_sha", "metrics.0.name", "metrics.0.samples"]:
        assert p in paths, (p, paths)
