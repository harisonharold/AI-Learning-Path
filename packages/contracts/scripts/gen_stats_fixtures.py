"""Regenerates the fixed-seed statistics fixtures (AT-21).

Run: uv run python packages/contracts/scripts/gen_stats_fixtures.py

The fixtures pin the exact output of atlas_common.stats for a given input and seed. A change to the statistics code
that moves any number shows up as a failing test and needs a deliberate regeneration (and a PROGRESS note).
"""

import json
from pathlib import Path

import numpy as np
from atlas_common import stats

OUT = Path(__file__).resolve().parent.parent / "fixtures"
rng = np.random.default_rng(7)
a = [round(float(x), 3) for x in rng.lognormal(mean=2.0, sigma=0.35, size=300)]
b_base = rng.lognormal(2.0, 0.35, 300)
noise = rng.normal(0, 0.2, 300)
b = [round(float(x) * 0.9 + float(e), 3) for x, e in zip(b_base, noise, strict=True)]
seed, resamples = 20261116, 2000

summary = {
    "input": {"values": a, "seed": seed, "resamples": resamples},
    "expected": {**stats.describe(a), **stats.bootstrap_ci(a, seed, resamples)},
}
compare = {
    "input": {"a": a, "b": b, "seed": seed, "resamples": resamples},
    "expected": stats.compare(a, b, seed, resamples),
}
for name, data in (("stats-summary.fixture.json", summary), ("stats-compare.fixture.json", compare)):
    (OUT / name).write_text(json.dumps(data, indent=1) + "\n")
    print("wrote", OUT / name)
