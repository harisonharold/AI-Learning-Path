# PLAN.md — Systems Atlas

Status: **Revision 2 — plan approved 2026-11-16 with answers to Q2–Q7, Q9, Q13, Q14, Q16, plus six required security fixes (§11).** P0 has **not** started and will not start until Harison says "go". No application code, installs or scaffolding exist.

Authoritative spec: `docs/spec/G_claude_code_prompt.md` (wins on conflict). Supporting: `docs/spec/{A..F,H}_*.md`, `docs/spec/SOURCES.md`. This plan references those files by section instead of restating them.

---

## 1. Repository findings (inspected 2026-11-16)

| Item | Finding |
|---|---|
| Branches | `main`, `ccr-42198ca2-6rc626` (current working branch), both at the same commit |
| History | 1 commit: `55f75c3 Initial commit` |
| Files before this session | `README.md` with the single line `# sloane` (no trailing newline) |
| Code, deps, CI, Docker | None |
| Added this session | `docs/spec/` (11 spec files copied from the uploads, upload-hash prefixes removed), `PLAN.md`, `THREAT_MODEL.md`, `docs/DATA_MODEL.md` |

Notes on the spec files:
- `G_master_prompt.md` wraps text that is byte-identical to `G_claude_code_prompt.md` (checked with `diff`). Both are kept; `G_claude_code_prompt.md` is the one we cite.
- `G_fable_prompt.md` mentions a `MASTER_PROMPT.md`. No file with that name was uploaded; `G_master_prompt.md` is assumed to be it (Open Question Q1).
- The repo is named `sloane`; the product is "Systems Atlas". Directory layout follows G §2 at the repo root (no `systems-atlas/` subfolder as drawn in D.2).

---

## 2. Architecture

Modular monolith, as G §1 / D.1. Seven containers in dev; seven in production (Jaeger dropped, Caddy added — see Decision D-03).

```
                        ┌──────────────────────────────── docker compose ───────────────────────────────┐
 Browser ──HTTPS──▶ [caddy]* ──▶ [web: Next.js 16]  (APP_ORIGIN)                                        │
   │                      │       ├─ app/(app)  17 pages (RSC)       ├─ Better Auth (GitHub, allowlist) │
   │  <iframe> ──HTTPS──▶ │ SANDBOX_ORIGIN: static Pyodide runner, no cookies, no /api                  │
   │  postMessage only    │       ├─ app/(public) /p/:handle         ├─ modules/* (domain logic)         │
   │                      │       ├─ app/api/* thin route handlers   └─ Drizzle ──▶ [mysql 8.4]  ◀─ ONLY │
   │                      │       │                                                     WRITER      │
   │                      │       ├─ enqueue ──▶ [redis 7] ─ BullMQ ─┬─▶ [worker-node] GitHub sync,    │
   │                      │       │                                  │     mentor calls, verification,  │
   │                      │       │                                  │     report orchestration         │
   │                      │       │                                  └─▶ [worker-py] stats, sim, traces │
   │                      │       ├─ HMAC (ts+nonce) ──▶ [api-py: FastAPI] sync compute < 5 s          │
   │                      │       ◀── HMAC callback  /api/internal/jobs/:id/result ◀── worker-py        │
   │                      │                                                                             │
   │                      │  [jaeger]** ◀── OTLP from web, workers, api-py                              │
   │                      └─────────────────────────────────────────────────────────────────────────────┘
 atlas-lab CLI (laptop / rented GPU box) ──HTTPS + runner token──▶ /api/runner/*
 worker-node ──GET only──▶ api.github.com, export.arxiv.org, allow-listed hosts (SSRF guard)
 worker-node ──▶ AI provider (Anthropic) — only after budget reservation
   * caddy: production overlay only   ** jaeger: dev overlay only
```

Network zones (Compose networks): `edge` (caddy↔web), `internal` (web, workers, api-py, redis, mysql — no published ports in prod; subnet pinned to `172.28.0.0/16` so the SSRF blocklist can name it explicitly). `api-py`, `redis`, `mysql`, `jaeger` never publish ports in the production overlay. `/api/internal/*` is blocked at Caddy (THREAT_MODEL T-W5).

**Two origins (D-14).** The app runs on `APP_ORIGIN`; Pyodide exercises run only on `SANDBOX_ORIGIN`, a different host:
- Production: Caddy serves `SANDBOX_ORIGIN` (default `sandbox.<app-domain>`, Q21) from a static directory of self-hosted Pyodide assets + a fixed runner page. It never proxies to `web`, so `/api/*` does not exist there and no cookie can be set or received.
- Development: `APP_ORIGIN=http://localhost:3000`, `SANDBOX_ORIGIN=http://127.0.0.1:3000`. Different hosts ⇒ different origins; host-only cookies set on `localhost` are never sent to `127.0.0.1`. Next.js proxy/middleware serves **only** `/sandbox/*` on the sandbox host (everything else 404, never `Set-Cookie`) and returns 404 for `/sandbox/*` on the app host.
- Session cookies are host-only (no `Domain` attribute), so a sandbox subdomain never receives them. The iframe also carries `sandbox="allow-scripts allow-same-origin"` — `allow-same-origin` here grants the frame only *its own* (sandbox) origin, which Pyodide needs for its Web Worker and package cache; it never grants the app origin. App CSP: `frame-src SANDBOX_ORIGIN`. Sandbox CSP: `connect-src 'self'`, `frame-ancestors APP_ORIGIN`.
- Results return via `postMessage(targetOrigin = APP_ORIGIN)`; the parent accepts only `event.origin === SANDBOX_ORIGIN` and Zod-validates the message. They are recorded as **practice checks**, which never count toward a gate (D-15).

### 2.1 Module boundaries and import rules

```
apps/web/
  app/api/**/route.ts      → may import ONLY  modules/*/service.ts, modules/platform/http.ts (error shape, auth guard, zod helpers)
  app/(app|public)/**      → may import ONLY  modules/*/service.ts (server components), packages/ui, client-safe lib
  modules/<m>/service.ts   → public surface of module <m>
  modules/<m>/internal/**  → private; imported only from modules/<m>/**
  modules/<m>/**           → may import other modules ONLY via modules/<other>/service.ts
  db/schema/**             → imported only by modules/**/internal/repo*.ts and drizzle config
packages/contracts         → pure schemas (JSON Schema + generated Zod/Pydantic); no runtime deps on apps
packages/ui                → no imports from apps/*
```

| Module | Owns (tables) | Public services (examples) |
|---|---|---|
| `auth` (D-13) | Better Auth tables (`user`, `session`, `account`, `verification`), allowlist config | `getSession`, `requireAllowlistedUser`, `getGitHubUserToken(userId)` (exchanges/refreshes via the **single allowed POST** to `https://github.com/login/oauth/access_token`) |
| `platform` | profiles, user_roles, user_settings, ai_credentials, runner_tokens, jobs, audit_log | `requireUser`, `authorize(user, resource)`, `encrypt/decrypt`, `enqueue`, `audit`, `signHmac/verifyHmac` (timestamp + Redis nonce), `safeFetch` (SSRF guard) |
| `learning` | skills, skill_edges, weeks, gates, attempts, attempt_evidence, rubric_scores, remediation_plans, cards, card_reviews, time_logs, diagnostic_sessions, exercises | `getRoadmap`, `submitAttempt`, `gateState`, `reviewCard`, `todayPlan`, `learningMeter` |
| `research` | sources, papers, dossiers, dossier_evidence, novelty_checks, projects, run_configs, runs, run_metrics, run_samples | `ingestRun`, `compareRuns`, `canGenerateReport`, `verifySource`, `classifyDossier`, `searchPapers` |
| `github` | gh_installations, gh_repos, gh_issues, contributions | `syncRepo`, `estimateDifficulty`, `prDraftText`, `contributionEvidence` |
| `mentor` | mentor_threads, mentor_messages, ai_budgets, ai_spend_ledger, price_table, weaknesses, interview_sessions | `sendMessage`, `reserveBudget`, `confidenceFor`, `applyOutputPolicy` |
| `portfolio` | portfolio_items, writing_drafts | `publish`, `qualityCheck`, `validateBullets`, `meters` (aggregates via other services) |

Enforcement: `eslint-plugin-boundaries` (listed in G §1) with the rules above, plus a dependency-cruiser-free fallback script `scripts/check-imports.mjs` only if the plugin can't express a rule (would need approval — it's not a new dep, just a script). The "no GitHub write" rule is also enforced structurally: the only HTTP client the `github` module can import is `modules/github/internal/gh-client.ts`, whose type exposes `get()` only and whose base URL is fixed to `https://api.github.com`. The only code allowed to send a non-GET to any GitHub host is `modules/auth/internal/github-oauth.ts`, and only `POST https://github.com/login/oauth/access_token` (code exchange and token refresh both use this endpoint). An ESLint `no-restricted-imports`/boundaries rule forbids importing `github-oauth.ts` outside `modules/auth`. GitHub App installation tokens (`POST /app/installations/{id}/access_tokens`) are not used at all (AT-27).

Cross-language contracts live in `packages/contracts/*.schema.json` (benchmark upload, job payloads, HMAC envelope). Zod and Pydantic models are hand-written; shared fixtures are validated against the JSON Schemas with **Ajv** (TS, dev-only) and **`jsonschema`** (Python, dev-only), approved under Q14.

---

## 3. API list

All of G §4 / D.4, unchanged, plus the additions below (each flagged; none adds an outward action).

| Method & path | Auth | Module | Notes |
|---|---|---|---|
| `GET /api/me` | session | platform | |
| `POST /api/diagnostic/attempts`, `GET /api/diagnostic/result` | session | learning | |
| `GET /api/roadmap` | session | learning | lock state computed server-side |
| `GET /api/today` | session | learning | |
| `POST /api/cards/:id/review` | session | learning | `{rating:1..4}` |
| `GET /api/lessons/:slug` | session | learning | resources carry `verified_at`, `stale` |
| `POST /api/gates/:id/attempts` | session | learning | |
| `POST /api/attempts/:id/rubric` | session (self) / reviewer | learning | scorer derived from role, never from body |
| `GET /api/analytics/meters` | session | portfolio | 4 separate objects, never merged |
| `GET /api/dossiers`, `GET /api/dossiers/:slug` | session | research | |
| `POST /api/sources/verify` | session | research | enqueues job; SSRF-guarded |
| `GET\|POST /api/papers`, `PATCH /api/papers/:id` | session | research | |
| `GET\|POST /api/projects`, `GET\|PATCH /api/projects/:id` | session | research | pre-registration immutable once set |
| `POST /api/projects/:id/runs` | session | research | same contract as runner upload |
| `GET /api/runs/compare?ids=` | session | research | api-py; degrades to stored summaries |
| `POST /api/projects/:id/report` | session | research | 409 + reasons when baseline rule fails |
| `GET /api/github/repos`, `POST /api/github/sync`, `GET /api/github/issues?repo=` | session | github | |
| `GET\|POST /api/contributions`, `PATCH /api/contributions/:id` | session | github | local records only |
| `POST /api/mentor/messages` (SSE) | session | mentor | budget reserved before provider call |
| `GET\|PUT /api/settings`, `POST /api/settings/ai-key` | session (admin flag for keys/budgets) | platform | key never returned |
| `POST /api/runner/tokens`, `DELETE /api/runner/tokens/:id` | session | platform | plaintext token shown once |
| `POST /api/runner/results` | runner token `results:write` | research | ≤ 20 MB, streamed size check |
| `GET /api/export`, `DELETE /api/account` | session + re-auth | platform | Makes **no** GitHub call (Q16). Response and confirmation page show "Revoke Systems Atlas on GitHub" with a link and steps (D-19); the link is a `sources` row so it carries `verified_at` |
| `POST /api/internal/jobs/:id/result` | HMAC | platform | blocked at Caddy |
| `GET /p/:handle/*` | public | portfolio | 404 for unpublished |
| **+** `GET /api/healthz` | none | platform | AT-01 (G says `/healthz` on every service; route path is Q15) |
| **+** `GET /api/jobs`, `POST /api/jobs/:id/retry` | session | platform | D.7 "Settings > Jobs, retry button" has no endpoint in G §4 |
| **+** `DELETE /api/mentor/weaknesses/:id` | session | mentor | C.5 "learner can delete" has no endpoint in G §4 |
| **+** `GET\|POST /api/interviews`, `POST /api/interviews/:id/rubric` | session | mentor | AT-38 has no endpoint in G §4 |
| **+** `POST /api/portfolio/items`, `PATCH /api/portfolio/items/:id` | session | portfolio | AT-39 has no endpoint in G §4 |
| **+** `POST /api/portfolio/writing` | session | portfolio | FR-26 bullets; AT-41 |
| **+** `POST /api/time-logs` | session | learning | FR-3 timer; no endpoint in G §4 |

Conventions: Zod on every input; error shape `{error:{code,message,details}}`; cursor pagination `?cursor=&limit=` (max 100); every handler starts with `requireUser()` + `authorize()` (AT-04 is generated from the route manifest, so an unlisted route fails the test).

api-py (internal, HMAC): `/stats/summary`, `/stats/compare`, `/traces/analyze`, `/sim/schedule`, `/reports/render`, `/healthz` — as G §4.

---

## 4. Page list

| # | Page | Route | Phase | Locked until | States beyond the E.4 six |
|---|---|---|---|---|---|
| 1 | Dashboard / Today | `/today` | P0 shell, P1 content | — | day-1 empty: "Take the diagnostic" |
| 2 | Diagnostic | `/diagnostic` | P1 | — | paused/resumed |
| 3 | Roadmap (graph / timeline / list) | `/roadmap` | P1 | — | list view = a11y equivalent |
| 4 | Daily workspace | `/workspace` | P1 | — | quiz blocking |
| 5 | Lesson viewer | `/learn/[slug]` | P1 | per-week gate | stale resource badge |
| 6 | Coding exercises | `/lab/exercises/[id]` | P1 (Pyodide practice checks), P2 (atlas-lab counting runs) | per-week gate | browser results badged **"Practice check — doesn't count toward gates"**; "Run for the gate: `atlas-lab run <id>`" |
| 7 | Systems architecture lab | `/lab/systems` | P7 | advanced tab: W12 exam | "simulation, not a real system" |
| 8 | Research discovery | `/research` | P3 | W8 exam (peek allowed) | stale evidence |
| 9 | Research project workspace | `/research/projects/[id]` | P2 | — | report-blocked reasons |
| 10 | Paper library | `/research/papers` | P3-core (in v1) | never locked (Q7) | unverified entry |
| 11 | Benchmark analytics | `/analytics/benchmarks` | P2 | — | api-py degraded banner |
| 12 | GitHub contribution tracker | `/open-source` | P4 | W12 exam (peek allowed) | not configured; rate-limited (cached) |
| 13 | AI mentor | `/mentor` | P5 | — | mentor off; budget hit |
| 14 | Interview simulator | `/interview` | P5 | — | |
| 15 | Portfolio builder | `/portfolio` | P6 | — | |
| 16 | Progress analytics | `/analytics/progress` | P1 (learning meter), P6 (all 4) | — | |
| 17 | Settings & integrations | `/settings` | P0 shell, grows each phase | — | not configured per integration |
| — | Public portfolio | `/p/[handle]/…` | P6 | — | 404 unpublished |
| — | Sign-in / "configure GitHub login" | `/signin`, `/setup` | P0 | — | AT-02 |
| — | 404 "lost packet" | `not-found.tsx` | P7 (plain 404 from P0) | — | |

Every page implements loading (skeleton > 300 ms), empty, error, offline (read-only cache), mock (SAMPLE DATA banner), locked (names the gate). A shared `<PageState>` component in `packages/ui` enforces the set; an axe + snapshot test renders each page in each state.

Command palette and shortcuts per E.2 in P0 (navigation only), extended per phase. `:raft` and Byzantine theme in P7.

---

## 5. Phase plan with acceptance-test mapping

Exit rule for every phase (G §10, H.1): `docker compose up` + seed starts the app; `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm test:e2e && pnpm test:a11y` and `uv run ruff check && uv run pyright && uv run pytest` green in CI; `PROGRESS.md` and `TASKS.md` updated; report per G §12.

Test types: **U** unit (Vitest/pytest), **I** integration (Testcontainers MySQL/Redis), **C** contract (JSON Schema both sides), **E** e2e (Playwright), **A** axe, **S** script/CI check, **M** manual.

| AT | Phase | Test file (planned) | Type | Hard rule it proves |
|---|---|---|---|---|
| 01 | P0 | `tests/e2e/healthz.spec.ts` + `infra/scripts/compose-smoke.sh` | S/E | one-command start |
| 02 | P0 | `tests/e2e/auth-github.spec.ts` (mock OAuth, Q4) + `tests/e2e/auth-not-configured.spec.ts` | E | no creds → "not configured" |
| 03 | P0 | `infra/ci/scan-bundle.mjs` (canary values + patterns) | S | secrets server-side |
| 04 | P0 (grows) | `apps/web/tests/int/authz-matrix.test.ts` (generated from route manifest) | I | cross-user 403 |
| 05 | P0 | `apps/web/tests/int/job-roundtrip.test.ts` + `services/worker-py/tests/test_roundtrip.py` | I | HMAC 401 on bad sig |
| 06 | P1 | `apps/web/modules/learning/tests/locks.test.ts` | U | hours never unlock |
| 07 | P1 | `apps/web/modules/learning/tests/gate-evidence.test.ts` | U/I | gates need evidence |
| 08 | P1 | `tests/e2e/pyodide-exercise.spec.ts` — **reworded (D-15):** a Pyodide exercise runs its *public* checks in the sandbox-origin iframe and records a `practice` attempt labelled "practice check"; no code is sent to the server for execution; the gate state is unchanged | E | server never executes code; browser never counts |
| 09 | P1 | `apps/web/modules/learning/tests/fsrs.test.ts` | U | |
| 10 | P1 | `apps/web/modules/learning/tests/diagnostic-skip.test.ts` — skip allowed only for W1–W3 (Q5) and only when that week's gate has counting evidence (atlas-lab result or server-graded items) from within the diagnostic; a W4 request or a browser-only result never skips | U | skip only on passed gate |
| 11 | P1 | `apps/web/modules/learning/tests/remediation.test.ts` | U | locks only dependants |
| 12 | P1 | `apps/web/modules/research/tests/staleness.test.ts` + `tests/e2e/lesson-resources.spec.ts` | U/E | verified_at + stale |
| 13 | P1 (grows) | `tests/a11y/pages.spec.ts` (all pages × light/dark × states) | A | |
| 14 | P1 | `tests/e2e/keyboard-core.spec.ts` | E | |
| 15 | P2 | `apps/web/tests/int/runs-upload.test.ts` + `services/api-py/tests/test_summary.py` | I/U | server recomputes |
| 16 | P2 | `apps/web/tests/int/runs-upload-invalid.test.ts`, `packages/contracts/tests/*` | I/C | |
| 17 | P2 | `cli/atlas-lab/tests/test_dry_run.py` | U | pre-flight cost |
| 18 | P2 | `apps/web/tests/int/runner-tokens.test.ts` | I | hashed tokens |
| 19 | P2 | `apps/web/modules/research/tests/report-gate.test.ts` | U/I | baseline + reps; failed runs kept |
| 20 | P2 (re-run P6) | `apps/web/tests/int/mock-exclusion.test.ts` + `tests/e2e/mock-banner.spec.ts` | I/E | mock excluded |
| 21 | P2 | `services/api-py/tests/test_compare_fixture.py` + web int | U/I | fixed-seed CI |
| 22 | P3-core (v1) | `apps/worker-node/tests/verify-arxiv.test.ts` (recorded fixture) + nightly live job | U/S | no invented facts |
| 23 | P3-core (v1) | `apps/worker-node/tests/verify-url-captcha.test.ts` | U | captcha ≠ verified |
| 24 | P3 | `apps/web/modules/research/tests/classification.test.ts` | U | dated evidence |
| 25 | P3 | same + `infra/ci/forbidden-strings.mjs` ("novel") | U/S | no "novel" |
| 26 | P3-core (v1) | `apps/web/tests/int/papers-fulltext.test.ts` | I | |
| 27 | P0 (auth part), P4 (data part) | **Reworded (approved):** "The GitHub data module sends only GET; the OAuth token exchange is the single allowed POST, in the auth module." Tests: `apps/web/modules/github/tests/get-only.test.ts` (HTTP mock: every request from `modules/github` is `GET https://api.github.com/...`); `apps/web/modules/auth/tests/oauth-single-post.test.ts` (the only non-GET to any GitHub host across the whole test suite's recorded traffic is `POST https://github.com/login/oauth/access_token`, issued from `modules/auth`); lint rule test that `github-oauth.ts` is not importable elsewhere; `infra/github-app/manifest.test.ts` (all permissions `read`) | U/S | read-only by capability |
| 28 | P4 | `apps/web/modules/github/tests/estimator.test.ts` | U | labels never trusted |
| 29 | P4 | `apps/worker-node/tests/ratelimit-backoff.test.ts` + e2e cached banner | U/E | |
| 30 | P4 | `tests/e2e/contribution-copy.spec.ts` + `infra/ci/route-manifest-audit.mjs` | E/S | no outward action |
| 31 | P4 | `apps/web/modules/portfolio/tests/merged-pr-evidence.test.ts` | U/I | |
| 32 | P5 | `tests/e2e/mentor-off.spec.ts` (full core flow with no key) | E | mentor optional |
| 33 | P5 | `apps/web/modules/mentor/tests/withholding.test.ts` (stub model emits solution) | U | server-side withholding |
| 34 | P5 | `apps/web/modules/mentor/tests/code-filter.test.ts` | U | ≤ 3-line code |
| 35 | P5 | `apps/web/modules/mentor/tests/confidence.test.ts` | U | citations not self-report |
| 36 | P5 | `apps/web/modules/mentor/tests/budget.test.ts` (provider spy never called) | U/I | cap before call |
| 37 | P5 | `apps/web/tests/int/ai-key-writeonly.test.ts` | I | ciphertext only |
| 38 | P5 | `apps/web/tests/int/interview-rubric.test.ts` | I | |
| 39 | P6 | `apps/web/tests/int/portfolio-publish.test.ts` + `tests/e2e/public-404.spec.ts` | I/E | verified only |
| 40 | P6 | `apps/web/modules/portfolio/tests/quality-check.test.ts` | U | |
| 41 | P6 | `apps/web/modules/portfolio/tests/bullets.test.ts` | U | evidence per sentence |
| 42 | P6 (CI from P0) | `infra/ci/forbidden-strings.mjs` + `tests/e2e/hiring-checklist.spec.ts` | S/E | no probability claims |
| 43 | P7 | `services/api-py/tests/test_mm1.py` | U | |
| 44 | P7 | `infra/scripts/test-backup-restore.sh` (CI job with MySQL container) | S | |
| 45 | P7 | Lighthouse CI config `infra/ci/lighthouserc.json` | S | |
| 46 | P7 | `PROGRESS.md` record | M | |
| 47 | P2 (analytics exists) | `tests/e2e/analytics-degraded.spec.ts` (api-py stopped) | E | graceful degradation |

Additional tests this plan adds (not in the 47; each maps a hard rule or a threat):

| ID | Phase | What | Why |
|---|---|---|---|
| X-01 | P0 | **Allowlist (D-08 revised).** `apps/web/modules/auth/tests/allowlist.test.ts` + `tests/e2e/auth-allowlist.spec.ts` (mock OAuth): (a) the GitHub account whose numeric id = `ALLOWED_GITHUB_USER_ID` signs in; (b) any other id is rejected with no `user`, `account` or `session` row created and an `auth.signup_rejected` audit row; (c) an account that *renamed itself* to Harison's login but has a different numeric id is rejected; (d) env var missing → app refuses to start (fail closed); (e) a second sign-up attempt after the first user exists, with a different id, is rejected even if the env var is edited to a list (only one id accepted by the Zod loader) | T-A1 |
| X-02 | P0 | `infra/caddy/caddy.test.sh`: through Caddy, `/api/internal/*` → 404 on `APP_ORIGIN`; any path other than the static runner on `SANDBOX_ORIGIN` → 404 | T-W5 |
| X-03 | P0 | Log/trace redaction test: secrets/AI keys never appear in JSON logs or OTel attributes | G §0.8 "never in logs" |
| X-04 | P3-core (v1) | **SSRF guard.** `apps/web/modules/platform/tests/safe-fetch.test.ts` with a local DNS/HTTP fixture. Rejected: `ftp:`/`file:`/`gopher:`/`data:`/`javascript:`; ports other than 80/443 (incl. `https://x:8443`, `http://x:6379`); userinfo (`http://a:b@x`); IP literals and decimal/octal/hex/IPv4-mapped-IPv6 forms of `127.0.0.1`, `10.x`, `172.16–31.x`, `192.168.x`, `169.254.169.254`, `100.64.x`, `0.0.0.0`, `::1`, `fc00::/7`, `fe80::/10`, `::ffff:127.0.0.1`, `64:ff9b::7f00:1`, the pinned Compose subnet `172.28.0.0/16`; hostnames `localhost`, `*.localhost`, `*.internal`, single-label names and every Compose service name (`redis`, `mysql`, `api-py`, `web`, …); a public hostname whose DNS returns **any** blocked address; DNS rebinding (first lookup public, second private — guard connects to the IP it validated); a 302 from a public host to `http://127.0.0.1/` or to port 6379; a 4th redirect (max 3); a server that stalls past the timeout; a body over 2 MB (aborted mid-stream, source stored `broken`, reason recorded). Accepted: public https URL on 443 returning 200 | T-V1 |
| X-05 | P1 | **Sandbox origin.** `tests/e2e/pyodide-sandbox.spec.ts`: the exercise iframe's `src` origin equals `SANDBOX_ORIGIN` ≠ `APP_ORIGIN`; inside the iframe, `document.cookie === ''` and a request to `SANDBOX_ORIGIN/api/me` → 404; user Python code calling `pyfetch(APP_ORIGIN + '/api/me')` fails (CORS/no credentials) and the server log shows no authenticated request; a `postMessage` from any other origin is ignored by the parent; a malformed message is rejected by Zod. `apps/web/tests/int/sandbox-host.test.ts`: responses on the sandbox host never contain `Set-Cookie`; the app host returns 404 for `/sandbox/*`; session cookie has no `Domain` attribute | T-B1 |
| X-06 | P1 | Reference solutions and hidden-test answer keys are absent from `.next/static` and from sandbox assets (bundle grep for solution canaries) | T-B3 |
| X-07 | P5 | Mentor context builder excludes solution text before gate pass (asserts prompt contents) | LLM solution leakage |
| X-08 | P5 | Concurrent mentor calls cannot overspend (reservation ledger race test) | cost exhaustion |
| X-09 | P6 | Portfolio refuses items from `publish_restricted` course labs (6.5840, BusTub) | course policy (B W8/W9) |
| X-10 | P0 | **Internal HMAC.** `apps/web/tests/int/hmac.test.ts` + `services/api-py/tests/test_hmac.py` + `services/worker-py/tests/test_hmac.py`, for both directions (web→api-py and worker-py→web callback): valid request → 200; bad signature → 401; timestamp older than 5 min → 401; timestamp more than 5 min in the future → 401; same nonce reused (even with a fresh valid signature) → 401; body altered after signing → 401; Redis unavailable → 503 fail-closed (never accepted unchecked); nonce key expires after 10 min | T-W1/T-W2 |
| X-11 | all | Rubric scorer rules (Q6): `ai_suggested` never counts; `self` counts toward non-exam rubrics but the gate shows "self-assessed"; hiring-readiness counts only `reviewer`/`auto` | learning integrity |
| X-12 | P4 | GitHub fetched text rendered as escaped text (XSS fixture in issue title/body) | T-G3 |
| X-13 | P1 | **Practice checks never count.** `apps/web/modules/learning/tests/counting-evidence.test.ts`: a `source=browser` attempt is always stored with `status=practice` (DB CHECK + service); `gateState()` ignores it even if `passed`; a gate with only practice checks stays locked/pending; a gate passes only with counting evidence — atlas-lab runner result (server re-validated), server-graded answers, GitHub-API-verified commit/CI status, or reviewer score — plus whatever rubric the gate needs; UI string "Practice check" shown on every browser result (e2e snapshot) | D-15 |
| X-14 | P0 (delete flow exists from P0) | **Delete without GitHub calls.** `apps/web/tests/int/account-delete.test.ts`: `DELETE /api/account` removes all user rows, issues **zero** requests to any GitHub host (HTTP mock), and returns the revoke-by-hand steps + link; `tests/e2e/account-delete.spec.ts` shows them on the confirmation page | Q16 |
| X-15 | P7 | **OWASP live check (manual).** Before P7 sign-off, compare THREAT_MODEL §5–§6 against https://owasp.org/projects/top-ten and https://owasp.org/projects/top-10-for-large-language-model-applications; record date, edition and differences in `PROGRESS.md`; only then remove the UNVERIFIED markers. P7 cannot exit while the markers remain | THREAT §5–6 |

### Phase scopes (deliverables; acceptance per table above)

- **P0 Groundwork** — pnpm workspace + uv workspace; Compose (dev: web, worker-node, api-py, worker-py, mysql, redis, jaeger) + prod overlay (caddy replaces jaeger; caddy also serves `SANDBOX_ORIGIN` static); pinned `internal` subnet; Zod env loader per service (Pydantic Settings for Python) failing fast; GitHub Actions (lint, typecheck, unit, int, e2e, axe, bundle scan, forbidden strings); Drizzle schema for **all** tables in `docs/DATA_MODEL.md` + first migration; `modules/auth`: Better Auth + GitHub App sign-in, single-account allowlist by numeric GitHub id, single allowed POST to the OAuth token endpoint; in-repo mock OAuth server for CI (Q4); HMAC with timestamp + Redis nonce; account delete with revoke-by-hand steps; design-system shell (tokens, light/dark, left rail, palette, shortcut sheet, `<PageState>`); `/healthz` everywhere; BullMQ-Python spike (D-02). Exits on AT-01..05 + AT-27 (auth part) + X-01, X-02, X-03, X-10, X-14.
- **P1 Learning core** — content pipeline (`content/curriculum.yaml`, `sources.yaml`, MDX lessons for W1–W3 at minimum, Q12), skills graph + roadmap (graph/timeline/list), lesson viewer, Pyodide practice checks on `SANDBOX_ORIGIN` (D-14, D-15), gates/attempts/evidence/rubrics with counting-evidence rule, server-graded MCQ/short-answer items (answer keys server-only), remediation, FSRS + daily quiz, daily workspace + timer/time logs, diagnostic (W1–W3 only, Q5), learning meter. **Note:** a gate that needs code tests can only be *passed* once atlas-lab exists (P2); in P1 such gates show "pending evidence — run with atlas-lab (arrives in P2)". Exits on AT-06..14 + X-05, X-06, X-11, X-13.
- **P2 Lab** — projects with pre-registration, configs, runs upload (session + runner), contracts, atlas-lab CLI (login, run `--dry-run/--repeat/--gpu-rate/--max-hours`, upload, env capture, auto-shutdown script, timeout, notebook export/import, **exercise/gate test runner in Docker `--network none` producing counting evidence**), api-py stats (percentiles, bootstrap CI, Mann-Whitney U), analytics page (CDF, histogram, box, p50/95/99 + CI table, throughput, memory, GPU timeline, config/env diff with confounder warnings, data-table + text summary per chart), report generator (**Markdown + HTML only, no PDF**, Q13), mock banner + `sample data` toggle. Exits on AT-15..21, AT-47.
- **P3-core (in v1, Q9)** — source verification jobs (arXiv export API, GitHub REST `GET /repos`, `GET /repos/{o}/{r}/issues/{n}`, URL + title, price pages "estimate, read on DATE"), all through `safeFetch` (SSRF guard); nightly re-verification; stale warnings; paper library (FULLTEXT). Exits on AT-12 (live data), AT-22, AT-23, AT-26, X-04.
- **P3 Research engine (rest)** — job-board verification, 13 seed dossiers + evidence sources, classification rules, novelty-check log. Exits on AT-24, AT-25.
- **P4 GitHub workspace** — GitHub App manifest (read-only), installation + user-to-server token refresh, repo explorer (16 targets + archived/source-available labels), issue sync (ETag, rate-limit backoff, timeline-based linked PRs), difficulty estimator with reasons, checklist + copyable PR text, PR tracker, merged-PR → evidence.
- **P5 Mentor + interviews** — provider adapter (`none`, `anthropic`), encrypted write-only key, price table + pre-call estimate + reservation ledger + caps, 7 modes, Socratic-first + hint ladder, server-side withholding + code-length filter, citation-derived confidence, weakness tracking, interview simulator (coding via exercise engine, system design whiteboard + rubric, defend-your-project with local recording).
- **P6 Portfolio + career** — builder (verified only, restricted-lab block), public pages, repo quality checks (GET-only), evidence-linked writing helpers, all 4 meters with formulas, conference/community list with sources.
- **P7 Hardening** — systems lab canvas + `/sim/schedule` (M/M/1 validation), manual screen-reader pass, Lighthouse budget, backup/restore scripts + test, deploy docs (local, VM + Caddy), easter eggs.

**v1 = P0 + P1 + P2 + P3-core (source verification + paper library).**

P7 additionally cannot exit until X-15 (live OWASP check) is recorded.

---

## 6. First P0 task list for the builder agent (only after Harison says "go")

Each task ends with its own test; the phase is not done until all P0 ATs pass.

1. Root: `pnpm-workspace.yaml`, `package.json` scripts (`lint`, `typecheck`, `test`, `test:int`, `test:e2e`, `test:a11y`, `scan:bundle`, `check:strings`), `.nvmrc`, `.editorconfig`, `.gitignore`, uv workspace `pyproject.toml`. Pin current stable versions found at install time; record them in `PROGRESS.md`.
2. `infra/compose/compose.yaml` (7 services, healthchecks, `internal` network with subnet `172.28.0.0/16`, named volumes `mysql-data`, `raw-data`), `compose.prod.yaml` (caddy, no jaeger, no published internal ports), `infra/caddy/Caddyfile` (APP_ORIGIN → web with `/api/internal/*` → 404; SANDBOX_ORIGIN → static `file_server` only), `infra/mysql/my.cnf` (`innodb_ft_min_token_size=2`, utf8mb4, see DATA_MODEL §7).
3. Env loaders: `apps/web/env.ts` (Zod, server-only module guarded by `import 'server-only'`), worker-node, api-py/worker-py (Pydantic Settings). Required: `APP_ORIGIN`, `SANDBOX_ORIGIN` (must differ from `APP_ORIGIN` in host — Zod refinement), `ALLOWED_GITHUB_USER_ID` (exactly one positive integer), `INTERNAL_HMAC_KEY` (≥ 32 bytes). `.env.example` with **no** real values. Test: missing/invalid var → process exits non-zero with the var name.
4. `apps/web` Next.js 16 App Router, TS strict, Tailwind v4, shadcn/ui init; `packages/ui` tokens (colours from E.1, both themes, contrast-checked), `<PageState>`, `<Badge kind=verified|self|ai|mock|stale>` (icon + text).
5. Drizzle schema for every table in `docs/DATA_MODEL.md`; `drizzle-kit generate`; migration runner on container start; Better Auth tables via its Drizzle schema generation (D-05).
6. `modules/auth`: Better Auth + GitHub provider configured with the GitHub App's client id/secret (D-04); `databaseHooks.user.create.before` + account-link hook reject any GitHub numeric id ≠ `ALLOWED_GITHUB_USER_ID` (no rows written, audit `auth.signup_rejected`); Better Auth account tokens encrypted; `github-oauth.ts` as the single non-GET to GitHub; `/setup` "configure GitHub login" page when the App credentials are absent; in-repo mock OAuth server under `tests/support/mock-github-oauth/` (Q4); `GET /api/me`; `DELETE /api/account` with revoke-by-hand steps.
7. `modules/platform`: error shape, `requireUser`, `authorize`, route manifest export, audit log, AES-256-GCM helper (key id + AAD), HMAC sign/verify per THREAT_MODEL §3 TB3/TB6 (headers `X-Atlas-Timestamp`, `X-Atlas-Nonce` (128-bit random, base64url), `X-Atlas-Signature` = HMAC-SHA256 over `METHOD\npath\ntimestamp\nnonce\nsha256(body)`; reject |now − ts| > 300 s; `SET hmac:nonce:<nonce> 1 NX EX 600` — reuse or Redis error ⇒ reject), same algorithm implemented in Python for api-py/worker-py with a shared test-vector file in `packages/contracts/hmac-vectors.json`.
8. App shell: left rail (E.2 order), command palette (navigation), shortcut sheet, theme toggle, skip link, focus ring, offline indicator.
9. `/healthz` on web, worker-node (tiny HTTP), api-py, worker-py; Compose healthchecks; `compose-smoke.sh` (AT-01).
10. **BullMQ-Python spike** (`spikes/bullmq-py/`): Node enqueues `stats.echo` → Python `bullmq` worker processes → HMAC POST to web callback → web writes `jobs.result_json`. Verify: retries, failure → `failed` state, graceful shutdown, job removal policy, version compatibility of BullMQ Node vs Python on the same Redis. Record result in §9 Decisions. On failure: RQ inside worker-py with web polling/HMAC callback (fallback already named in G §1).
11. CI workflow `.github/workflows/ci.yml`: lint, typecheck, unit, integration (Testcontainers), e2e (Playwright `--trace off`), axe, bundle scan (build with canary secret values), forbidden-strings, ruff, pyright, pytest.
12. Tests for AT-01..AT-05, AT-27 (auth part), X-01, X-02, X-03, X-10, X-14. Update `TASKS.md`, `PROGRESS.md`, `README.md` (run instructions + budget tiers from C.9 with "estimate, read on 2026-11-16").

---

## 7. Risks

| ID | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| R-01 | BullMQ Python lags Node features/versions → queue incompatibility | M / M | P0 spike; RQ fallback; pin both; contract test on job payloads |
| R-02 | Seed sources verified 2026-11-16 go stale on 2026-12-16 | H / M | **Resolved:** verification job is in v1 (P3-core). Still stale if the stack isn't run nightly — banner says so |
| R-03 | Browser-run tests (Pyodide) are self-reported | H / M | **Resolved by design:** they are "practice checks" and never count (D-15, X-13). Residual: atlas-lab runs on the learner's machine can also be forged (THREAT RR1) |
| R-13 | Pyodide's Web Worker + package loading may misbehave in a cross-origin iframe (CORS on assets, worker URL origin) | M / M | P1 starts with a half-day spike on the dev two-host setup; fallback is running Pyodide on the iframe's main thread with a timeout-and-reload watchdog — never moving it to the app origin |
| R-14 | Requiring atlas-lab for code gates raises setup friction on day 1 (Docker needed for W1) | M / M | Diagnostic and W1 lessons include a guided `atlas-lab` install; W1 gate's server-graded quiz part can be done first |
| R-15 | GitHub login rename/reuse would defeat a login-based allowlist | L / H | Allowlist by immutable numeric user id, not login (X-01c) |
| R-04 | Better Auth + Drizzle MySQL adapter + Next.js 16 edge cases | M / M | Pin versions; integration test of sign-in with mock OAuth |
| R-05 | Scope: 17 pages + CLI + 2 Python services for one maintainer | H / H | Strict phase gates; v1 limited; out-of-scope list §10 |
| R-06 | GitHub unauthenticated rate limit (60/h) blocks verification of ~150 GitHub sources when App not installed | H / L | Verification degrades to "not re-checked" (stale) with clear banner; never marks verified without a fresh 200 |
| R-07 | Learner sincerity/fatigue — gates too hard → abandonment | M / H | Remediation tracks; locks only dependants; honest re-estimate of finish date |
| R-08 | MySQL FULLTEXT tokenisation misses short terms (`KV`, `TP`) | H / L | `innodb_ft_min_token_size=2` + ngram-free natural language mode; test with "KV" |
| R-09 | Course policies (MIT 6.5840, CMU 15-445) forbid publishing solutions | M / M (reputational) | `publish_restricted` flag; portfolio blocks those artifacts (X-09) |
| R-10 | Pyodide/Monaco/ECharts bundle size vs LCP < 2.5 s | M / M | Lazy-load per route; self-host assets; Lighthouse budget per phase not only P7 |
| R-11 | Provider price or model changes break cost estimates | M / M | price_table with `verified_at`; stale price → mentor warns and uses max known price |
| R-12 | Haiku-tier models think by default; thinking tokens are billed as output → estimates too low if they assume visible text only | M / L | Estimate = input + `max_tokens` (upper bound incl. thinking); settle with actual usage |

---

## 8. Open Questions

Resolved items keep their row for traceability. Q1, Q8, Q10–Q12, Q15, Q17–Q20 use the proposed default unless you say otherwise.

| # | Question | Spec reference | My proposed default |
|---|---|---|---|
| Q1 | Is `G_master_prompt.md` the `MASTER_PROMPT.md` named in G_fable_prompt? | G_fable header | Yes; keep both files |
| Q2 | Container count: G says "at most ~7", Fable says "≤ 7", C NFR-7 says "< 10". Does Caddy count? | G §0.11, C NFR-7 | **Resolved:** Caddy counts. Dev = 7 with Jaeger; prod = 7 with Caddy, no Jaeger. |
| Q3 | One GitHub App for both sign-in and data (fewer secrets), or a separate OAuth app for sign-in as D.1 says? | D.1 vs G §1 | **Resolved:** one GitHub App for sign-in + read-only data. |
| Q4 | AT-02 "given GitHub OAuth test credentials": real GitHub in CI is not possible. OK to test sign-in against a local mock OAuth server (needs a test-only dep or a ~100-line in-repo mock)? | H AT-02 | **Resolved:** in-repo mock OAuth server in CI; real GitHub sign-in is a manual check recorded in PROGRESS.md. |
| Q5 | Diagnostic skipping: B.2 Week 0 says it "may skip weeks 1–3 only"; AT-10 says "skips a week only if that week's gate tests are passed". Limit skipping to W1–W3? | B W0, AT-10 | **Resolved:** the diagnostic may only skip W1–W3. |
| Q6 | Who may score rubrics that count toward a pass? With a single user and no reviewer, `self` scores would let the learner pass their own exams. | G §7 pass rule, C.2, B.0.6 | **Resolved:** self-scores allowed, labelled "self-assessed"; `ai_suggested` never counts; hiring evidence counts only `reviewer`/`auto`. |
| Q7 | Progressive disclosure: E.2 says Research/Open Source unlock "after gate W8/W12" — which gate unlocks which? And is the paper library (in v1) locked? | E.2 | **Resolved:** Research unlocks at the W8 exam, Open Source at the W12 exam; paper library never locked. |
| Q8 | "No AI code" weeks in ACC mode: G says "weeks 1–12 RI". ACC weeks 1–8 cover RI W1–W12. | G §6.1 | Rule keyed to RI week content ids, so ACC weeks 1–8 |
| Q9 | Pull source verification (arXiv + URL + GitHub repo) into v1 to avoid R-02? | H.1 v1 scope | **Resolved:** source verification is in v1 (P3-core). |
| Q10 | "Promoting" an unverified hypothesis (AT-25): promoted to what? | F.3, AT-25 | Promotion = attaching it as a project hypothesis or changing its classification; both require a novelty log |
| Q11 | User timezone for "today" (FSRS, daily caps, streaks) | — | Setting, default `America/Toronto` (SOURCES header) |
| Q12 | How much lesson MDX content do I write in P1? The spec defines weeks but not lesson text. | B.2 | P1 ships the pipeline + W1–W3 lessons + cards; later weeks are stubs listing objectives and verified resources only |
| Q13 | `/reports/render` Markdown → PDF needs a renderer not in G §1 (e.g. WeasyPrint has system deps; or headless Chromium). Which, or Markdown-only in v1? | G §4 | **Resolved:** Markdown/HTML reports only in v1; no PDF. |
| Q14 | JSON Schema → Zod/Pydantic: hand-written + cross-tested, or a generator (new dep)? Either way, "tested on both sides" needs a JSON Schema validator in TS tests (e.g. Ajv) and Python tests (e.g. `jsonschema`); neither is in G §1. | G §1 contracts | **Resolved:** hand-written Zod/Pydantic; Ajv and `jsonschema` approved as dev-only deps. |
| Q15 | `/healthz` path on web: `/healthz` or `/api/healthz`? | G §1 | Both (rewrite) |
| Q16 | Account delete: revoking the GitHub grant is a `DELETE` to GitHub — conflicts with GET-only (AT-27). Allow that one call, or tell the user to revoke manually? | AT-27, G §8 delete | **Resolved:** never call DELETE on GitHub; account delete shows a link and steps to revoke the grant by hand. |
| Q17 | Sample data: which pages get seeded mock data? Rule 5 ("only where a live integration is unavailable") vs rule 6 ("never fake a connection"). | G §0.5–0.6 | Mock runs/projects only (lab + analytics demo), toggle-gated, off in production; GitHub/mentor show "not configured", never mock |
| Q18 | Reviewer role: is an invite flow needed in v1? | C.2 | No; role exists in schema, invite flow P6 |
| Q19 | Fonts (Source Serif 4, Inter, JetBrains Mono): E.1 marks licences UNVERIFIED. Verify OFL before shipping; self-host via `next/font`. | E.1 | Builder verifies licence files at install and records in PROGRESS.md |
| Q20 | Large raw benchmark data "goes to files" — local volume path, retention? | G §3 run_samples | Volume `raw-data`, gzip JSON per run, deleted with project/account |
| ● Q21 | Production hostname for `SANDBOX_ORIGIN`: a subdomain (`sandbox.<app-domain>`) or a separate registrable domain? Both are cross-origin and receive no cookies (host-only cookies); a separate domain is also cross-*site*, which is stricter for future browser features but costs a second domain. | D-14 | Subdomain; no new cost. Needed before the first VM deploy, not before P0 |
| ● Q22 | Your GitHub **numeric** user id for `ALLOWED_GITHUB_USER_ID` (a login can be renamed and re-registered by someone else, an id can't). I can read it from the public `GET https://api.github.com/users/<login>` if you confirm the login is `harisonharold`. | X-01 | Builder looks it up at P0 start after you confirm the login |
| Q23 | Consequence of D-15 for the diagnostic: skipping W1–W3 needs counting evidence, so the code parts of a skip must run through atlas-lab (installed during the diagnostic), not only in the browser. OK? | Q5 + D-15 | Yes; browser-only diagnostic results still shape the skill map but never skip a week |
| Q24 | Refreshing a GitHub user-to-server token is also a `POST` to `https://github.com/login/oauth/access_token` (`grant_type=refresh_token`). I treat "the OAuth token exchange" as covering both code exchange and refresh at that one endpoint, both in `modules/auth`. OK? | AT-27 reworded | Yes |

---

## 9. Decisions

| ID | Decision | Status |
|---|---|---|
| D-01 | Stack exactly as G §1; no additions without approval | Fixed by spec |
| D-02 | BullMQ (Node + Python). **Spike result: NOT RUN YET** (P0 task 10). Fallback RQ in worker-py | Pending spike |
| D-03 | Container set: dev = web, worker-node, api-py, worker-py, mysql, redis, jaeger; prod = same minus jaeger plus caddy (Caddy counts toward the 7) | **Approved** (Q2) |
| D-04 | One GitHub App for sign-in + read-only data | **Approved** (Q3) |
| D-05 | Better Auth via its Drizzle adapter (provider `mysql`) so Drizzle owns all migrations, instead of Better Auth's own CLI migrator. G §3 says tables are "generated by its CLI": its CLI's schema generator outputs the Drizzle schema, which we commit | Approved with plan |
| D-06 | Difficulty estimator and classification rules are deterministic code, never an LLM (removes a prompt-injection path) | Approved with plan |
| D-07 | Mentor provider adapter: `none` + `anthropic`; default model = cheapest configured, seeded `claude-haiku-5-5` at $0.10 in / $0.50 out per MTok for prompts ≤ 100k tokens (SOURCES §6, estimate read 2026-11-16; above 100k a higher rate applies, so cap prompt size at 100k). Uses the official TS SDK in worker-node (new dep `@anthropic-ai/sdk`, **still needs approval at P5**) | Proposed |
| D-08 | **Revised:** sign-up/sign-in allowed for exactly one GitHub account, identified by immutable numeric id `ALLOWED_GITHUB_USER_ID` (not login). Rejected attempts write no user/account/session rows. Fails closed if unset | **Approved** (required fix) |
| D-09 | **Superseded by D-14** | — |
| D-10 | User-authored text (notes, plans, reports) rendered as sanitised Markdown, never compiled as MDX; MDX only for repo content | Approved with plan |
| D-11 | Schema changes vs G §3 as listed in `docs/DATA_MODEL.md` §9 | Approved with plan |
| D-12 | Report text is template-generated; no LLM writes performance claims | Approved with plan |
| D-13 | New module `modules/auth` (seventh module, beside G §2's six) owns Better Auth, the allowlist and the single allowed GitHub POST, so the GitHub *data* module can be GET-only by construction | **Approved** (follows reworded AT-27) |
| D-14 | Pyodide runs only on `SANDBOX_ORIGIN`, a different host from `APP_ORIGIN`, served as static files with no cookies and no `/api`; iframe sandboxed; results via origin-checked `postMessage`. Never on the app origin | **Approved** (required fix) |
| D-15 | Browser results are **"practice checks"**: stored as `attempts.status = practice`, never counted. Gates count only server-side evidence (server-graded answers, GitHub-API-verified commits/CI, reviewer scores, server-revalidated uploads) or atlas-lab evidence | **Approved** (required fix) |
| D-16 | Internal HMAC carries timestamp + nonce; reject if older than 5 minutes (or > 5 min in the future) or if the nonce was already seen (Redis `SET NX EX 600`); Redis errors fail closed. Applies to web→api-py and worker-py→web | **Approved** (required fix) |
| D-17 | All server-side outbound fetches of user- or seed-supplied URLs go through `safeFetch`: http/https only, ports 80/443 only, DNS resolved and every address checked against the blocklist (private, loopback, link-local, CGNAT, multicast, reserved, IPv4-mapped/NAT64 forms, the pinned Compose subnet, Compose service names), connect to the validated IP, re-check on every redirect (max 3), 5 s connect / 10 s total timeout, 2 MB streamed body cap, no credentials or cookies sent | **Approved** (required fix) |
| D-18 | AT-27 reworded: "GitHub data module sends only GET; the OAuth token exchange is the single allowed POST, in the auth module" (refresh covered per Q24) | **Approved** |
| D-19 | Account delete makes no GitHub call; it shows a link and steps to revoke the GitHub App authorization by hand. The link target is stored as a `sources` row (kind `doc`) and re-verified by the job like any other fact — the exact GitHub settings/docs URL is **UNVERIFIED** until the builder checks it at P0 | **Approved** (Q16) |
| D-20 | Reports are Markdown + HTML only in v1; `/reports/render` renders Markdown → sanitised HTML (no PDF) | **Approved** (Q13) |
| D-21 | Ajv (TS) and `jsonschema` (Python) added as dev-only dependencies for contract tests | **Approved** (Q14) |
| D-22 | OWASP Top 10 / LLM Top 10 mappings stay marked UNVERIFIED until checked against the live pages before P7 (X-15) | **Approved** |

---

## 10. Out of scope for v1

- P3 dossiers, classification and novelty log (P3-core verification + paper library *are* in v1), P4–P7 features.
- Semantic/vector search (G §1).
- Any write to GitHub, LinkedIn or any external service; no auto-PR, no comments, no posting — permanently, not just v1.
- Launching or controlling paid compute (G §6.8); provider APIs for GPU rental (FR-16 is docs only).
- Running user code on the server; CUDA in the browser.
- Multi-tenant hosting, billing, org accounts.
- Real-time collaboration; reviewer invite flow (Q18).
- PDF reports (Q13: Markdown/HTML only).
- Mobile apps; offline writes (offline is read-only).
- Rust track content (RI-only optional).

---

## 11. Security review of spec choices — status after revision 2

Evidence in `THREAT_MODEL.md` §8. Items 1–7 were required fixes in the approval; each now has a decision and a test.

| # | Gap | Resolution | Test |
|---|---|---|---|
| 1 | SSRF in `POST /api/sources/verify` | D-17 `safeFetch` | X-04 |
| 2 | Pyodide on the app origin | D-14 separate sandbox origin, no cookies | X-05 |
| 3 | Browser "hidden tests" can't be hidden | D-15 "practice checks"; counting evidence server-side or atlas-lab only | X-13, AT-08 (reworded) |
| 4 | AT-27 GET-only vs OAuth POST and delete | D-18 reworded AT-27, D-13 auth module, D-19 no DELETE | AT-27, X-14 |
| 5 | HMAC replay | D-16 timestamp + Redis nonce, 5 min | X-10 |
| 6 | Open sign-up | D-08 single numeric-id allowlist | X-01 |
| 7 | OWASP lists from memory | D-22 UNVERIFIED until live check | X-15 |
| 8 | `/api/internal/*` on the public app | Caddy 404 + HMAC | X-02 |
| 9 | Self-scored exams | Q6 rules | X-11 |
| 10 | Pattern-only bundle scan | Canary values + patterns | AT-03 |
| 11 | Jaeger UI / Redis unauthenticated | Jaeger dev-only; Redis password, no published port | Compose config test |
| 12 | `sources.url` 255-char prefix unique | `url_hash` | DATA_MODEL §9 #5 |
