# AI-Learning-Path

**Systems Atlas** is a private, single-user platform for learning distributed systems and AI infrastructure. You move forward only when you **demonstrate competence** (tests, rubrics, evidence), and your work turns into **verifiable public evidence** (benchmarks, reports, merged PRs).

Four to six months will not make anyone an expert, and this app cannot promise interviews, offers or pay.

Status: **phase P0 (groundwork)**. See `PROGRESS.md` for what works and what doesn't, and `PLAN.md` for the full plan.

## Run it (one command)

Requirements: Docker with Compose v2, Node ≥ 22.18, pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm up        # writes .env with fresh random secrets on first run, builds, starts 7 containers, waits for health
```

- App: http://localhost:3000
- Without GitHub App credentials in `.env` you get the **Configure GitHub login** page. Nothing is faked.
- Only the GitHub account with id `ALLOWED_GITHUB_USER_ID` can sign in. Nobody else can register.
- Jaeger UI (dev only): http://localhost:16686.

Stop with `pnpm down`.

### GitHub sign-in
Create a GitHub App from `infra/github-app/manifest.json`. It is read-only (metadata, contents, issues and pull requests) and has no webhooks. Set its callback URL to `http://localhost:3000/api/auth/callback/github`, then put the client id and secret in `.env`.

Systems Atlas never writes to GitHub. The only non-GET request it sends to GitHub is the OAuth token exchange.

### Behind a TLS-intercepting proxy
The Dockerfiles take an optional `HTTPS_PROXY` build arg and a BuildKit secret `extra_ca`, the proxy's CA bundle. Both are no-ops when absent.

## Checks

```sh
pnpm lint && pnpm typecheck && pnpm test          # ESLint (+ module boundaries), tsc, unit
pnpm test:int                                     # Testcontainers MySQL 8.4 + Redis 7
uv sync --all-packages && uv run ruff check . && uv run pyright && uv run pytest
pnpm up:test && sh infra/scripts/compose-smoke.sh -f infra/compose/compose.test.yaml   # AT-01
pnpm exec playwright test --trace off             # e2e + axe (needs the test stack)
sh infra/ci/build-and-scan.sh                     # AT-03 secrets-in-bundle
sh infra/caddy/caddy.test.sh                      # X-02 edge rules (needs the stack)
```

## Layout

```
apps/web            Next.js 16: UI, API route handlers, Better Auth, Drizzle (only DB writer)
  modules/{auth,platform,...}/service.ts   public surface of each module (lint-enforced)
apps/worker-node    BullMQ worker (GitHub sync, mentor, verification arrive later)
services/api-py     FastAPI compute (HMAC-signed calls only)
services/worker-py  BullMQ Python worker; posts results back over HMAC
packages/contracts  JSON Schemas + HMAC test vectors shared by TS and Python
packages/ui         design tokens and components
infra/              compose, caddy, mysql, CI scripts, GitHub App manifest
docs/spec           the specification; PLAN.md, THREAT_MODEL.md, docs/DATA_MODEL.md
```

## Costs

Everything runs locally for $0. The hosted tiers in `docs/spec/C_prd.md` §C.9 are **estimates read on 2026-11-16 from the providers' pricing pages**. Prices change, so re-check them before paying. The platform never launches paid resources itself.
