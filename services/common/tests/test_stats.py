"""Statistics tests: hand-computed values, statistical sanity, and the fixed-seed fixtures (AT-21)."""

import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from atlas_common import stats

FIXTURES = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "fixtures"


def load(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / name).read_text())


def close(a: Any, b: Any) -> None:
    """Recursive comparison; floats to 1e-9 relative."""
    if isinstance(a, dict):
        assert isinstance(b, dict)
        assert set(a) == set(b)  # pyright: ignore[reportUnknownArgumentType]
        for k in a:  # pyright: ignore[reportUnknownVariableType]
            close(a[k], b[k])
    elif isinstance(a, list):
        assert isinstance(b, list) and len(a) == len(b)  # pyright: ignore[reportUnknownArgumentType]
        for x, y in zip(a, b, strict=True):  # pyright: ignore[reportUnknownArgumentType, reportUnknownVariableType]
            close(x, y)
    elif isinstance(a, float):
        assert math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-12), (a, b)
    else:
        assert a == b


def test_percentiles_match_hand_computed_linear_interpolation() -> None:
    d = stats.describe([1, 2, 3, 4])
    assert d["p50"] == 2.5
    assert math.isclose(float(d["p95"]), 3.85)
    assert math.isclose(float(d["p99"]), 3.97)
    assert d["n"] == 4 and d["mean"] == 2.5 and d["min"] == 1 and d["max"] == 4


@pytest.mark.parametrize("bad", [[], [1.0, float("nan")], [float("inf")], ["x"], [[1, 2]]])
def test_rejects_empty_or_non_finite_samples(bad: Any) -> None:
    with pytest.raises(stats.StatsInputError):
        stats.describe(bad)


def test_mann_whitney_matches_reference_value() -> None:
    # Fully separated groups of 5: U=0, z=-2.5067 with continuity correction, two-sided p=0.01219
    # (the asymptotic value published for this classic example).
    r = stats.mann_whitney([1, 2, 3, 4, 5], [6, 7, 8, 9, 10])
    assert r["u"] == 0.0
    assert math.isclose(float(r["p_value"]), 0.012185, rel_tol=1e-3)
    assert r["prob_b_greater"] == 1.0


def test_mann_whitney_identical_groups_is_not_significant() -> None:
    assert stats.mann_whitney([3, 3, 3], [3, 3, 3])["p_value"] == 1.0


def test_bootstrap_is_deterministic_for_a_seed_and_changes_with_it() -> None:
    x = list(np.random.default_rng(3).normal(10, 2, 500))
    assert stats.bootstrap_ci(x, 1, 500) == stats.bootstrap_ci(x, 1, 500)
    assert stats.bootstrap_ci(x, 1, 500) != stats.bootstrap_ci(x, 2, 500)


def test_ci_brackets_the_estimate_and_a_known_shift_is_detected() -> None:
    rng = np.random.default_rng(11)
    a = rng.normal(100, 5, 2000)
    r = stats.compare(a, a + 10, resamples=500)
    lo, hi = r["diff"]["p50"]["ci95"]
    assert lo < 10 < hi and r["diff"]["p50"]["ci_excludes_zero"]
    same = stats.compare(a, rng.permutation(a), resamples=500)
    assert not same["diff"]["p50"]["ci_excludes_zero"]


def test_large_inputs_bootstrap_on_a_labelled_subsample() -> None:
    x = np.random.default_rng(5).exponential(1.0, stats.CI_MAX_N + 10)
    r = stats.bootstrap_ci(x, resamples=100)
    assert r["basis_n"] == stats.CI_MAX_N


def test_resample_bounds() -> None:
    with pytest.raises(stats.StatsInputError):
        stats.bootstrap_ci([1.0, 2.0], resamples=10)


def test_histogram_and_cdf_shapes() -> None:
    x = list(range(1000))
    hist = stats.histogram(x)
    assert sum(hist["counts"]) == 1000 and len(hist["edges"]) == len(hist["counts"]) + 1  # pyright: ignore[reportArgumentType]
    c = stats.cdf(x)
    assert c[0] == [0.0, 0.0] and c[-1] == [999.0, 1.0] and len(c) == 200


def test_summary_fixture_is_reproduced_exactly() -> None:
    f = load("stats-summary.fixture.json")
    i = f["input"]
    close({**stats.describe(i["values"]), **stats.bootstrap_ci(i["values"], i["seed"], i["resamples"])}, f["expected"])


def test_at21_compare_fixture_is_reproduced_exactly() -> None:
    f = load("stats-compare.fixture.json")
    i = f["input"]
    got = stats.compare(i["a"], i["b"], i["seed"], i["resamples"])
    close(got, f["expected"])
    assert got["diff"]["p50"]["ci_excludes_zero"]
