# atlas-lab

The Systems Atlas local runner. It runs on your own machine or a rented GPU box; the web app never runs your code and never controls a GPU.

## Install and log in

```sh
uv tool install ./cli/atlas-lab          # from a checkout of this repository
atlas-lab login --url http://localhost:3000 --token
```

Create the token in **Settings → atlas-lab runner tokens**. `--token` asks for it with hidden input, so it never lands in your shell history. For scripts, use `--token-stdin`. The token is stored in `~/.config/atlas-lab/config.json` with mode 0600 and is redacted from everything atlas-lab prints. `ATLAS_LAB_URL` and `ATLAS_LAB_TOKEN` override the file.

## Gate tests (counting evidence)

```sh
atlas-lab run ex-w01-log-levels --solution solution.py
```

This fetches the hidden test bundle (needs the `tests:read` scope) and checks its SHA-256. It then runs your code in Docker with `--network none`, a read-only root, no capabilities, an unprivileged user and CPU/memory/PID limits, using the image pinned by digest. Finally it uploads the per-test results (needs `results:write`). The server accepts them only for the current bundle and exactly its tests. Docker is required.

## Benchmarks

```sh
atlas-lab run batch8 --project 3 --config config.json --config-name batch=8 \
  --repeat 5 --warmup 1 [--baseline] [--timeout 600] [--max-hours 2 --gpu-rate 0.80] -- python bench.py
```

Your command reports samples by printing `ATLAS_METRIC <name> <unit> <value>` lines, or by writing `{"metrics": {"<name>": {"unit": "ms", "samples": [...]}}}` to the file named in `$ATLAS_LAB_OUT`.

- Each repetition becomes one uploaded run, carrying the captured environment: CPU, memory, OS, Python, libraries, git SHA and dirty flag, container digest, and GPUs and topology from `nvidia-smi`.
- When `nvidia-smi` exists, GPU utilisation, memory and power are sampled every second.
- Failed or timed-out repetitions are uploaded as failed runs; they are kept, not dropped.
- `--dry-run` prints the environment, the plan and the cost estimate (`hours × --gpu-rate`) and runs nothing.
- `--max-hours` stops the session and writes `atlas-lab-shutdown.sh`, which atlas-lab never runs. Arm it yourself on a rented box so the machine stops billing.

## Other commands

- `atlas-lab env`: print the captured environment.
- `atlas-lab upload results.json`: upload payloads (`packages/contracts/schemas/benchmark.schema.json`); field errors are listed.
- `atlas-lab notebook export runs.json run.ipynb` / `atlas-lab notebook import run.ipynb`: plain nbformat v4 notebooks that carry the upload payload in their metadata.

Licence: MIT (this directory).
