"""Benchmark statistics (FR-13, F.5).

Every random step uses a numpy Generator seeded from the request, so the same input and seed always give the same
output (AT-21 checks this against a committed fixture). Percentiles use numpy's default "linear" method, which the web
app mirrors in TypeScript for the immediate summary it stores at upload time.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from numpy.typing import NDArray

DEFAULT_SEED = 20261116
DEFAULT_RESAMPLES = 2000
MAX_RESAMPLES = 10_000
# Above this many samples the bootstrap runs on a seeded random subsample of this size; the result says so (basis_n).
CI_MAX_N = 100_000
# Cap on resampled values held in memory at once (rows x n), about 32 MB of float64.
_BATCH_CELLS = 4_000_000
PERCENTILES: dict[str, float] = {"p50": 50.0, "p95": 95.0, "p99": 99.0}
STATS = (*PERCENTILES, "mean")

Array = NDArray[np.float64]


class StatsInputError(ValueError):
    """Raised for empty, non-numeric or non-finite input."""


def as_array(values: Any) -> Array:
    try:
        a = np.asarray(values, dtype=np.float64)
    except (TypeError, ValueError) as e:
        raise StatsInputError("samples must be numbers") from e
    if a.ndim != 1 or a.size == 0:
        raise StatsInputError("samples must be a non-empty list of numbers")
    if not bool(np.all(np.isfinite(a))):
        raise StatsInputError("samples must be finite numbers")
    return a


def describe(values: Any) -> dict[str, float | int]:
    a = as_array(values)
    p = np.percentile(a, list(PERCENTILES.values()))
    return {
        "n": int(a.size),
        "mean": float(a.mean()),
        "stdev": float(a.std(ddof=1)) if a.size > 1 else 0.0,
        "min": float(a.min()),
        "max": float(a.max()),
        **{k: float(v) for k, v in zip(PERCENTILES, p, strict=True)},
    }


def _point(a: Array) -> dict[str, float]:
    p = np.percentile(a, list(PERCENTILES.values()))
    return {**{k: float(v) for k, v in zip(PERCENTILES, p, strict=True)}, "mean": float(a.mean())}


def _basis(a: Array, rng: np.random.Generator) -> Array:
    return a if a.size <= CI_MAX_N else rng.choice(a, CI_MAX_N, replace=False)


def _replicates(a: Array, rng: np.random.Generator, resamples: int) -> dict[str, Array]:
    """Bootstrap replicates of each statistic: rows of resampled-with-replacement copies of `a`."""
    n = a.size
    batch = max(1, min(resamples, _BATCH_CELLS // n))
    out: dict[str, list[Array]] = {k: [] for k in STATS}
    done = 0
    while done < resamples:
        b = min(batch, resamples - done)
        s = a[rng.integers(0, n, size=(b, n))]
        pct = np.percentile(s, list(PERCENTILES.values()), axis=1)
        for i, k in enumerate(PERCENTILES):
            out[k].append(pct[i])
        out["mean"].append(s.mean(axis=1))
        done += b
    return {k: np.concatenate(v) for k, v in out.items()}


def _ci(dist: Array) -> list[float]:
    lo, hi = np.percentile(dist, [2.5, 97.5])
    return [float(lo), float(hi)]


def _check_resamples(resamples: int) -> int:
    if not 100 <= resamples <= MAX_RESAMPLES:
        raise StatsInputError(f"resamples must be between 100 and {MAX_RESAMPLES}")
    return resamples


def bootstrap_ci(values: Any, seed: int = DEFAULT_SEED, resamples: int = DEFAULT_RESAMPLES) -> dict[str, Any]:
    """Percentile-bootstrap 95% CIs for p50, p95, p99 and the mean."""
    a = as_array(values)
    rng = np.random.default_rng(seed)
    basis = _basis(a, rng)
    reps = _replicates(basis, rng, _check_resamples(resamples))
    return {
        "ci95": {k: _ci(v) for k, v in reps.items()},
        "method": "percentile bootstrap",
        "resamples": resamples,
        "seed": seed,
        "basis_n": int(basis.size),
    }


def histogram(values: Any, max_bins: int = 60) -> dict[str, list[float] | list[int]]:
    a = as_array(values)
    edges = np.histogram_bin_edges(a, bins="auto")
    if edges.size - 1 > max_bins:
        edges = np.histogram_bin_edges(a, bins=max_bins)
    counts, edges = np.histogram(a, bins=edges)
    return {"edges": [float(e) for e in edges], "counts": [int(c) for c in counts]}


def cdf(values: Any, points: int = 200) -> list[list[float]]:
    """Empirical CDF sampled at evenly spaced quantiles: [[value, fraction], ...]."""
    a = as_array(values)
    qs = np.linspace(0.0, 1.0, min(points, max(2, a.size)))
    xs = np.quantile(a, qs)
    return [[float(x), float(q)] for x, q in zip(xs, qs, strict=True)]


def summarize(values: Any, seed: int = DEFAULT_SEED, resamples: int = DEFAULT_RESAMPLES) -> dict[str, Any]:
    return {
        **describe(values),
        **bootstrap_ci(values, seed, resamples),
        "histogram": histogram(values),
        "cdf": cdf(values),
    }


def _average_ranks(x: Array) -> tuple[Array, Array]:
    """Average ranks (ties share the mean rank) and the tie-group sizes."""
    _, inverse, counts = np.unique(x, return_inverse=True, return_counts=True)
    upper = np.cumsum(counts).astype(np.float64)
    ranks = upper - (counts - 1) / 2.0
    return ranks[inverse], counts.astype(np.float64)


def mann_whitney(a_values: Any, b_values: Any) -> dict[str, float | int | str]:
    """Two-sided Mann-Whitney U with the normal approximation, tie correction and continuity correction."""
    a, b = as_array(a_values), as_array(b_values)
    na, nb = a.size, b.size
    n = na + nb
    ranks, ties = _average_ranks(np.concatenate([a, b]))
    u_a = float(ranks[:na].sum() - na * (na + 1) / 2.0)
    mu = na * nb / 2.0
    tie_term = float(((ties**3) - ties).sum()) / (n * (n - 1)) if n > 1 else 0.0
    sigma = math.sqrt(na * nb / 12.0 * ((n + 1) - tie_term))
    if sigma == 0.0:
        z, p = 0.0, 1.0
    else:
        z = (u_a - mu - 0.5 * math.copysign(1.0, u_a - mu)) / sigma if u_a != mu else 0.0
        p = math.erfc(abs(z) / math.sqrt(2.0))
    return {
        "u": u_a,
        "z": z,
        "p_value": min(1.0, p),
        # Probability that a random value from B exceeds one from A (ties count half).
        "prob_b_greater": 1.0 - u_a / (na * nb),
        "method": "normal approximation, tie- and continuity-corrected",
        "n_a": int(na),
        "n_b": int(nb),
    }


def compare(
    a_values: Any, b_values: Any, seed: int = DEFAULT_SEED, resamples: int = DEFAULT_RESAMPLES
) -> dict[str, Any]:
    """B minus A for p50, p95, p99 and the mean, with independent-resampling bootstrap 95% CIs of the difference
    and of the relative change (percent of A)."""
    a, b = as_array(a_values), as_array(b_values)
    resamples = _check_resamples(resamples)
    rng = np.random.default_rng(seed)
    basis_a, basis_b = _basis(a, rng), _basis(b, rng)
    reps_a = _replicates(basis_a, rng, resamples)
    reps_b = _replicates(basis_b, rng, resamples)
    pa, pb = _point(a), _point(b)
    diff: dict[str, Any] = {}
    for k in STATS:
        d = reps_b[k] - reps_a[k]
        entry: dict[str, Any] = {"a": pa[k], "b": pb[k], "diff": pb[k] - pa[k], "ci95": _ci(d)}
        if pa[k] != 0.0 and bool(np.all(reps_a[k] != 0.0)):
            entry["rel_pct"] = (pb[k] / pa[k] - 1.0) * 100.0
            entry["rel_ci95"] = _ci((reps_b[k] / reps_a[k] - 1.0) * 100.0)
        entry["ci_excludes_zero"] = entry["ci95"][0] > 0.0 or entry["ci95"][1] < 0.0
        diff[k] = entry
    return {
        "diff": diff,
        "mann_whitney": mann_whitney(a, b),
        "method": "percentile bootstrap of B - A, independent resampling",
        "resamples": resamples,
        "seed": seed,
        "basis_n": [int(basis_a.size), int(basis_b.size)],
    }
