"""atlas-lab command line (G §6.4). The browser never controls the GPU; this runs on the learner's own machine."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Annotated, Any

import typer

from atlas_lab import __version__, config, envcap, notebook
from atlas_lab.api import ApiError, Client
from atlas_lab.gate import GateError, run_gate
from atlas_lab.runner import Plan, RepResult, cost_estimate, run_plan, shutdown_script

app = typer.Typer(no_args_is_help=True, add_completion=False, help="Systems Atlas local runner.")
notebook_app = typer.Typer(no_args_is_help=True, help="Export or import Jupyter notebooks (same upload schema).")
app.add_typer(notebook_app, name="notebook")

EXERCISE_RE = re.compile(r"^ex-[a-z0-9-]+$")
REF_RE = re.compile(r"^atlas-lab:[a-z0-9-]+@[0-9]+$")


def say(msg: str) -> None:
    typer.echo(config.redact(msg))


def fail(msg: str, code: int = 1) -> typer.Exit:
    typer.echo(config.redact(f"error: {msg}"), err=True)
    return typer.Exit(code)


def client() -> Client:
    cfg = config.load()
    if cfg is None:
        raise fail("not logged in: create a runner token in Settings, then run `atlas-lab login --token`.")
    return Client(cfg)


def show_api_error(e: ApiError) -> typer.Exit:
    lines = [f"{e.status} {e.code}: {e.message}"]
    lines += [f"  - {f.get('path') or '(body)'}: {f.get('message')}" for f in e.fields]
    if reasons := e.details.get("reasons"):
        lines += [f"  - {r}" for r in reasons]
    return fail("\n".join(lines))


@app.command()
def version() -> None:
    """Print the atlas-lab version."""
    say(__version__)


@app.command()
def login(
    url: Annotated[str, typer.Option(help="Systems Atlas URL")] = "http://localhost:3000",
    token: Annotated[bool, typer.Option("--token", help="Prompt for the runner token (input hidden)")] = True,
    token_stdin: Annotated[bool, typer.Option("--token-stdin", help="Read the token from stdin (for scripts)")] = False,
) -> None:
    """Save a runner token. It is read from a hidden prompt or stdin, never from a command-line value (T-R4)."""
    raw = sys.stdin.readline().strip() if token_stdin else typer.prompt("Runner token", hide_input=True).strip()
    if not config.TOKEN_RE.match(raw):
        raise fail("that does not look like a runner token (atl_ followed by 43 characters).")
    cfg = config.Config(url=url.rstrip("/"), token=raw)
    try:
        who = Client(cfg).whoami()
    except ApiError as e:
        raise show_api_error(e) from None
    path = config.save(cfg)
    say(f"Logged in to {cfg.url} with scopes {', '.join(who.get('scopes', []))}. Token saved to {path} (mode 0600).")


@app.command("env")
def env_cmd() -> None:
    """Print the captured environment as JSON (what every upload carries)."""
    say(json.dumps(envcap.capture(), indent=2))


def _load_config_file(path: Path | None) -> dict[str, Any]:
    if path is None:
        return {}
    data = json.loads(path.read_text())
    if not isinstance(data, dict):
        raise fail("--config must be a JSON object")
    return dict(data)  # pyright: ignore[reportUnknownArgumentType]


@app.command(context_settings={"allow_extra_args": True, "ignore_unknown_options": True})
def run(
    ctx: typer.Context,
    target: Annotated[
        str,
        typer.Argument(help="Exercise id or bundle ref: run hidden gate tests. Anything else: an experiment name"),
    ],
    project: Annotated[int | None, typer.Option(help="Project id (experiments)")] = None,
    config_file: Annotated[Path | None, typer.Option("--config", help="JSON file with this run's config")] = None,
    config_name: Annotated[str | None, typer.Option(help="Config name shown in reports (default: the target)")] = None,
    repeat: Annotated[int, typer.Option(min=1, max=1000, help="Measured repetitions")] = 5,
    warmup: Annotated[
        int, typer.Option(min=0, max=100, help="Warm-up repetitions, uploaded and excluded from statistics")
    ] = 1,
    baseline: Annotated[bool, typer.Option(help="Mark these runs as the baseline config")] = False,
    timeout: Annotated[float | None, typer.Option(help="Per-repetition timeout in seconds")] = None,
    max_hours: Annotated[float | None, typer.Option(help="Stop the whole session after this many hours")] = None,
    gpu_rate: Annotated[
        float | None, typer.Option(help="GPU price in USD per hour, for the pre-flight cost estimate")
    ] = None,
    dry_run: Annotated[bool, typer.Option(help="Print the environment, plan and cost estimate; run nothing")] = False,
    upload: Annotated[bool, typer.Option(help="Upload results (use --no-upload to only write --out)")] = True,
    out: Annotated[Path | None, typer.Option(help="Also write the upload payload(s) to this JSON file")] = None,
    solution: Annotated[
        Path | None, typer.Option(help="Gate runs: path to your solution (default: the bundle's file name)")
    ] = None,
) -> None:
    """Run gate tests or an experiment.

    Experiments: put the command after `--`, e.g. `atlas-lab run bench --project 3 -- python bench.py`.
    The command prints `ATLAS_METRIC <name> <unit> <value>` lines or writes JSON to $ATLAS_LAB_OUT.
    """
    env = envcap.capture()
    if EXERCISE_RE.match(target) or REF_RE.match(target):
        return _run_gate(target, env, dry_run, upload, out, solution)
    command = list(ctx.args)
    if project is None or not command:
        raise fail("experiments need --project and a command after `--`.")
    plan = Plan(
        project_id=project,
        config_name=config_name or target,
        config=_load_config_file(config_file),
        command=command,
        repeat=repeat,
        warmup=warmup,
        baseline=baseline,
        timeout_s=timeout,
        max_hours=max_hours,
        gpu_rate=gpu_rate,
    )
    cost = cost_estimate(plan)
    if dry_run:
        say(
            json.dumps(
                {
                    "dry_run": True,
                    "env": env,
                    "plan": {
                        "project_id": plan.project_id,
                        "config_name": plan.config_name,
                        "config": plan.config,
                        "command": plan.command,
                        "warmup": plan.warmup,
                        "repeat": plan.repeat,
                        "timeout_s": plan.timeout_s,
                        "max_hours": plan.max_hours,
                        "baseline": plan.baseline,
                    },
                    "cost_estimate": cost,
                },
                indent=2,
            )
        )
        return None
    if cost:
        say(
            f"Pre-flight cost estimate: up to ${cost['max_usd']} ({cost.get('basis', '')}). {cost['note']}"
            if cost.get("max_usd") is not None
            else cost["note"]
        )
    if max_hours:
        script = shutdown_script(max_hours, Path("atlas-lab-shutdown.sh"))
        say(
            f"Wrote {script}. On a rented GPU box arm it with `nohup sh {script} >/dev/null 2>&1 &` "
            "so the machine stops billing."
        )

    def report(i: int, warm: bool, rep: RepResult) -> None:
        label = "warm-up" if warm else f"run {i - plan.warmup + 1}/{plan.repeat}"
        say(f"{label}: {'ok' if rep.ok else 'FAILED - ' + (rep.note or '')}")

    payloads = run_plan(plan, env, report)
    if out:
        out.write_text(json.dumps(payloads, indent=1))
        say(f"Wrote {len(payloads)} payload(s) to {out}")
    if upload:
        c = client()
        for p in payloads:
            try:
                r = c.upload(p)
                say(f"uploaded run {r.get('runId')}{' (already uploaded)' if r.get('duplicate') else ''}")
            except ApiError as e:
                raise show_api_error(e) from None
    return None


def _run_gate(
    target: str, env: dict[str, Any], dry_run: bool, upload: bool, out: Path | None, solution: Path | None
) -> None:
    c = client()
    try:
        bundle = c.bundle(ref=target) if REF_RE.match(target) else c.bundle(exercise=target)
    except ApiError as e:
        raise show_api_error(e) from None
    m = bundle["manifest"]
    sol = solution or Path(m["submission"])
    if dry_run:
        say(
            json.dumps(
                {
                    "dry_run": True,
                    "env": env,
                    "gate": {
                        "bundle": bundle["ref"],
                        "tests": len(m["tests"]),
                        "image": m["image"],
                        "network": "none",
                        "timeout_seconds": m["timeout_seconds"],
                        "solution": str(sol),
                    },
                },
                indent=2,
            )
        )
        return
    say(f"Running {len(m['tests'])} hidden tests for {bundle['ref']} in Docker (no network)...")
    try:
        result = run_gate(bundle, sol, env)
    except GateError as e:
        raise fail(str(e)) from None
    passed = sum(1 for r in result["results"] if r["passed"])
    say(f"{passed}/{len(result['results'])} passed")
    for r in result["results"]:
        if not r["passed"]:
            say(f"  FAIL {r['test']}: {r.get('message', '')}")
    if out:
        out.write_text(json.dumps(result, indent=1))
    if upload:
        try:
            r = c.upload(result)
        except ApiError as e:
            raise show_api_error(e) from None
        say(f"Recorded on gate {r.get('gateId')}: gate status {r.get('gateStatus')}.")


@app.command("upload")
def upload_cmd(
    path: Annotated[Path, typer.Argument(help="results.json: one upload payload or a list of them")],
) -> None:
    """Upload benchmark result JSON (the schema in packages/contracts/schemas/benchmark.schema.json)."""
    data = json.loads(path.read_text())
    items: list[dict[str, Any]] = data if isinstance(data, list) else [data]  # pyright: ignore[reportUnknownVariableType]
    c = client()
    for p in items:
        p.setdefault("kind", "benchmark")
        try:
            r = c.upload(p)
        except ApiError as e:
            raise show_api_error(e) from None
        say(f"uploaded run {r.get('runId')}{' (already uploaded)' if r.get('duplicate') else ''}")


@notebook_app.command("export")
def nb_export(
    source: Annotated[Path, typer.Argument(help="A payload JSON written by `atlas-lab run --out`")],
    dest: Annotated[Path, typer.Argument(help="Notebook to write (.ipynb)")],
) -> None:
    data = json.loads(source.read_text())
    first: dict[str, Any] = data[0] if isinstance(data, list) else data  # pyright: ignore[reportUnknownVariableType]
    say(f"wrote {notebook.export(first, dest)}")


@notebook_app.command("import")
def nb_import(
    path: Annotated[Path, typer.Argument(help="Notebook exported by atlas-lab")],
    send: Annotated[bool, typer.Option("--upload/--no-upload")] = True,
) -> None:
    try:
        payload = notebook.import_(path)
    except (ValueError, json.JSONDecodeError) as e:
        raise fail(str(e)) from None
    if not send:
        say(json.dumps(payload, indent=1))
        return
    try:
        r = client().upload(payload)
    except ApiError as e:
        raise show_api_error(e) from None
    say(f"uploaded run {r.get('runId')}")


def main() -> None:
    app()
