"""Report rendering: escaping, the F.5 claim rule, and failed runs always listed (AT-19 report part)."""

import re
from typing import Any

import numpy as np
from atlas_common import report


def payload(**over: Any) -> dict[str, Any]:
    rng = np.random.default_rng(1)
    base = list(rng.normal(100, 5, 400))
    fast = list(rng.normal(80, 5, 400))
    data: dict[str, Any] = {
        "title": "Batching <script>alert(1)</script>",
        "hypothesis": "Batching lowers p50 latency",
        "prereg": {
            "primary_metric": "latency",
            "baseline_desc": "batch=1",
            "stopping_rule": "5 runs",
            "min_repetitions": 5,
            "preregistered_at": "2026-11-17T10:00:00Z",
        },
        "primary_metric": "latency",
        "unit": "ms",
        "generated_at": "2026-11-18T10:00:00Z",
        "configs": [
            {"name": "batch=1", "is_baseline": True, "env_fingerprints": ["e1"], "runs": 5, "samples": base},
            {"name": "batch=8", "is_baseline": False, "env_fingerprints": ["e1"], "runs": 5, "samples": fast},
        ],
        "runs": [
            {
                "id": 1,
                "config": "batch=1",
                "status": "ok",
                "is_baseline": True,
                "env_fingerprint": "e1",
                "command": "atlas-lab run bench.py\n<img src=x onerror=alert(1)>",
            },
            {
                "id": 2,
                "config": "batch=8",
                "status": "failed",
                "failure_note": "OOM at batch 8 [link](javascript:x)",
                "env_fingerprint": "e1",
            },
        ],
        "diffs": [{"pair": "batch=1 vs batch=8", "kind": "config", "field": "batch", "baseline": 1, "candidate": 8}],
        "resamples": 200,
    }
    data.update(over)
    return data


def test_same_env_baseline_comparison_states_a_relative_change() -> None:
    out = report.build(payload())
    assert out["comparisons"][0]["same_env"] is True
    assert "lower latency p50 than the baseline" in out["markdown"]


def test_no_claim_across_environments() -> None:
    p = payload()
    p["configs"][1]["env_fingerprints"] = ["e2"]
    out = report.build(p)
    assert out["comparisons"][0]["same_env"] is False
    assert "lower latency p50" not in out["markdown"]
    assert "different environments" in out["markdown"]


def test_no_comparisons_without_a_baseline() -> None:
    p = payload()
    for c in p["configs"]:
        c["is_baseline"] = False
    out = report.build(p)
    assert out["comparisons"] == []
    assert "%" not in out["markdown"].split("## Comparisons against the baseline")[1].split("##")[0]


def test_failed_runs_are_listed_with_their_reason() -> None:
    out = report.build(payload())
    assert "1 failed or invalid" in out["markdown"]
    assert "OOM at batch 8" in out["html"]


def test_user_text_is_escaped_in_html_and_markdown() -> None:
    out = report.build(payload())
    html_doc, md_doc = out["html"], out["markdown"]
    assert "<script>" not in html_doc and "<img" not in html_doc and "&lt;script&gt;" in html_doc
    assert "<script>" not in md_doc
    assert not re.search(r"(?<!\\)\]\(javascript:", md_doc)  # no live link syntax
    # Raw "<" survives only inside the indented code block (literal text there), on a single line.
    assert all(line.startswith("    ") for line in md_doc.splitlines() if "<img" in line)
    assert "    atlas-lab run bench.py <img src=x onerror=alert(1)>" in md_doc


def test_sample_reports_are_labelled() -> None:
    assert "SAMPLE DATA" in report.build(payload(is_sample=True))["markdown"]


def test_sample_cap_note_is_shown() -> None:
    out = report.build(payload(sample_cap_note="Runs #4 (150000 samples) have more than 100,000 samples"))
    assert "Note: Runs #4 (150000 samples) have more than 100,000 samples" in out["html"]
    assert "Note:" not in report.build(payload())["markdown"]
