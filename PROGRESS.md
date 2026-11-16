# PROGRESS.md

## 2026-11-16 — P0 Groundwork (finished; awaiting review before P1)

### Built
- **Monorepo**: pnpm workspace (`apps/web`, `apps/worker-node`, `packages/ui`, `packages/contracts`) + uv workspace (`services/common`, `services/api-py`, `services/worker-py`). Versions pinned in `pnpm-lock.yaml` / `uv.lock`.
- **Compose**: 7 dev containers (web, worker-node, api-py, worker-py, mysql 8.4, redis 7, jaeger). Prod overlay swaps Jaeger for Caddy and publishes only 80/443. Test overlay adds the in-repo mock GitHub OAuth server (test-only). The internal subnet is pinned to `172.28.0.0/16`.
- **Env loaders** that fail fast with exit 78 and name the bad variable (web: Zod; worker-node: Zod; Python: Pydantic).
- **Database**: Drizzle schema for all 50 tables in `docs/DATA_MODEL.md`, plus a hand-written FULLTEXT migration. MySQL runs with `innodb_ft_min_token_size=2`. Least-privilege users: `atlas_app` (DML only) and `atlas_migrate` (DDL). Migrations run at web boot.
- **Auth (`modules/auth`)**:
  - Better Auth with a GitHub App through `genericOAuth`.
  - Single-account allowlist by numeric id 123658133, checked in three places: user lookup, account-create hook, session-create hook.
  - Our code makes the one allowed POST to GitHub's token endpoint.
  - OAuth tokens are encrypted at rest; cookies are host-only; auth endpoints are rate-limited.
  - `/setup` page when GitHub isn't configured.
- **Platform (`modules/platform`)**:
  - Single error shape.
  - Same-origin (CSRF) check on mutations.
  - AES-256-GCM helper with key id and AAD.
  - HMAC with timestamp and Redis nonce (`SET NX EX 600`, fails closed).
  - Structured logs with secret redaction.
  - Audit log.
  - Jobs on BullMQ with durable `jobs` rows.
  - Account delete that makes no GitHub call and shows revoke steps.
  - Route manifest.
- **API**: `/api/healthz` (+ `/healthz`), `/api/me`, `/api/auth/*`, `GET|POST /api/jobs`, `GET /api/jobs/:id`, `POST /api/internal/jobs/:id/result` (HMAC), `DELETE /api/account`.
- **Python**: api-py (FastAPI, HMAC on every route but `/healthz`, docs endpoints off) and worker-py (BullMQ consumer, signed callbacks). Both hold no database credentials.
- **UI shell**:
  - Design tokens for both themes, with automated contrast tests.
  - Left rail in E.2 order, Ctrl/⌘K command palette, `g t/r/l`, `?` sheet, skip link.
  - Theme toggle; `<PageState>` (loading, empty, error, offline, locked, not-built); badges that pair an icon with text.
  - Today, Settings (Jobs + Delete account), sign-in and setup pages, and an honest "Not built yet" page for every later area.
- **Edge**: nonce-based CSP, security headers, and the two-origin split (the app host 404s `/sandbox/*`; the sandbox host serves only `/sandbox/*`, never sets cookies). Caddyfile for production.
- **CI** (`.github/workflows/ci.yml`): lint, typecheck, unit, string checks, bundle scan, Python checks, integration, then compose + AT-01 + Playwright + axe + Caddy test.
- **Read-only GitHub App manifest** (`infra/github-app/manifest.json`).

### Tested (all run locally on 2026-11-16, all passing)
| Suite | Command | Result |
|---|---|---|
| ESLint (incl. module boundaries) | `pnpm lint` | 0 errors, 0 warnings |
| TypeScript strict | `pnpm typecheck` | web, ui, worker-node clean |
| Web unit | `pnpm --filter @atlas/web test` | 91 passed |
| UI unit (contrast) | `pnpm --filter @atlas/ui test` | 71 passed |
| worker-node unit | `pnpm --filter @atlas/worker-node test` | 2 passed |
| Web integration (Testcontainers MySQL 8.4 + Redis 7) | `pnpm test:int` | 30 passed |
| Python | `uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest` | ruff clean, pyright 0 errors, 38 passed |
| AT-01 | `infra/scripts/compose-smoke.sh` | all 5 `/healthz` 200; 18 s from fresh volumes (images pre-built) |
| E2E + axe | `pnpm exec playwright test` | 40 passed (16 e2e + 24 axe, both themes) |
| AT-03 | `sh infra/ci/build-and-scan.sh` | 15 files scanned, 6 canaries + 8 patterns, 0 findings |
| X-02 | `infra/caddy/caddy.test.sh` | 7/7 checks |
| Forbidden strings | `pnpm check:strings` | pass |
| BullMQ spike | `spikes/bullmq-py/spike.ts` | PASS |

Acceptance tests covered in P0:
- **AT-01**: `compose-smoke.sh`.
- **AT-02**:
  - `tests/e2e/auth.spec.ts` "AT-02 / X-01a" (sign-in via the mock server).
  - "AT-02: without GitHub App credentials …" (`/setup` page).
- **AT-03**: `build-and-scan.sh`, plus `tests/unit/ci-scripts.test.ts`, which proves the scanner fails on planted secrets.
- **AT-04**: `tests/int/authz-matrix.test.ts`.
  - Every route file is in the manifest.
  - Every session route refuses anonymous callers.
  - User A gets 403 on user B's job.
  - Job lists are scoped to the caller.
- **AT-05**:
  - `tests/e2e/jobs-roundtrip.spec.ts`: real UI → BullMQ → worker-py → HMAC callback → DB; a forged callback gets 401.
  - `tests/int/jobs-callback.test.ts`.
- **AT-27, auth part (reworded)**: the e2e traffic check (the only non-GET GitHub saw is `POST /login/oauth/access_token`), unit tests, the lint-rule tests, and the manifest test.
- **X-01 a–e**: unit tests plus e2e, including a GitHub account renamed to the owner's login and a refusal to start without the env var.
- **X-02**: `caddy.test.sh`.
- **X-03**: redaction tests in TS and Python.
- **X-10**: both directions, web→api-py and worker-py→web. Covers bad signature, more than 5 minutes old or ahead, reused nonce, altered body or path, store down → 503, and the 600 s TTL.
- **X-14**: integration (zero GitHub fetches, all rows gone) and e2e (steps shown).
- **AT-13 (P1 test, run early)**: axe finds zero serious or critical issues on every existing page in both themes.
- **X-13 (DB part)**: the CHECK constraints reject browser results in counting states.

### Failed, then fixed during P0 (not hidden)
- **Contrast**: the light-theme border on `surface-2` was 2.97:1; darkened to pass 3:1.
- **Health check**: the container health check used `127.0.0.1:3000`, which is the dev sandbox origin and correctly 404s. Fixed with a Host header.
- **Sandbox page**: Next's standalone build omits `public/`, so the sandbox page 404'd until the Dockerfile copied it.
- **Sign-in rate limit**: e2e hit Better Auth's built-in 3-per-10-s limit on `/sign-in/*`. It is now explicit and env-tunable, raised only in the test overlay.
- **Migrations path**: Turbopack treated `new URL("./migrations", import.meta.url)` as an asset import; switched to a path join.
- **Lint config**: the `eslint-plugin-boundaries` config was rewritten for v7 syntax, and a test now proves each rule fires on a planted violation.

### Not done / limits (honest)
- **CI not yet run on GitHub**: this push is its first run. Actions are pinned to major tags, not commit SHAs (follow-up).
- **No OpenTelemetry instrumentation yet**: Jaeger runs but nothing exports traces. G §10 does not list it under P0; planned for P1.
- **Redis token-bucket rate limits** for mentor and uploads arrive with those features. Only the auth endpoints are limited now, by Better Auth's in-memory limiter.
- **Real GitHub sign-in is unchecked**: it is a manual check (Q4) and needs your GitHub App. CI uses the mock.
- **Unverified revoke link**: `https://github.com/settings/apps/authorizations` and its steps are labelled "Unverified" in the UI because docs.github.com was unreachable from here. The P3-core verification job must check it.
- **Fonts**: system stacks for now; the licence check and self-hosting are in P1.
- **Pyodide/sandbox**: only the host split exists; the runner page is a placeholder. X-05 is P1.
- **AT-01 timing excludes image build time** (≈45 s here with a warm cache).

### Mock data
None in the product. The only mock is `tests/support/mock-github-oauth/server.ts`. It runs only in `compose.test.yaml`, and the web app accepts its URLs only when `ATLAS_ENV=test`, which the env tests enforce.

### What I need from you
1. **A GitHub App** for real sign-in: create it from `infra/github-app/manifest.json` (all permissions read, no webhooks), then put `GITHUB_APP_CLIENT_ID` / `GITHUB_APP_CLIENT_SECRET` in `.env`. Then do the manual sign-in check.
2. **Review of the P0 decisions D-23…D-37** in PLAN.md §9, especially:
   - D-25: Better Auth's own token encryption instead of AES-GCM for its tables.
   - D-29: ESLint 9.
   - D-30: TypeScript 5.9.
   - D-32: `ioredis`/`httpx`/`redis` as direct dependencies.
3. **"Go" for P1.**
