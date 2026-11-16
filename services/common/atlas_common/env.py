"""Fail-fast env loading for the Python services (no extra dependency)."""

from __future__ import annotations

import json
import os
import sys

from pydantic import BaseModel, Field, ValidationError, field_validator


class CommonEnv(BaseModel):
    REDIS_URL: str = Field(pattern=r"^redis://")
    INTERNAL_HMAC_KEY: str

    @field_validator("INTERNAL_HMAC_KEY")
    @classmethod
    def _long_enough(cls, v: str) -> str:
        if len(v.encode()) < 32:
            raise ValueError("must be at least 32 bytes")
        return v


def load[T: BaseModel](model: type[T]) -> T:
    names = model.model_fields.keys()
    try:
        return model.model_validate({k: os.environ[k] for k in names if k in os.environ})
    except ValidationError as e:
        for err in e.errors():
            var = ".".join(str(p) for p in err["loc"]) or "(root)"
            line = {"level": "fatal", "msg": "invalid environment", "var": var, "problem": err["msg"]}
            sys.stderr.write(json.dumps(line) + "\n")
        raise SystemExit(78) from None
