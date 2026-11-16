# Part D - Technical Architecture

Versions are what the GitHub/npm/PyPI APIs reported on 2026-11-16 (SOURCES §5). Pin exact versions in lockfiles; do not trust these numbers past the date.

## D.1 Stack decisions (Harison's preferred stack kept; flags where research says otherwise)

| Layer | Choice | Status | Reason / flag |
|---|---|---|---|
| Web framework | Next.js 16 (App Router), React, TypeScript strict | **Kept** | Next.js v16.4.6 released 2026-11-09, MIT |
| Styling | Tailwind CSS v4 | **Kept** | v4.3.5, MIT |
| Components | shadcn/ui on Radix Primitives | Added | Both MIT; Radix is built for accessibility |
| Charts | Apache ECharts (benchmark analytics, large data) | Added | Apache-2.0; handles big histograms/CDFs. Recharts (MIT) is fine for small dashboard charts, but use one library to keep it simple: **ECharts only** |
| Diagrams | React Flow (xyflow) for interactive architecture diagrams; Mermaid for static diagrams in lessons | Added | Both MIT |
| Content | MDX + Shiki | Added | MIT |
| Code editor | Monaco | Added | MIT |
| In-browser Python | Pyodide | Added | MPL-2.0; CPU only, no GPU |
| Auth | **Better Auth** with GitHub social login | **Changed (flag)** | Auth.js README (read 2026-11-16): "Auth js is now part of Better Auth. We recommend new projects to start with Better Auth". Better Auth v1.7.25, MIT, has a MySQL adapter |
| GitHub data access | **GitHub App** (user-to-server tokens) for repo/issue/PR reads; plain GitHub OAuth only for sign-in | **Changed (flag)** | GitHub docs: "In general, GitHub Apps are preferred over OAuth apps" (fine-grained permissions vs broad scopes). Read-only permissions requested |
| Database | **MySQL 8.4 LTS** | **Kept, with a flag** | Works fine for this app. Research flags: (1) Aiven's free MySQL tier is retired (read 2026-11-16) while free Postgres tiers remain, so hosted-free is harder on MySQL; (2) MySQL's VECTOR type cannot be used as any key or index (manual, read 2026-11-16), so no semantic search in-DB. Postgres + pgvector would be slightly better for both. Not worth switching unless semantic paper search becomes core; use MySQL FULLTEXT for paper search |
| ORM / migrations | **Drizzle ORM + drizzle-kit** (TS owns the schema) | Chosen | Apache-2.0, SQL-first, MySQL supported, Better Auth adapter. Prisma 7 also supports MySQL; either is fine, pick one |
| Validation | Zod (TS), Pydantic (Python) | Added | MIT |
| Compute service | Python 3.12+ FastAPI | **Kept** | FastAPI 0.163.1, MIT. Stateless compute: stats, report generation, trace analysis, simulations |
| Queue | **BullMQ on Redis** (Node producers + Node worker; Python worker via `bullmq` PyPI package) | Chosen | One queue technology across both languages. `bullmq` Python 3.6.1 on PyPI. **Phase-0 spike required** to confirm Python feature parity; fallback: FastAPI owns its own RQ queue (BSD-2) |
| Cache | Redis 7 | **Kept** | Same instance as queue, separate key prefixes |
| Tests | Vitest, Playwright, @axe-core/playwright, pytest, Testcontainers | Added | MIT / Apache-2.0 / MPL-2.0 |
| Lint/types | ESLint + `tsc --noEmit`; ruff + pyright | Added | |
| Observability | OpenTelemetry JS + Python -> Jaeger (local) / Grafana Cloud free (hosted); Sentry free (optional) | Added | |
| Python tooling | uv | Added | Apache-2.0 |
| Local runner | `atlas-lab` (Python, Typer CLI) | Added | MIT |
| Spaced repetition | ts-fsrs | Added | MIT |

**Architecture: modular monolith.** One Next.js app owns UI, API, auth, DB writes. One FastAPI service does computation and never writes the main DB (single-writer rule). Two worker processes (Node BullMQ worker, Python BullMQ worker). Containers: `web`, `worker-node`, `api-py`, `worker-py`, `mysql`, `redis`, optional `jaeger`. That is 6-7 containers, one `docker compose up`.

```
Browser ──HTTPS──> Next.js (web)
                    ├─ /app pages (RSC)         ├─ Better Auth (GitHub login)
                    ├─ /api/* route handlers    ├─ Drizzle ──> MySQL (single writer)
                    ├─ enqueue ──> Redis/BullMQ ─┬─> worker-node (GitHub sync, mentor calls, reports)
                    │                            └─> worker-py   (stats, simulations, trace analysis)
                    └─ HMAC call ──> api-py (FastAPI, sync compute < 5 s)
worker-py ──HMAC callback──> web /api/internal/jobs/:id/result  (web writes DB)
atlas-lab CLI (laptop or GPU box) ──scoped token──> web /api/runner/*
```

## D.2 Repository structure

```
systems-atlas/
├─ apps/
│  ├─ web/                    # Next.js app (UI + API + auth)
│  │  ├─ app/(public)/        # portfolio pages
│  │  ├─ app/(app)/           # authenticated pages (17 pages, Part E)
│  │  ├─ app/api/             # route handlers (thin; call modules)
│  │  ├─ modules/             # domain modules = monolith boundaries
│  │  │  ├─ learning/  (curriculum, gates, attempts, fsrs)
│  │  │  ├─ research/  (dossiers, sources, papers, projects, runs)
│  │  │  ├─ github/    (app install, sync, issues, prs, difficulty)
│  │  │  ├─ mentor/    (providers, policies, budgets)
│  │  │  ├─ portfolio/ (publishing, checks, writing helpers)
│  │  │  └─ platform/  (auth, audit, settings, crypto, jobs)
│  │  ├─ db/schema/*.ts       # Drizzle schema (source of truth)
│  │  └─ db/migrations/
│  └─ worker-node/
├─ services/
│  ├─ api-py/                 # FastAPI: stats, reports, traces, sim
│  └─ worker-py/
├─ packages/
│  ├─ contracts/              # JSON Schemas shared TS<->Py (benchmark upload, job payloads)
│  └─ ui/                     # design system components
├─ cli/atlas-lab/             # local runner
├─ content/                   # MDX lessons, exams, rubrics, sources.yaml
├─ infra/compose/  infra/scripts/ (backup, restore, gpu-shutdown)
├─ tests/e2e/  tests/a11y/
├─ PLAN.md  THREAT_MODEL.md  TASKS.md  PROGRESS.md  README.md
```

Rule: route handlers may only call `modules/*/service.ts`; modules talk to each other only through exported service functions (lint rule with `eslint-plugin-boundaries` or a simple import-path check script).

## D.3 Database schema (MySQL 8.4, InnoDB, utf8mb4; key tables)

Better Auth's own tables (`user`, `session`, `account`, `verification`) are generated by its CLI; the app tables below reference `user.id`.

```sql
-- curriculum (seeded from /content, versioned)
CREATE TABLE skills (id VARCHAR(64) PRIMARY KEY, name VARCHAR(200) NOT NULL, area VARCHAR(64) NOT NULL);
CREATE TABLE skill_edges (from_skill VARCHAR(64), to_skill VARCHAR(64), PRIMARY KEY(from_skill,to_skill));
CREATE TABLE weeks (id VARCHAR(32) PRIMARY KEY, mode ENUM('ACC','RI') NOT NULL, ordinal INT NOT NULL,
  title VARCHAR(200), hardware ENUM('CPU','GPU_FREE','GPU_RENT') NOT NULL, content_version VARCHAR(40) NOT NULL);
CREATE TABLE gates (id VARCHAR(64) PRIMARY KEY, week_id VARCHAR(32), kind ENUM('tests','exam','report','defense') NOT NULL,
  rubric_json JSON, required_evidence JSON, skill_ids JSON);
CREATE TABLE user_skill_state (user_id VARCHAR(36), skill_id VARCHAR(64),
  level ENUM('not_started','developing','competent','verified') NOT NULL DEFAULT 'not_started',
  updated_at DATETIME(3), PRIMARY KEY(user_id, skill_id));
CREATE TABLE attempts (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(36), gate_id VARCHAR(64),
  source ENUM('browser','runner','manual') NOT NULL, passed BOOLEAN, score DECIMAL(5,2),
  result_json JSON, evidence_url VARCHAR(500), commit_sha CHAR(40), created_at DATETIME(3),
  INDEX(user_id, gate_id, created_at));
CREATE TABLE rubric_scores (id BIGINT AUTO_INCREMENT PRIMARY KEY, attempt_id BIGINT, criterion VARCHAR(100),
  level ENUM('missing','partial','competent','strong'), scorer ENUM('self','reviewer','auto','ai_suggested'), note TEXT);
CREATE TABLE cards (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(36), skill_id VARCHAR(64),
  front TEXT, back TEXT, fsrs_state JSON, due_at DATETIME(3), INDEX(user_id, due_at));
CREATE TABLE time_logs (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(36), week_id VARCHAR(32),
  minutes INT, category VARCHAR(32), logged_on DATE);

-- sources & research
CREATE TABLE sources (id BIGINT AUTO_INCREMENT PRIMARY KEY, kind ENUM('paper','repo','course','doc','price','issue','job','blog'),
  url VARCHAR(700) NOT NULL, title VARCHAR(500), venue VARCHAR(200), year SMALLINT, external_id VARCHAR(100),
  licence VARCHAR(100), last_activity_at DATETIME, verification ENUM('verified','partial','unverified','broken') NOT NULL,
  verified_at DATETIME NOT NULL, verify_method VARCHAR(100), raw_json JSON, UNIQUE KEY(url(255)));
CREATE TABLE dossiers (id BIGINT AUTO_INCREMENT PRIMARY KEY, slug VARCHAR(100) UNIQUE, title VARCHAR(300),
  classification ENUM('documented_open_problem','engineering_opportunity','unverified_hypothesis','already_solved','beginner_contribution') NOT NULL,
  fields_json JSON NOT NULL,      -- the 20 dossier fields
  difficulty TINYINT, feasibility TINYINT, hardware ENUM('CPU','GPU_FREE','GPU_RENT','MULTI_GPU'),
  reviewed_at DATETIME NOT NULL);
CREATE TABLE dossier_evidence (dossier_id BIGINT, source_id BIGINT, claim TEXT, evidence_date DATE, PRIMARY KEY(dossier_id, source_id));
CREATE TABLE papers (id BIGINT AUTO_INCREMENT PRIMARY KEY, source_id BIGINT UNIQUE, abstract TEXT, authors_json JSON,
  user_notes MEDIUMTEXT, analysis_json JSON, FULLTEXT(abstract, user_notes));
CREATE TABLE projects (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(36), dossier_id BIGINT NULL, title VARCHAR(300),
  hypothesis TEXT, plan_md MEDIUMTEXT, status ENUM('draft','running','concluded','abandoned'), visibility ENUM('private','public') DEFAULT 'private');
CREATE TABLE run_configs (id BIGINT AUTO_INCREMENT PRIMARY KEY, project_id BIGINT, name VARCHAR(200), config_json JSON, config_hash CHAR(64), INDEX(project_id));
CREATE TABLE runs (id BIGINT AUTO_INCREMENT PRIMARY KEY, project_id BIGINT, config_id BIGINT, is_baseline BOOLEAN DEFAULT FALSE,
  env_json JSON NOT NULL,         -- cpu/gpu model, driver, cuda, libs, git sha, container digest
  status ENUM('ok','failed','invalid'), failure_note TEXT, started_at DATETIME(3), ended_at DATETIME(3),
  is_mock BOOLEAN NOT NULL DEFAULT FALSE, INDEX(project_id));
CREATE TABLE run_metrics (run_id BIGINT, metric VARCHAR(64), unit VARCHAR(16), summary_json JSON, -- p50/p95/p99/mean/ci
  raw_uri VARCHAR(500), PRIMARY KEY(run_id, metric));
CREATE TABLE run_samples (run_id BIGINT, metric VARCHAR(64), seq INT, value DOUBLE, t_ms BIGINT, PRIMARY KEY(run_id, metric, seq)); -- capped; large raw in files

-- github
CREATE TABLE gh_installations (id BIGINT PRIMARY KEY, user_id VARCHAR(36), token_enc VARBINARY(2048), token_expires_at DATETIME, refresh_enc VARBINARY(2048));
CREATE TABLE gh_repos (full_name VARCHAR(200) PRIMARY KEY, licence VARCHAR(100), pushed_at DATETIME, stars INT, archived BOOLEAN,
  contributing_url VARCHAR(500), cla_note VARCHAR(200), synced_at DATETIME);
CREATE TABLE gh_issues (repo VARCHAR(200), number INT, title VARCHAR(500), state VARCHAR(16), labels_json JSON, created_at DATETIME,
  updated_at DATETIME, comments INT, linked_prs_json JSON, difficulty_est TINYINT, difficulty_reasons JSON, synced_at DATETIME,
  PRIMARY KEY(repo, number));
CREATE TABLE contributions (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(36), repo VARCHAR(200), issue_number INT NULL,
  pr_number INT NULL, state ENUM('preparing','pr_opened_by_user','in_review','merged','closed'), checklist_json JSON,
  reviews_count INT, first_review_at DATETIME NULL, merged_at DATETIME NULL);

-- mentor, portfolio, platform
CREATE TABLE mentor_messages (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(36), thread_id VARCHAR(36), role ENUM('user','assistant'),
  mode VARCHAR(32), content MEDIUMTEXT, cited_source_ids JSON, confidence ENUM('high','medium','low') NULL,
  provider VARCHAR(40), model VARCHAR(80), input_tokens INT, output_tokens INT, cost_usd DECIMAL(10,5), created_at DATETIME(3));
CREATE TABLE ai_budgets (user_id VARCHAR(36) PRIMARY KEY, daily_usd DECIMAL(8,2), monthly_usd DECIMAL(8,2), spent_today DECIMAL(10,5), spent_month DECIMAL(10,5));
CREATE TABLE weaknesses (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(36), skill_id VARCHAR(64), observation TEXT, evidence_ref VARCHAR(300), created_at DATETIME);
CREATE TABLE portfolio_items (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(36), kind VARCHAR(32), ref_id BIGINT, slug VARCHAR(120),
  published BOOLEAN DEFAULT FALSE, checks_json JSON, published_at DATETIME NULL);
CREATE TABLE runner_tokens (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(36), token_hash CHAR(64), scopes JSON, expires_at DATETIME, revoked BOOLEAN DEFAULT FALSE);
CREATE TABLE jobs (id CHAR(36) PRIMARY KEY, kind VARCHAR(64), status ENUM('queued','running','done','failed'), payload_json JSON, result_json JSON, error TEXT, created_at DATETIME(3), finished_at DATETIME(3));
CREATE TABLE audit_log (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(36), action VARCHAR(100), target VARCHAR(300), meta_json JSON, created_at DATETIME(3));
```

Foreign keys are declared in the Drizzle schema (omitted above for brevity).

## D.4 API specification (Next.js route handlers; JSON; all require session unless noted)

Errors use one shape: `{ "error": { "code": "STRING", "message": "human text", "details": {...} } }` with proper HTTP status. All inputs validated by Zod; all list endpoints paginate with `?cursor=&limit=` (max 100).

| Method & path | Purpose |
|---|---|
| `GET /api/me` | Current user, roles, mode, hours plan |
| `POST /api/diagnostic/attempts` · `GET /api/diagnostic/result` | FR-1 |
| `GET /api/roadmap` | Skills graph + lock state |
| `GET /api/today` | Daily plan + due cards |
| `POST /api/cards/:id/review` `{rating:1-4}` | FSRS update |
| `GET /api/lessons/:slug` | Lesson + resources with verified_at |
| `POST /api/gates/:id/attempts` | Submit attempt (browser tests or manual evidence) |
| `POST /api/attempts/:id/rubric` | Self/reviewer rubric scores |
| `GET /api/analytics/meters` | Four meters with formulas + evidence ids |
| `GET /api/dossiers` · `GET /api/dossiers/:slug` | FR-10 |
| `POST /api/sources/verify` `{url|arxivId|repo}` | Enqueue verification job; returns job id |
| `GET/POST /api/papers` · `PATCH /api/papers/:id` | FR-11 |
| `GET/POST /api/projects` · `GET/PATCH /api/projects/:id` | FR-12 |
| `POST /api/projects/:id/runs` (upload JSON per `packages/contracts/benchmark.schema.json`) | FR-13 |
| `GET /api/runs/compare?ids=1,2,3` | Summary + CIs (computed by api-py) |
| `POST /api/projects/:id/report` | Enqueue report generation |
| `GET /api/github/repos` · `POST /api/github/sync` | FR-18 |
| `GET /api/github/issues?repo=` | FR-19 with difficulty + reasons |
| `GET/POST /api/contributions` · `PATCH /api/contributions/:id` | FR-20/21 (no write to GitHub exists) |
| `POST /api/mentor/messages` (SSE stream) | FR-22, budget-checked |
| `GET/PUT /api/settings` · `POST /api/settings/ai-key` (write-only; never returned) | FR-29 |
| `POST /api/runner/tokens` · `DELETE /api/runner/tokens/:id` | FR-14 token mgmt |
| `POST /api/runner/results` (runner token auth, scope `results:write`) | Runner upload |
| `GET /api/export` · `DELETE /api/account` | Export/delete |
| `POST /api/internal/jobs/:id/result` (HMAC, internal network only) | worker-py callback |
| `GET /p/:handle/*` (public, no auth) | Portfolio pages |

**FastAPI (`api-py`, internal only, HMAC-signed requests):** `POST /stats/summary` (percentiles + bootstrap CI), `POST /stats/compare` (Mann-Whitney U / bootstrap diff), `POST /traces/analyze` (OTLP JSON -> critical path, retry amplification), `POST /sim/schedule` (toy scheduler simulation for capstone), `POST /reports/render` (Markdown -> PDF), `GET /healthz`.

**Benchmark upload contract (excerpt):** `{ schema_version, project_id, config:{...}, config_hash, env:{cpu, gpu:[{name, memory_mb, driver, cuda}], os, python, libs:{}, git_sha, container_digest}, metrics:[{name, unit, samples:[...] | summary:{p50,p95,p99,mean,n}}], gpu_timeline:[{t_ms, util_pct, mem_mb, power_w?}], status, failure_note }`. Server recomputes summaries from samples; it does not trust client-side summaries when samples exist.

## D.5 Security (details go in THREAT_MODEL.md)

- Secrets only in server env / Docker secrets: `AUTH_SECRET`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_CLIENT_SECRET`, `TOKEN_ENC_KEY`, `INTERNAL_HMAC_KEY`, AI provider keys. **No secret ever in client bundles** (CI check: grep the built `.next/static` for key patterns; fail build).
- AI provider keys stored encrypted (AES-256-GCM, key from env), write-only API, masked in UI.
- GitHub App: read-only permissions (metadata, issues, pull requests, contents read). No write permission requested, so "no auto-PR" is enforced by capability, not just policy.
- Runner tokens: random 32 bytes, stored as SHA-256 hash, scoped, expiring, revocable; uploads size-limited (e.g. 20 MB) and schema-validated.
- Code execution: browser exercises in Pyodide (client-side sandbox). Non-Python exercises run **only on the learner's own machine** via `atlas-lab` in Docker with `--network none`, CPU/memory limits, read-only mounts. The hosted server never runs user code in v1.
- Web: CSP, HSTS, SameSite cookies, CSRF on mutations (Better Auth + origin checks), rate limits (Redis token bucket) on auth, mentor, uploads.
- LLM risks (OWASP LLM Top 10): treat fetched content as data; no tool use that writes externally; output escaping; per-user cost caps.
- Audit log for publish, token creation, settings changes, export, delete.

## D.6 Deployment

- **Local (default, $0):** `docker compose up` brings up all services; seed script loads `/content` and a clearly flagged sample dataset (`is_mock=true`).
- **Single VM (< $25 tier):** same Compose file + Caddy for TLS; GitHub Actions builds images to GHCR and deploys over SSH; nightly `mysqldump` + `restic` to an off-VM bucket (storage cost UNVERIFIED per provider - check before choosing); monthly restore test script.
- **Split (< $100 tier, optional):** web on Vercel, api-py/workers/MySQL/Redis on the VM over a private tunnel. Only do this if the VM is a bottleneck.
- Environments: `development`, `test`, `production`; config via env with a Zod-validated loader that fails fast on missing vars.
- Monitoring: OTel traces; `/healthz` on every service; uptime check (Grafana Cloud free or Sentry free cron/uptime monitor); error tracking optional.

## D.7 Error handling and degradation

| Failure | Behaviour |
|---|---|
| GitHub API down / rate-limited (search is 30 req/min authenticated) | Serve cached data with "last synced" time; back off using `x-ratelimit-reset` |
| AI provider error or cap hit | Mentor disabled banner; everything else works |
| api-py down | Charts show raw summaries from DB; report generation queued and retried with exponential backoff (max 5) |
| Job fails | `jobs.status=failed` with error; visible in Settings > Jobs; retry button |
| Runner upload invalid | 422 with schema errors listed per field |

## D.8 Testing strategy

- Unit: domain logic (gates, FSRS integration, difficulty estimator, meters, budget enforcement, stats).
- Contract: JSON Schemas in `packages/contracts` validated in both Vitest and pytest.
- Integration: route handlers against MySQL/Redis via Testcontainers.
- E2E: Playwright flows for each Part H acceptance test.
- Accessibility: axe on every page in CI; keyboard-only e2e for core flows.
- Security tests: no-secret-in-bundle check; authz tests (user A cannot read user B); mentor solution-withholding test; "no GitHub write calls" test (HTTP mock asserts only GET).
- Quality gates in CI: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `uv run ruff check`, `uv run pyright`, `uv run pytest`, Playwright, axe.

## D.9 Cost controls (engineering)

- AI: budget check before each call (estimated tokens x price table stored in DB with `verified_at`); hard stop at cap; per-request max output tokens.
- GitHub: conditional requests (ETag) to save rate limit; scheduled sync at most hourly.
- Hosting: no paid dependency required; Compose runs on one small VM.
- GPU: never launched by the platform in v1; the runner prints a cost estimate and writes an auto-shutdown script.
