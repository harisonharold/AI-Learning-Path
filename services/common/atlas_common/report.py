"""Experiment report rendering: Markdown and HTML only, no PDF (D-20, Q13).

The input is structured data assembled by the web app from stored runs. Every user-supplied string is escaped for
the target format; the HTML output contains no user-controlled markup, scripts, styles or attributes. Statements of
the form "B is X% lower/higher than A" are produced only for a comparison in the same environment against the
pre-registered baseline whose CI excludes zero (F.5); every other comparison is shown with its numbers and a reason
why no claim is made. Failed runs are always listed.
"""

from __future__ import annotations

import html
import re
from typing import Any

_MD_INLINE = re.compile(r"([\\`*_\[\]<>|~&])")
_MD_LINE_START = re.compile(r"^(\s*)([#+\-=>])")
_MD_ORDERED = re.compile(r"^(\s*\d+)([.)])")


def md(text: Any) -> str:
    """Escape text for Markdown: inline syntax everywhere (emphasis, code, links, raw HTML, tables, entities) and block
    syntax only where it can start a block. Plain punctuation stays readable in the raw file."""
    s = str(text).replace("\r", " ").replace("\n", " ")
    s = _MD_INLINE.sub(r"\\\1", s)
    s = _MD_LINE_START.sub(r"\1\\\2", s)
    return _MD_ORDERED.sub(r"\1\\\2", s)


def h(text: Any) -> str:
    return html.escape(str(text), quote=True)


def fmt(x: Any, digits: int = 4) -> str:
    if x is None:
        return "n/a"
    if isinstance(x, bool):
        return "yes" if x else "no"
    if isinstance(x, int):
        return str(x)
    if isinstance(x, float):
        return f"{x:.{digits}g}"
    return str(x)


def fmt_ci(ci: Any) -> str:
    if not isinstance(ci, list | tuple) or len(ci) != 2:  # pyright: ignore[reportUnknownArgumentType]
        return "n/a"
    return f"[{fmt(ci[0])}, {fmt(ci[1])}]"


def claim(c: dict[str, Any]) -> str:
    """The one sentence a comparison may state (F.5: no 'X% faster' without a same-environment baseline)."""
    metric, unit = c["metric"], c.get("unit", "")
    if not c.get("baseline_is_preregistered", False):
        return f"No claim: the comparison is not against the pre-registered baseline for {metric}."
    if not c.get("same_env", False):
        return f"No claim: baseline and candidate ran in different environments, so {metric} is not comparable."
    if c.get("rel_pct") is None or c.get("rel_ci95") is None:
        return f"No claim: a relative change for {metric} is undefined (baseline value is zero)."
    if not c.get("ci_excludes_zero", False):
        return (
            f"No detectable difference in {metric} p50: the 95% CI of the difference, {fmt_ci(c.get('ci95'))} {unit}, "
            "includes zero."
        )
    rel = float(c["rel_pct"])
    lo, hi = c["rel_ci95"]
    direction = "lower" if rel < 0 else "higher"
    return (
        f"{c['candidate']} has a {abs(rel):.1f}% {direction} {metric} p50 than the baseline {c['baseline']} "
        f"(95% CI {float(lo):.1f}% to {float(hi):.1f}%), in the same environment."
    )


def _table(headers: list[str], rows: list[list[Any]]) -> tuple[str, str]:
    md_lines = ["| " + " | ".join(md(x) for x in headers) + " |", "|" + "---|" * len(headers)]
    md_lines += ["| " + " | ".join(md(fmt(c)) for c in r) + " |" for r in rows]
    th = "".join(f'<th scope="col">{h(x)}</th>' for x in headers)
    trs = "".join("<tr>" + "".join(f"<td>{h(fmt(c))}</td>" for c in r) + "</tr>" for r in rows)
    return "\n".join(md_lines), f"<table><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table>"


def render(data: dict[str, Any]) -> dict[str, str]:
    md_parts: list[str] = []
    html_parts: list[str] = []

    def section(title: str) -> None:
        md_parts.append(f"\n## {md(title)}\n")
        html_parts.append(f"<h2>{h(title)}</h2>")

    def para(text: str) -> None:
        md_parts.append(md(text) + "\n")
        html_parts.append(f"<p>{h(text)}</p>")

    def bullets(items: list[str]) -> None:
        if not items:
            return
        md_parts.append("\n".join(f"- {md(i)}" for i in items) + "\n")
        html_parts.append("<ul>" + "".join(f"<li>{h(i)}</li>" for i in items) + "</ul>")

    def table(headers: list[str], rows: list[list[Any]]) -> None:
        if not rows:
            para("None.")
            return
        m, t = _table(headers, rows)
        md_parts.append(m + "\n")
        html_parts.append(t)

    title = str(data.get("title") or "Untitled project")
    md_parts.append(f"# {md(title)}\n")
    html_parts.append(f"<h1>{h(title)}</h1>")
    if data.get("is_sample"):
        para("SAMPLE DATA: this report was generated from seeded sample runs, not real measurements.")
    para(f"Generated {data.get('generated_at', '')}. Every number below was recomputed by the server from raw samples.")

    section("Hypothesis and pre-registration")
    pre = data.get("prereg") or {}
    para(f"Hypothesis: {data.get('hypothesis') or 'not stated'}")
    bullets(
        [
            f"Primary metric: {pre.get('primary_metric', 'not set')}",
            f"Baseline: {pre.get('baseline_desc', 'not set')}",
            f"Stopping rule: {pre.get('stopping_rule', 'not set')}",
            f"Minimum repetitions per config: {pre.get('min_repetitions', 'not set')}",
            f"Pre-registered at: {pre.get('preregistered_at', 'not pre-registered')}",
        ]
    )
    amendments = [str(a) for a in data.get("amendments", [])]
    if amendments:
        para("Amendments after pre-registration (appended, never edited):")
        bullets(amendments)

    section("Results (primary metric)")
    table(
        ["Config", "Metric", "Unit", "Runs", "Samples", "p50", "p50 95% CI", "p95", "p99", "Mean"],
        [
            [
                r["config"],
                r["metric"],
                r.get("unit", ""),
                r["runs"],
                r["n"],
                r["p50"],
                fmt_ci(r.get("ci95_p50")),
                r["p95"],
                r["p99"],
                r["mean"],
            ]
            for r in data.get("metric_table", [])
        ],
    )
    para(str(data.get("pooling_note", "")))

    section("Comparisons against the baseline")
    comps: list[dict[str, Any]] = data.get("comparisons", [])
    table(
        [
            "Candidate",
            "Baseline",
            "Metric",
            "p50 diff",
            "95% CI",
            "Relative",
            "Relative 95% CI",
            "Mann-Whitney p",
            "Same env",
        ],
        [
            [
                c["candidate"],
                c["baseline"],
                c["metric"],
                c.get("diff"),
                fmt_ci(c.get("ci95")),
                None if c.get("rel_pct") is None else f"{float(c['rel_pct']):.2f}%",
                fmt_ci(c.get("rel_ci95")),
                c.get("mw_p"),
                c.get("same_env", False),
            ]
            for c in comps
        ],
    )
    bullets([claim(c) for c in comps])

    section("Config and environment differences")
    table(
        ["Compared", "Kind", "Field", "Baseline", "Candidate"],
        [[d["pair"], d["kind"], d["field"], d.get("baseline"), d.get("candidate")] for d in data.get("diffs", [])],
    )
    warnings = [str(w) for w in data.get("confounder_warnings", [])]
    if warnings:
        para("Confounder warnings:")
        bullets(warnings)
    checklist = [str(c) for c in data.get("confounder_checklist", [])]
    if checklist:
        para("Confounder checklist (F.5): check each before trusting a difference:")
        bullets(checklist)

    section("All runs, including failed ones")
    runs: list[dict[str, Any]] = data.get("runs", [])
    failed = sum(1 for r in runs if r.get("status") != "ok")
    para(
        f"{len(runs)} runs in total, {failed} failed or invalid. Failed runs are kept and listed; warm-up runs are "
        "listed and excluded from the statistics."
    )
    table(
        ["Run", "Config", "Status", "Baseline", "Warm-up", "Environment", "Git SHA", "Started", "Failure note"],
        [
            [
                r["id"],
                r["config"],
                r["status"],
                r.get("is_baseline", False),
                r.get("is_warmup", False),
                str(r.get("env_fingerprint", ""))[:12],
                str(r.get("git_sha") or "")[:12],
                r.get("started_at", ""),
                r.get("failure_note") or "",
            ]
            for r in runs
        ],
    )

    section("Reproduce")
    commands = sorted({" ".join(str(r["command"]).split()) for r in runs if r.get("command")})
    if commands:
        md_parts.append("\n".join(f"    {c}" for c in commands) + "\n")
        html_parts.append("<pre><code>" + h("\n".join(commands)) + "</code></pre>")
    else:
        para("No commands were recorded with these runs.")
    para(str(data.get("raw_data_note", "Raw samples are stored with each run and can be downloaded as JSON.")))

    body = "\n".join(html_parts)
    doc = (
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>'
        + h(title)
        + "</title></head><body><main>"
        + body
        + "</main></body></html>"
    )
    return {"markdown": "\n".join(md_parts).strip() + "\n", "html": doc}


def build(data: dict[str, Any]) -> dict[str, Any]:
    """Compute the results table and baseline comparisons from pooled primary-metric samples, then render.

    `configs` is a list of {name, is_baseline, env_fingerprints, runs, samples}; only ok, non-warm-up runs contribute
    samples (the web app selects them). The baseline is the config the learner marked as the pre-registered baseline.
    """
    from atlas_common import stats

    seed = int(data.get("seed", stats.DEFAULT_SEED))
    resamples = int(data.get("resamples", stats.DEFAULT_RESAMPLES))
    metric, unit = str(data["primary_metric"]), str(data.get("unit", ""))
    configs: list[dict[str, Any]] = [c for c in data.get("configs", []) if c.get("samples")]
    table: list[dict[str, Any]] = []
    for c in configs:
        d = stats.describe(c["samples"])
        ci = stats.bootstrap_ci(c["samples"], seed, resamples)["ci95"]["p50"]
        table.append(
            {"config": c["name"], "metric": metric, "unit": unit, "runs": c.get("runs", 0), **d, "ci95_p50": ci}
        )
    baseline = next((c for c in configs if c.get("is_baseline")), None)
    comparisons: list[dict[str, Any]] = []
    if baseline is not None:
        base_envs = set(baseline.get("env_fingerprints", []))
        for c in configs:
            if c is baseline:
                continue
            r = stats.compare(baseline["samples"], c["samples"], seed, resamples)
            p50 = r["diff"]["p50"]
            envs = set(c.get("env_fingerprints", []))
            comparisons.append(
                {
                    "candidate": c["name"],
                    "baseline": baseline["name"],
                    "metric": metric,
                    "unit": unit,
                    "diff": p50["diff"],
                    "ci95": p50["ci95"],
                    "rel_pct": p50.get("rel_pct"),
                    "rel_ci95": p50.get("rel_ci95"),
                    "ci_excludes_zero": p50["ci_excludes_zero"],
                    "mw_p": r["mann_whitney"]["p_value"],
                    "same_env": len(base_envs) == 1 and envs == base_envs,
                    "baseline_is_preregistered": True,
                }
            )
    pooling = (
        f"Samples of {metric} are pooled across each config's ok, non-warm-up runs. "
        f"CIs: percentile bootstrap, {resamples} resamples, seed {seed}."
    )
    out = render({**data, "metric_table": table, "comparisons": comparisons, "pooling_note": pooling})
    return {**out, "comparisons": comparisons, "metric_table": table}
