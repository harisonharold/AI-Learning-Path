# PLAN.md — Systems Atlas

Status: **DRAFT, awaiting Harison's approval.** No application code, installs or scaffolding exist yet, and none will be written until this plan, `THREAT_MODEL.md` and `docs/DATA_MODEL.md` are approved.

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
 Browser ──HTTPS──▶ [caddy]* ──▶ [web: Next.js 16]                                                       │
   │  Pyodide in a        │       ├─ app/(app)  17 pages (RSC)       ├─ Better Auth (GitHub)             │
   │  sandboxed iframe    │       ├─ app/(public) /p/:handle         ├─ modules/* (domain logic)         │
   │  (opaque origin)     │       ├─ app/api/* thin route handlers   └─ Drizzle ──▶ [mysql 8.4]  ◀─ ONLY │
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

Network zones (Compose networks): `edge` (caddy↔web), `internal` (web, workers, api-py, redis, mysql — no published ports in prod). `api-py`, `redis`, `mysql`, `jaeger` never publish ports in the production overlay. `/api/internal/*` is blocked at Caddy (THREAT_MODEL T-W5).

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
| `platform` | profiles, user_roles, user_settings, ai_credentials, runner_tokens, jobs, audit_log | `requireUser`, `authorize(user, resource)`, `encrypt/decrypt`, `enqueue`, `audit`, `verifyHmac` |
| `learning` | skills, skill_edges, weeks, gates, attempts, attempt_evidence, rubric_scores, remediation_plans, cards, card_reviews, time_logs, diagnostic_sessions, exercises | `getRoadmap`, `submitAttempt`, `gateState`, `reviewCard`, `todayPlan`, `learningMeter` |
| `research` | sources, papers, dossiers, dossier_evidence, novelty_checks, projects, run_configs, runs, run_metrics, run_samples | `ingestRun`, `compareRuns`, `canGenerateReport`, `verifySource`, `classifyDossier`, `searchPapers` |
| `github` | gh_installations, gh_repos, gh_issues, contributions | `syncRepo`, `estimateDifficulty`, `prDraftText`, `contributionEvidence` |
| `mentor` | mentor_threads, mentor_messages, ai_budgets, ai_spend_ledger, price_table, weaknesses, interview_sessions | `sendMessage`, `reserveBudget`, `confidenceFor`, `applyOutputPolicy` |
| `portfolio` | portfolio_items, writing_drafts | `publish`, `qualityCheck`, `validateBullets`, `meters` (aggregates via other services) |

Enforcement: `eslint-plugin-boundaries` (listed in G §1) with the rules above, plus a dependency-cruiser-free fallback script `scripts/check-imports.mjs` only if the plugin can't express a rule (would need approval — it's not a new dep, just a script). The "no GitHub write" rule is also enforced structurally: the only HTTP client the `github` module can import is `modules/github/internal/gh-client.ts`, whose type exposes `get()` only (AT-27).

Cross-language contracts live in `packages/contracts/*.schema.json` (benchmark upload, job payloads, HMAC envelope). TS types generated with `json-schema-to-zod`-style code **or** hand-written Zod tested against the JSON Schema — choice is Q14 (a generator would be a new dep).

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
| `GET /api/export`, `DELETE /api/account` | session + re-auth | platform | |
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
| 6 | Coding exercises | `/lab/exercises/[id]` | P1 (Pyodide), P2 (runner) | per-week gate | runner-pending |
| 7 | Systems architecture lab | `/lab/systems` | P7 | advanced tab: gate (Q7) | "simulation, not a real system" |
| 8 | Research discovery | `/research` | P3 | Q7 (peek allowed) | stale evidence |
| 9 | Research project workspace | `/research/projects/[id]` | P2 | — | report-blocked reasons |
| 10 | Paper library | `/research/papers` | P3 (in v1) | — | unverified entry |
| 11 | Benchmark analytics | `/analytics/benchmarks` | P2 | — | api-py degraded banner |
| 12 | GitHub contribution tracker | `/open-source` | P4 | Q7 (peek allowed) | not configured; rate-limited (cached) |
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
| 08 | P1 | `tests/e2e/pyodide-exercise.spec.ts` (asserts no request body contains code) | E | server never executes code |
| 09 | P1 | `apps/web/modules/learning/tests/fsrs.test.ts` | U | |
| 10 | P1 | `apps/web/modules/learning/tests/diagnostic-skip.test.ts` | U | skip only on passed gate |
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
| 22 | P3 (v1, Q9) | `apps/worker-node/tests/verify-arxiv.test.ts` (recorded fixture) + nightly live job | U/S | no invented facts |
| 23 | P3 (v1, Q9) | `apps/worker-node/tests/verify-url-captcha.test.ts` | U | captcha ≠ verified |
| 24 | P3 | `apps/web/modules/research/tests/classification.test.ts` | U | dated evidence |
| 25 | P3 | same + `infra/ci/forbidden-strings.mjs` ("novel") | U/S | no "novel" |
| 26 | P3 (v1) | `apps/web/tests/int/papers-fulltext.test.ts` | I | |
| 27 | P4 | `apps/web/modules/github/tests/get-only.test.ts` + `infra/github-app/manifest.test.ts` | U/S | read-only by capability |
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
| X-01 | P0 | Sign-in rejected for GitHub logins not in `ALLOWED_GITHUB_LOGINS` | THREAT T-A1 |
| X-02 | P0 | `INTERNAL_*` routes return 404 through Caddy config test | T-W5 |
| X-03 | P0 | Log/trace redaction test: secrets/AI keys never appear in JSON logs or OTel attributes | G §0.8 "never in logs" |
| X-04 | P3 | SSRF guard rejects private IPs, `localhost`, metadata IP, redirects into private space, non-80/443 ports | T-V1 |
| X-05 | P1 | Pyodide iframe has opaque origin; a `fetch('/api/me')` from user code fails | T-B3 |
| X-06 | P1 | Reference solutions and hidden-test answer keys are absent from `.next/static` until gate passed (bundle grep for solution canaries) | T-L2 |
| X-07 | P5 | Mentor context builder excludes solution text before gate pass (asserts prompt contents) | LLM solution leakage |
| X-08 | P5 | Concurrent mentor calls cannot overspend (reservation ledger race test) | cost exhaustion |
| X-09 | P6 | Portfolio refuses items from `publish_restricted` course labs (6.5840, BusTub) | course policy (B W8/W9) |
| X-10 | P2 | HMAC replay: same signed body twice → second 401; stale timestamp (> 5 min) → 401 | T-W4 |
| X-11 | all | Rubric scores from `ai_suggested` never count toward a pass; `self` counts only per Q6 decision | learning integrity |
| X-12 | P4 | GitHub fetched text rendered as escaped text (XSS fixture in issue title/body) | T-G3 |

### Phase scopes (deliverables; acceptance per table above)

- **P0 Groundwork** — pnpm workspace + uv workspace; Compose (web, worker-node, api-py, worker-py, mysql, redis, jaeger) + prod overlay (caddy replaces jaeger); Zod env loader per service (Pydantic Settings for Python) failing fast; GitHub Actions (lint, typecheck, unit, int, e2e, axe, bundle scan, forbidden strings); Drizzle schema for **all** tables in `docs/DATA_MODEL.md` + first migration (so later phases add columns, not tables, where possible); Better Auth + GitHub sign-in + allowlist; design-system shell (tokens, light/dark, left rail, palette, shortcut sheet, `<PageState>`); `/healthz` everywhere; BullMQ-Python spike (D-02); HMAC envelope in `packages/contracts`.
- **P1 Learning core** — content pipeline (`content/curriculum.yaml`, `sources.yaml`, MDX lessons for W1–W3 at minimum, Q12), skills graph + roadmap (graph/timeline/list), lesson viewer, Pyodide exercises in sandboxed iframe, gates/attempts/evidence/rubrics, remediation, FSRS + daily quiz, daily workspace + timer/time logs, diagnostic (W1–W3 gates, Q5), learning meter.
- **P2 Lab** — projects with pre-registration, configs, runs upload (session + runner), contracts, atlas-lab CLI (login, run `--dry-run/--repeat/--gpu-rate/--max-hours`, upload, env capture, auto-shutdown script, timeout, notebook export/import), api-py stats (percentiles, bootstrap CI, Mann-Whitney U), analytics page (CDF, histogram, box, p50/95/99 + CI table, throughput, memory, GPU timeline, config/env diff with confounder warnings, data-table + text summary per chart), report generator (Markdown; PDF per Q13), mock banner + `sample data` toggle.
- **P3 Research engine** — verification jobs (arXiv, GitHub REST, URL+title, price, job board), paper library (FULLTEXT), 13 seed dossiers + evidence sources, classification rules, novelty-check log, nightly re-verification, stale warnings. **Recommendation (Q9): pull the verification job + paper library into v1**, see Risk R-02.
- **P4 GitHub workspace** — GitHub App manifest (read-only), installation + user-to-server token refresh, repo explorer (16 targets + archived/source-available labels), issue sync (ETag, rate-limit backoff, timeline-based linked PRs), difficulty estimator with reasons, checklist + copyable PR text, PR tracker, merged-PR → evidence.
- **P5 Mentor + interviews** — provider adapter (`none`, `anthropic`), encrypted write-only key, price table + pre-call estimate + reservation ledger + caps, 7 modes, Socratic-first + hint ladder, server-side withholding + code-length filter, citation-derived confidence, weakness tracking, interview simulator (coding via exercise engine, system design whiteboard + rubric, defend-your-project with local recording).
- **P6 Portfolio + career** — builder (verified only, restricted-lab block), public pages, repo quality checks (GET-only), evidence-linked writing helpers, all 4 meters with formulas, conference/community list with sources.
- **P7 Hardening** — systems lab canvas + `/sim/schedule` (M/M/1 validation), manual screen-reader pass, Lighthouse budget, backup/restore scripts + test, deploy docs (local, VM + Caddy), easter eggs.

**v1 = P0 + P1 + P2 + paper library** (+ verification job if Q9 = yes).

---

## 6. First P0 task list for the builder agent (after approval only)

Each task ends with its own test; the phase is not done until all P0 ATs pass.

1. Root: `pnpm-workspace.yaml`, `package.json` scripts (`lint`, `typecheck`, `test`, `test:int`, `test:e2e`, `test:a11y`, `scan:bundle`, `check:strings`), `.nvmrc`, `.editorconfig`, `.gitignore`, uv workspace `pyproject.toml`. Pin current stable versions found at install time; record them in `PROGRESS.md`.
2. `infra/compose/compose.yaml` (7 services, healthchecks, `internal` network, named volumes `mysql-data`, `raw-data`), `compose.prod.yaml` (caddy, no jaeger, no published internal ports), `infra/mysql/my.cnf` (`innodb_ft_min_token_size=2`, utf8mb4, see DATA_MODEL §7).
3. Env loaders: `apps/web/env.ts` (Zod, server-only module guarded by `import 'server-only'`), worker-node, api-py/worker-py (Pydantic Settings). `.env.example` with **no** real values. Test: missing var → process exits non-zero with the var name.
4. `apps/web` Next.js 16 App Router, TS strict, Tailwind v4, shadcn/ui init; `packages/ui` tokens (colours from E.1, both themes, contrast-checked), `<PageState>`, `<Badge kind=verified|self|ai|mock|stale>` (icon + text).
5. Drizzle schema for every table in `docs/DATA_MODEL.md`; `drizzle-kit generate`; migration runner on container start; Better Auth tables via its Drizzle schema generation (D-05).
6. Better Auth + GitHub provider, allowlist hook, `/setup` "configure GitHub login" page when `GITHUB_CLIENT_ID` absent; `GET /api/me`.
7. `modules/platform`: error shape, `requireUser`, `authorize`, route manifest export, audit log, AES-256-GCM helper (key id + AAD), HMAC sign/verify (timestamp + nonce in Redis, 5-min window).
8. App shell: left rail (E.2 order), command palette (navigation), shortcut sheet, theme toggle, skip link, focus ring, offline indicator.
9. `/healthz` on web, worker-node (tiny HTTP), api-py, worker-py; Compose healthchecks; `compose-smoke.sh` (AT-01).
10. **BullMQ-Python spike** (`spikes/bullmq-py/`): Node enqueues `stats.echo` → Python `bullmq` worker processes → HMAC POST to web callback → web writes `jobs.result_json`. Verify: retries, failure → `failed` state, graceful shutdown, job removal policy, version compatibility of BullMQ Node vs Python on the same Redis. Record result in §9 Decisions. On failure: RQ inside worker-py with web polling/HMAC callback (fallback already named in G §1).
11. CI workflow `.github/workflows/ci.yml`: lint, typecheck, unit, integration (Testcontainers), e2e (Playwright `--trace off`), axe, bundle scan (build with canary secret values), forbidden-strings, ruff, pyright, pytest.
12. Tests for AT-01..AT-05, X-01..X-03, X-10. Update `TASKS.md`, `PROGRESS.md`, `README.md` (run instructions + budget tiers from C.9 with "estimate, read on 2026-11-16").

---

## 7. Risks

| ID | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| R-01 | BullMQ Python lags Node features/versions → queue incompatibility | M / M | P0 spike; RQ fallback; pin both; contract test on job payloads |
| R-02 | Seed sources verified 2026-11-16 go stale on 2026-12-16; verification job is P3 but v1 = P0–P2 + papers → v1 shows stale warnings everywhere within a month | H / M | Pull verification job into v1 (Q9) |
| R-03 | Browser-run tests (Pyodide) are self-reported — learner can forge a pass | H / M (single-user self-deception) | Label browser attempts `self-run`; exam gates require runner/commit-SHA or reviewer evidence (Q6); see THREAT T-L1 |
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

## 8. Open Questions (blocking items marked ●)

| # | Question | Spec reference | My proposed default |
|---|---|---|---|
| Q1 | Is `G_master_prompt.md` the `MASTER_PROMPT.md` named in G_fable_prompt? | G_fable header | Yes; keep both files |
| ● Q2 | Container count: G says "at most ~7", Fable says "≤ 7", C NFR-7 says "< 10". Does Caddy count? | G §0.11, C NFR-7 | Dev 7 (with Jaeger), prod 7 (Caddy instead of Jaeger; traces go to an OTLP endpoint only if configured) |
| ● Q3 | One GitHub App for both sign-in and data (fewer secrets), or a separate OAuth app for sign-in as D.1 says? | D.1 vs G §1 | One GitHub App (its user-authorization flow works as an OAuth provider for Better Auth); reduces credentials to one client id/secret + one private key |
| ● Q4 | AT-02 "given GitHub OAuth test credentials": real GitHub in CI is not possible. OK to test sign-in against a local mock OAuth server (needs a test-only dep or a ~100-line in-repo mock)? | H AT-02 | In-repo mock OAuth server (no new dep); real sign-in = manual check |
| ● Q5 | Diagnostic skipping: B.2 Week 0 says it "may skip weeks 1–3 only"; AT-10 says "skips a week only if that week's gate tests are passed". Limit skipping to W1–W3? | B W0, AT-10 | Yes, W1–W3 only in v1 |
| ● Q6 | Who may score rubrics that count toward a pass? With a single user and no reviewer, `self` scores would let the learner pass their own exams. | G §7 pass rule, C.2, B.0.6 | Non-exam gates: `self` allowed, labelled "self-assessed". Exams: objective part must be `auto`; rubric part may be `self` but the gate shows "self-assessed" and the hiring checklist counts only `reviewer`/`auto`. `ai_suggested` never counts. |
| ● Q7 | Progressive disclosure: E.2 says Research/Open Source unlock "after gate W8/W12" — which gate unlocks which? And is the paper library (in v1) locked? | E.2 | Research → W8 exam; Open Source → W12 exam; paper library never locked |
| Q8 | "No AI code" weeks in ACC mode: G says "weeks 1–12 RI". ACC weeks 1–8 cover RI W1–W12. | G §6.1 | Rule keyed to RI week content ids, so ACC weeks 1–8 |
| ● Q9 | Pull source verification (arXiv + URL + GitHub repo) into v1 to avoid R-02? | H.1 v1 scope | Yes |
| Q10 | "Promoting" an unverified hypothesis (AT-25): promoted to what? | F.3, AT-25 | Promotion = attaching it as a project hypothesis or changing its classification; both require a novelty log |
| Q11 | User timezone for "today" (FSRS, daily caps, streaks) | — | Setting, default `America/Toronto` (SOURCES header) |
| Q12 | How much lesson MDX content do I write in P1? The spec defines weeks but not lesson text. | B.2 | P1 ships the pipeline + W1–W3 lessons + cards; later weeks are stubs listing objectives and verified resources only |
| ● Q13 | `/reports/render` Markdown → PDF needs a renderer not in G §1 (e.g. WeasyPrint has system deps; or headless Chromium). Which, or Markdown-only in v1? | G §4 | Markdown + HTML in v1; PDF deferred (would be a new dep) |
| Q14 | JSON Schema → Zod/Pydantic: hand-written + cross-tested, or a generator (new dep)? Either way, "tested on both sides" needs a JSON Schema validator in TS tests (e.g. Ajv) and Python tests (e.g. `jsonschema`); neither is in G §1. | G §1 contracts | Hand-written Zod + Pydantic models; approve Ajv (dev-only) and `jsonschema` (dev-only) to validate shared fixtures against the schema on both sides |
| Q15 | `/healthz` path on web: `/healthz` or `/api/healthz`? | G §1 | Both (rewrite) |
| Q16 | Account delete: revoking the GitHub grant is a `DELETE` to GitHub — conflicts with GET-only (AT-27). Allow that one call, or tell the user to revoke manually? | AT-27, G §8 delete | Manual: show the GitHub settings link; keep the module GET-only |
| Q17 | Sample data: which pages get seeded mock data? Rule 5 ("only where a live integration is unavailable") vs rule 6 ("never fake a connection"). | G §0.5–0.6 | Mock runs/projects only (lab + analytics demo), toggle-gated, off in production; GitHub/mentor show "not configured", never mock |
| Q18 | Reviewer role: is an invite flow needed in v1? | C.2 | No; role exists in schema, invite flow P6 |
| Q19 | Fonts (Source Serif 4, Inter, JetBrains Mono): E.1 marks licences UNVERIFIED. Verify OFL before shipping; self-host via `next/font`. | E.1 | Builder verifies licence files at install and records in PROGRESS.md |
| Q20 | Large raw benchmark data "goes to files" — local volume path, retention? | G §3 run_samples | Volume `raw-data`, gzip JSON per run, deleted with project/account |

---

## 9. Decisions

| ID | Decision | Status |
|---|---|---|
| D-01 | Stack exactly as G §1; no additions without approval | Fixed by spec |
| D-02 | BullMQ (Node + Python). **Spike result: NOT RUN YET** (P0 task 10). Fallback RQ in worker-py | Pending spike |
| D-03 | Container set: dev = web, worker-node, api-py, worker-py, mysql, redis, jaeger; prod = same minus jaeger plus caddy | Proposed (Q2) |
| D-04 | One GitHub App for sign-in + read-only data | Proposed (Q3) |
| D-05 | Better Auth via its Drizzle adapter (provider `mysql`) so Drizzle owns all migrations, instead of Better Auth's own CLI migrator. G §3 says tables are "generated by its CLI": its CLI's schema generator outputs the Drizzle schema, which we commit | Proposed |
| D-06 | Difficulty estimator and classification rules are deterministic code, never an LLM (removes a prompt-injection path) | Proposed |
| D-07 | Mentor provider adapter: `none` + `anthropic`; default model = cheapest configured, seeded `claude-haiku-5-5` at $0.10 in / $0.50 out per MTok for prompts ≤ 100k tokens (SOURCES §6, estimate read 2026-11-16; above 100k a higher rate applies, so cap prompt size at 100k). Uses the official TS SDK in worker-node (new dep `@anthropic-ai/sdk`, needs approval at P5) | Proposed |
| D-08 | Sign-in restricted to `ALLOWED_GITHUB_LOGINS` (single-user product on a public VM) | Proposed |
| D-09 | Pyodide runs in a sandboxed iframe (`sandbox="allow-scripts"`, no `allow-same-origin`), assets self-hosted | Proposed |
| D-10 | User-authored text (notes, plans, reports) rendered as sanitised Markdown, never compiled as MDX; MDX only for repo content | Proposed |
| D-11 | Schema changes vs G §3 as listed in `docs/DATA_MODEL.md` §9 | Proposed |
| D-12 | Report text is template-generated; no LLM writes performance claims | Proposed |

---

## 10. Out of scope for v1

- P3 dossier workspace/classification UI (except paper library and, if Q9, verification), P4–P7 features.
- Semantic/vector search (G §1).
- Any write to GitHub, LinkedIn or any external service; no auto-PR, no comments, no posting — permanently, not just v1.
- Launching or controlling paid compute (G §6.8); provider APIs for GPU rental (FR-16 is docs only).
- Running user code on the server; CUDA in the browser.
- Multi-tenant hosting, billing, org accounts.
- Real-time collaboration; reviewer invite flow (Q18).
- PDF reports (Q13), unless approved.
- Mobile apps; offline writes (offline is read-only).
- Rust track content (RI-only optional).

---

## 11. Security review of spec choices (flagged, not silently changed)

See `THREAT_MODEL.md` §8 for evidence and proposed fixes. Summary:

1. **SSRF is unaddressed**: `POST /api/sources/verify {url}` makes the server fetch arbitrary URLs (internal Redis/MySQL/api-py, cloud metadata). Needs a guard (X-04).
2. **Pyodide on the app origin** would let pasted code call `/api/*` with the session cookie. Needs an opaque-origin iframe (X-05).
3. **"Hidden tests" for browser exercises cannot be hidden**; browser attempts are self-reported (R-03, Q6).
4. **AT-27 "only GET requests"** is incompatible with OAuth token exchange/refresh (POST to `github.com/login/oauth/access_token`) and with grant revocation on delete. The assertion should be scoped to `api.github.com` (Q16).
5. **HMAC without timestamp/nonce** allows replay; spec says only "HMAC" (X-10).
6. **`/api/internal/*` lives on the public web app**; "internal network only" needs an explicit proxy block (X-02).
7. **Open sign-up**: Better Auth with GitHub lets any GitHub user create an account on a public VM; single-user product needs an allowlist (X-01).
8. **Self-scored rubrics** can satisfy the exam pass rule (Q6, X-11).
9. **Secret scan by pattern only** misses non-patterned secrets (e.g. `INTERNAL_HMAC_KEY`); build with canary values and grep for them too (AT-03).
10. **Jaeger UI and Redis** have no auth by default; must not be exposed on the VM.
11. **`sources.url` unique on a 255-char prefix** can reject distinct long URLs; use a hash (DATA_MODEL §9).
