# PROGRESS.md

## 2026-11-17 — P1 Learning core (finished on branch `p1-learning-core`; awaiting review)

### Built
- **CI hardening (D-38):** every GitHub Action is pinned to a full commit SHA (taken from CI run 43916244822's own logs). A unit test fails on any unpinned `uses:`. CI runs the Python checks on 3.12.
- **Content (`content/`):**
  - 24 Research-Intensive weeks and 16 Accelerated weeks, with every gate, required evidence item, rubric and remediation track from specs B and H.
  - The skill graph and the "weeks 18+ need the W12 and W15 exams" rule.
  - 14 sources, all from SOURCES.md with their check date; the GitHub revoke link is marked unverified.
  - Lessons for weeks 1-3, each with 15 must-know cards; the week 1 retrieval quiz; the week 1 practice exercise; a 14-item diagnostic.
  - The loader validates everything with Zod and cross-checks references and cycles.
- **Learning rules (`modules/learning`):**
  - Gate evaluation counts only verified counting evidence and applies the rubric rule (no "missing", at least half competent). AI-suggested scores never count; self-scores are labelled.
  - Roadmap locks take no time input at all; the hours-never-unlock rule is enforced at compile time.
  - Remediation locks only dependent weeks; FSRS scheduling via ts-fsrs 5.4.2.
  - Quizzes are graded on the server; diagnostic skips are limited to weeks 1-3; the learning meter excludes sample data; the finish estimate uses your actual pace after week 2.
- **API:** 20 new routes (27 in total), all in the route manifest. The cross-user test now also covers another user's cards and attempts.
- **Pages:**
  - Today: meter, today's plan, current gate, estimate.
  - Diagnostic: one task per screen, timer, pause, autosave, "I don't know"; result page with skill map and recommendation.
  - Roadmap: React Flow graph, timeline and list.
  - Learn and the lesson viewer: outline, MDX + Shiki, runnable snippets, Mermaid with a text version, cards, resources with verified/stale badges and "report a broken link".
  - Gate: requirements checklist, quiz, artifact links, self-scored rubric.
  - Exercise: Monaco over a textarea, practice checks, hint ladder with counter, atlas-lab command, solution only after the gate passes.
  - Daily workspace (quiz first, then timed tasks), Progress analytics, and plan settings.
- **Sandbox (D-14, D-46):** self-hosted Pyodide in a module worker on `SANDBOX_ORIGIN`, with a time limit and origin-checked, Zod-validated messages. In production Caddy proxies only `/sandbox/*` there and strips cookies both ways.
- **OpenTelemetry (D-42):** web, api-py and worker-py export to Jaeger in dev, with redacting exporters. A job is one trace across web, worker-py and the signed callback.
- **Fonts:** self-hosted Inter, Source Serif 4 and JetBrains Mono; all SIL OFL 1.1, checked against each package's LICENSE.

### Tested (local, 2026-11-17; CI on the branch: see below)
| Suite | Result |
|---|---|
| Lint (boundaries included) / strict typecheck | clean |
| Web unit | 162 passed (15 files) |
| UI contrast / worker-node | 71 / 2 passed |
| Integration (Testcontainers MySQL 8.4 + Redis 7) | 82 passed |
| Python (ruff, pyright strict, pytest) | clean, 41 passed |
| Playwright | 65 passed: 25 e2e + 40 axe (20 pages × 2 themes) |
| AT-01 compose smoke | pass |
| AT-03 + X-06 bundle scan | 0 findings in `.next/static` (119 files) and the sandbox files, 9 canaries incl. answer keys and solution |
| X-02 Caddy edge | 9/9 checks |

Acceptance tests covered in P1:
- **AT-06:** unit test, including a compile-time check that the lock function has no time input, plus an integration test logging 100 hours.
- **AT-07:** unit and integration.
- **AT-08:** e2e. It runs the correct solution in Pyodide, records a practice attempt, and asserts no request body to the server contains code.
- **AT-09:** unit and integration.
- **AT-10:** unit and integration.
- **AT-11:** unit and integration (a failed W3 locks W8 but not W4 or W7).
- **AT-12:** unit, integration and e2e (a resource forced to an older date shows "Stale").
- **AT-13:** axe on every P1 page in both themes.
- **AT-14:** keyboard-only e2e covering Today, the quiz, a lesson and an exercise.
- **X-05:**
  - The sandbox iframe's origin differs from the app's.
  - `document.cookie` inside it is empty and `/api/me` there returns 404.
  - Learner code's `pyfetch` to the app fails.
  - Messages from any other origin are ignored.
- **X-06:** API tests plus the canary bundle scan.
- **X-11 / X-13:** unit, integration and the database CHECK constraints.
- **X-03 for traces:** TS and Python tests.
- **Tracing:** e2e checks that a job is one trace across web and worker-py in Jaeger.

### Failed, then fixed during P1 (not hidden)
- **Diagnostic autosave race (found by CI):** CI run 44025714721 failed one of 65 browser tests. The page showed "Paused. Your answers are saved" before the save request finished, and a reload could beat it. Saves now run one after another, the paused view shows the real save status, and the test waits for "saved".
- **Sandbox never ready:** the iframe `src` was computed during server render, so the page shipped an empty parent origin and the runner refused to start. It is now set on the element after mount.
- **Accessibility (found by axe):**
  - Resource links weren't underlined.
  - A scrollable code block wasn't keyboard-focusable.
  - Mermaid's and Monaco's dark themes failed contrast (now explicit token colours and `hc-black`).
- **Caddy:** a nested env default (`{$A:{$B}}`) isn't expanded and sent `Host: …}`; the upstream host is now passed explicitly.
- **Monaco icon font:** blocked by CSP; `font-src data:` added.
- **Lesson timing:** the set timing showed 0.000 µs because browser timers are coarse; more repeats.
- **Build tracing:** the content path caused whole-project tracing; excluded.
- **Test bugs:** an expected status, and a schema test that duplicated seeded rows.
- **Environment:** the Docker daemon in this cloud container stopped twice between turns and was restarted; nothing in the repo depended on it.

### Not done / limits (honest)
- **Code-test gates can't pass yet (D-45):** objective results come only from atlas-lab, which is P2. Until then the UI says "pending evidence — run with atlas-lab"; the tests stand in for atlas-lab with labelled DB fixtures.
- **Lessons for weeks 4-24 aren't written (Q25).** Their objectives, gates and rubrics are in the curriculum.
- **The diagnostic's code task is self-reported:** it shapes the skill map only and never skips a week.
- **Two P1-referenced quizzes don't exist yet:** `q-w04` and `q-w20-exam`. Those gates show "quiz content arrives with this week's lessons".
- **Progress analytics has tables, no charts yet:** ECharts arrives with P2 benchmark analytics.
- **GitHub Actions run v4 actions on deprecated Node 20:** a CI warning; tracked in TASKS.

### Mock data
None in the product. Test-only: the mock GitHub OAuth server, and e2e/integration fixtures that write labelled stand-in atlas-lab results straight to the DB.

### What I need from you
1. Review of PR #1 (P0), and of this branch (P1) once you want a PR for it.
2. Decisions **D-40…D-51** (PLAN §9), especially D-41 (ts-fsrs 5.4.2 because of Node 22), D-45 (no code gate can pass before atlas-lab) and D-46 (sandbox proxied through Caddy).
3. **Q25** (lesson-writing order for weeks 4-24) and **Q26** (move to Node 24 in P2).
4. "Go" for P2.


## 2026-11-16: Repository move to AI-Learning-Path + P0 review

- **Home repository:** https://github.com/harisonharold/AI-Learning-Path, branch `ccr-42198ca2-6rc626`. `main` is untouched (`d54d076`, your original README).
- **Commits:** the three P0 commits from `harisonharold/sloane` were replayed on top of `d54d076`. The file trees are identical except `README.md`, which keeps your `# AI-Learning-Path` heading as its first line. A fourth commit then moved the repo-name references and applied the P0 review.
- **CI on AI-Learning-Path:** run [43916244822](https://github.com/harisonharold/AI-Learning-Path/actions/runs/43916244822) on `21629ce` passed all four jobs:
  - lint, typecheck, unit tests, bundle scan
  - Python checks
  - integration
  - Compose + AT-01 + e2e/axe + Caddy
- **CI on the earlier sloane push:** run [43909446923](https://github.com/harisonharold/sloane/actions/runs/43909446923) on `5ead251` also passed.
- **P0 review applied:**
  - D-25 documented in THREAT_MODEL §3a. Better Auth's XChaCha20-Poly1305 settings were checked against the 1.7.25 source.
  - D-29/D-30 revisit items added to TASKS.md.
  - D-31/D-32/D-34 approved.
  - SHA-pinning of Actions (D-38) is now a P1 exit condition.
- **sloane:** nothing deleted, reverted or force-pushed. It waits for your decision (PLAN §1).


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
- **CI action pinning**: actions are pinned to major tags, not commit SHAs. D-38 makes SHA pinning a P1 exit condition.
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
