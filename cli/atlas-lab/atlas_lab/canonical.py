"""Canonical JSON identical to the web app's `canonicalJson` (JavaScript JSON.stringify with sorted keys).

Python and JavaScript format some numbers differently (1.0 vs 1, 1e-07 vs 1e-7, 1e16 vs 10000000000000000), so
numbers are formatted with ECMAScript's Number::toString rules. Keys are sorted by UTF-16 code units, as JavaScript's
default sort does. Both implementations are checked against packages/contracts/fixtures/canonical-json.vectors.json.
"""

from __future__ import annotations

import hashlib
import json
import math
from typing import Any


def js_number(x: float | int) -> str:
    if isinstance(x, bool):
        raise TypeError("bool is not a number")
    if isinstance(x, int):
        return str(x)
    if not math.isfinite(x):
        return "null"  # JSON.stringify(NaN) === "null"
    if x == 0.0:
        return "0"
    sign = "-" if x < 0 else ""
    r = repr(abs(x))  # shortest round-trip digits, like ECMAScript
    mant, _, exp_s = r.partition("e")
    exp = int(exp_s) if exp_s else 0
    int_part, _, frac = mant.partition(".")
    digits = (int_part + frac).lstrip("0")
    # value = 0.<digits> * 10^n  (ECMAScript's k digits and exponent n)
    n = len(int_part.lstrip("0")) + exp if int_part.strip("0") else exp - (len(frac) - len(frac.lstrip("0")))
    digits = digits.rstrip("0") or "0"
    k = len(digits)
    if k <= n <= 21:
        out = digits + "0" * (n - k)
    elif 0 < n <= 21:
        out = digits[:n] + "." + digits[n:]
    elif -6 < n <= 0:
        out = "0." + "0" * (-n) + digits
    else:
        e = n - 1
        es = f"e{'+' if e >= 0 else '-'}{abs(e)}"
        out = digits + es if k == 1 else digits[0] + "." + digits[1:] + es
    return sign + out


def _utf16_key(s: str) -> bytes:
    return s.encode("utf-16-be", "surrogatepass")


def canonical_json(v: Any) -> str:
    if v is None or isinstance(v, bool):
        return json.dumps(v)
    if isinstance(v, int | float):
        return js_number(v)
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, list | tuple):
        return "[" + ",".join(canonical_json(x) for x in v) + "]"  # pyright: ignore[reportUnknownVariableType]
    if isinstance(v, dict):
        d: dict[str, Any] = v  # pyright: ignore[reportUnknownVariableType]
        keys = sorted(d, key=_utf16_key)
        return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + canonical_json(d[k]) for k in keys) + "}"
    raise TypeError(f"not JSON-serialisable: {type(v).__name__}")


def sha256_hex(s: str | bytes) -> str:
    return hashlib.sha256(s.encode() if isinstance(s, str) else s).hexdigest()


def config_hash(config: dict[str, Any]) -> str:
    return sha256_hex(canonical_json(config))
