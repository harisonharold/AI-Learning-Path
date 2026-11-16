# Part H - Implementation Phases and Acceptance Tests

Rule for every phase: the app runs (`docker compose up`, then log in, then use the features built so far) and CI is green (lint, typecheck, unit, integration, e2e, axe) before the next phase starts. A feature is "done" only when its acceptance tests pass in CI. Otherwise it is listed in PROGRESS.md as "not done".

## H.1 Build sequence

| Phase | Scope | Exit criteria |
|---|---|---|
| **P0 Groundwork** (approval gate) | Inspect repo; write PLAN.md + THREAT_MODEL.md; **wait for approval**. Then: monorepo (pnpm + uv), Compose (web, worker-node, api-py, worker-py, mysql, redis, jaeger), env loader, CI, Drizzle schema + migrations, Better Auth with GitHub sign-in, design-system shell (themes, nav, command palette), health checks. Spike: Python BullMQ worker round-trip; if it fails, switch to the RQ fallback and record the decision in PLAN.md | AT-01..AT-05 |
| **P1 Learning core** | Content pipeline (MDX + `sources.yaml` with verified_at), skills graph + roadmap, lesson viewer, Pyodide exercises, gates + attempts + rubric scores, FSRS cards + daily quiz, daily workspace, diagnostic, learning-progress meter, time logs | AT-06..AT-14 |
| **P2 Lab** | Projects, configs, runs upload API + JSON Schema, `atlas-lab` CLI (env capture, run, upload, GPU shutdown script, cost pre-flight), api-py stats (percentiles, bootstrap CI, compare), benchmark analytics page, report generator with baseline rule, mock-data banner | AT-15..AT-21 |
| **P3 Research engine** | Source verification jobs (arXiv, GitHub, URL), paper library with FULLTEXT, dossiers (seeded with the 13 from Part F, each with sources), classification rules, novelty-check log, stale warnings | AT-22..AT-26 |
| **P4 GitHub workspace** | GitHub App install (read-only), repo explorer, issue sync with ETag + rate-limit handling, difficulty estimator with reasons, contribution checklist + draft PR text for copying, PR/review tracker | AT-27..AT-31 |
| **P5 Mentor + interviews** | Provider adapter (at least one provider + a "none" mode), encrypted key storage, budgets/caps, Socratic modes, hint ladder, solution withholding, citation + confidence rules, weakness tracking, interview simulator | AT-32..AT-38 |
| **P6 Portfolio + career** | Portfolio builder, public pages, quality checks, evidence-linked writing helpers, four meters complete, conference/community list | AT-39..AT-42 |
| **P7 Hardening + lab sim** | Systems architecture lab (discrete-event sim in api-py), a11y manual pass, Lighthouse budget, backup + restore script tested, deployment docs (local, VM), easter eggs | AT-43..AT-47 |

**First release (v1) = P0 + P1 + P2 + the paper library from P3.** That is enough to run weeks 1-12 of the curriculum with real gates and real benchmark tracking. P3-P7 follow.

## H.2 Acceptance tests (Given / When / Then; automated unless marked "manual")

| ID | FR/NFR | Test |
|---|---|---|
| AT-01 | NFR-7 | Given a fresh clone, when `docker compose up` and the seed script run, then all `/healthz` return 200 within 120 s |
| AT-02 | FR-17 | Given GitHub OAuth test credentials, when the user signs in, then a session exists and `/api/me` returns the user; without credentials, the app shows a clear "configure GitHub login" page instead of crashing |
| AT-03 | NFR-1 | After `next build`, a scan of `.next/static` finds no strings matching configured secret patterns (CI fails otherwise) |
| AT-04 | NFR-1 | User A's session cannot read or modify user B's projects, attempts or settings (403) on every `/api/*` route (generated test over the route list) |
| AT-05 | D.1 | A job enqueued by web is consumed by worker-py and its result posted back via HMAC; a callback with a bad signature returns 401 |
| AT-06 | FR-2 | Given gate W2 not passed, W3 nodes depending on it are locked even when 100 hours are logged |
| AT-07 | FR-6 | Passing a gate requires all `required_evidence` items; submitting tests-only for a gate that also needs a report leaves it "pending evidence" |
| AT-08 | FR-5 | A Pyodide exercise runs its hidden tests in the browser and records pass/fail on the attempt; no code is sent to the server for execution |
| AT-09 | FR-7 | Reviewing a card with rating 1-4 updates `due_at` per ts-fsrs; today's quiz lists only due cards from earlier weeks |
| AT-10 | FR-1 | Completing the diagnostic produces a skill map and skips a week only if that week's gate tests are passed within the diagnostic |
| AT-11 | FR-8 | Failing a gate creates a remediation plan and locks only dependent skills |
| AT-12 | FR-4 / NFR-8 | Every resource on a lesson shows verified_at; a resource older than 30 days shows a stale warning |
| AT-13 | NFR-3 | axe reports zero serious/critical violations on all P1 pages in both themes |
| AT-14 | E.2 | Keyboard-only Playwright run completes: open Today, take the quiz, open a lesson, run an exercise |
| AT-15 | FR-13 | Uploading a valid benchmark JSON creates a run; the server recomputes p50/p95/p99 from samples and ignores a conflicting client summary |
| AT-16 | FR-13 | Uploading invalid JSON returns 422 with per-field errors |
| AT-17 | FR-14 | `atlas-lab run --dry-run` prints captured env (CPU, OS, Python, git SHA; GPU fields when `nvidia-smi` exists) and a cost estimate when `--gpu-rate` is given |
| AT-18 | FR-14 | Runner token with scope `results:write` can upload; a revoked or expired token gets 401; token stored only as hash |
| AT-19 | FR-12 / F.5 | "Generate report" is disabled until a baseline and >= the configured repetitions exist; generated report includes failed runs and config/env diffs |
| AT-20 | FR-30 | Seeded mock runs show the SAMPLE DATA banner and never appear in meters, portfolio or reports |
| AT-21 | FR-13 | Comparing two runs returns bootstrap CI of the difference (checked against a fixed-seed fixture) |
| AT-22 | F.2 | Verifying arXiv id 2309.06180 stores the title "Efficient Memory Management for Large Language Model Serving with PagedAttention" (network-recorded fixture in CI; live check in a nightly job) |
| AT-23 | F.2 | A URL returning a captcha/"Access denied" page is stored as `broken` or `partial`, never `verified` |
| AT-24 | F.3 | A dossier cannot be saved as "documented open problem" without at least one evidence source dated within 12 months or an explicit override note |
| AT-25 | F.3 | Promoting an "unverified hypothesis" requires a stored novelty-check log; UI never shows the word "novel" |
| AT-26 | FR-11 | FULLTEXT search over abstracts and notes returns the seeded paper for a keyword in its abstract |
| AT-27 | FR-17 | GitHub App installation requests only read permissions (assert manifest); an HTTP mock test proves the github module issues only GET requests |
| AT-28 | FR-19 | For a fixture issue labelled `good first issue` with an RFC title and many linked modules, the estimator returns >= 4 with reasons listed |
| AT-29 | D.7 | On a 403 rate-limit response, sync backs off until `x-ratelimit-reset` and the UI shows cached data with last-synced time |
| AT-30 | FR-20 | Contribution flow ends with a "copy PR description" button; there is no button or API that creates a PR or comment |
| AT-31 | FR-21 | A merged PR fixture becomes a portfolio-eligible artifact with source link |
| AT-32 | FR-22 | With no provider key, mentor page shows "mentor off" and all other features work |
| AT-33 | C.5 | Before the related gate is passed, a request for "the full solution" returns guiding questions/hints only; server-side check verified by test using a stub model that tries to output a solution |
| AT-34 | C.5 | In "no AI code" weeks, mentor output with a code block > 3 lines is truncated and flagged |
| AT-35 | C.5 | A research claim with no stored citation is labelled "unverified suggestion" with confidence `low` |
| AT-36 | D.9 | When `spent_today + estimate > daily cap`, the call is refused before contacting the provider |
| AT-37 | D.5 | AI keys are write-only: `GET /api/settings` never returns them; DB holds ciphertext only |
| AT-38 | FR-23 | System-design interview stores rubric scores per criterion and the transcript/recording reference |
| AT-39 | FR-24 | Only verified artifacts are selectable for the public portfolio; unpublished items return 404 on public routes |
| AT-40 | FR-25 | Quality check flags a linked repo missing LICENSE, CI or tests |
| AT-41 | FR-26 | Every generated resume bullet links to evidence; a bullet with no evidence id is rejected |
| AT-42 | C.6 | The hiring-readiness view is a checklist with the disclaimer text; no probability or "recruiter score" appears anywhere (string search test) |
| AT-43 | FR-1..30 | Systems lab simulation of an M/M/1 queue matches the analytic mean latency within 5% (fixed seed) |
| AT-44 | NFR-5 | Backup script produces a dump; restore into a fresh MySQL passes a row-count check |
| AT-45 | NFR-4 | Lighthouse CI on dashboard with seeded data: LCP < 2.5 s (desktop profile) |
| AT-46 | NFR-3 | Manual: screen-reader pass on Today, Lesson, Analytics (manual, recorded in PROGRESS.md) |
| AT-47 | NFR-5 | With api-py stopped, analytics shows stored summaries and a degraded banner |

## H.3 Exam rubrics (used by gates; 4 levels: missing / partial / competent / strong)

| Exam | Objective part | Rubric criteria |
|---|---|---|
| Implement concurrency primitives (W5) | Hidden stress tests under TSan | Correctness under contention; memory-ordering justification; deadlock-freedom argument; test quality |
| Diagnose performance bottleneck (W8) | Fixed service must meet a stated latency target | Hypothesis -> measurement loop; correct tool use (perf/pprof/flame graph); root cause stated; fix verified with before/after CIs |
| Explain consistency trade-offs (W11) | Linearizability check on learner's KV history | Correct model per scenario; anomaly examples; cost (latency/availability) reasoning; CAP/PACELC used correctly |
| Debug a broken distributed system (W12) | 3 planted bugs; regression tests must fail before fix and pass after | Bugs found; fixes minimal; tests; written postmortem |
| Optimize a small GPU kernel (W15) | >= 50% of cuBLAS on same GPU, correctness tests | Profiling evidence; roofline placement; explanation of limiter; method |
| Analyze distributed traces (W20) | Must name the slow span and retry amplification factor | Critical path; evidence from spans; proposed fix; SLO impact |
| Evaluate a research paper (W22) | - | Claims vs evidence; missing baselines; threats to validity; proposed test |
| Reproduce published results (W22) | Reproduction package re-runs | Direction reproduced or honestly not; config/env captured; CIs; confounders |
| Design a fault-tolerant service (W24) | Chaos test on capstone | Failure model; replication/consistency choice; detection/recovery; capacity math |
| Defend design decisions (W24) | Recorded defense | Alternatives considered; trade-offs with numbers; answers to challenges; admits limits |

Pass rule: no criterion "missing", at least half "competent" or better, and the objective part passes.
