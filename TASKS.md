# TASKS.md

Status: `done` = its tests pass; `todo`; `blocked` = waiting on Harison.

## P0 Groundwork
| Task | Status | Tests |
|---|---|---|
| pnpm + uv workspaces, pinned versions | done | CI install |
| Compose: 7 dev / 7 prod containers, test overlay | done | AT-01, compose config check |
| Fail-fast env loaders (web, worker-node, Python) | done | env tests (TS + Py) |
| Drizzle schema (50 tables) + migrations + FULLTEXT + least-privilege users | done | `tests/int/schema.test.ts` |
| Better Auth + GitHub App sign-in, single-id allowlist, `/setup` page | done | AT-02, X-01 a–e |
| Single GitHub POST in `modules/auth`; lint guard | done | AT-27 (auth part) |
| HMAC with timestamp + Redis nonce (both directions) | done | X-10, AT-05 |
| Jobs: web → BullMQ → worker-py → callback | done | AT-05 |
| BullMQ-Python spike | done | `spikes/bullmq-py` |
| Module boundaries (eslint-plugin-boundaries) | done | `tests/unit/lint-boundaries.test.ts` |
| Design-system shell: tokens, rail, palette, shortcuts, themes, PageState | done | contrast tests, shell e2e, axe |
| CSP + security headers + two-origin split | done | shell e2e, X-02 |
| `/healthz` on every service | done | AT-01 |
| Secret-in-bundle scan with canaries | done | AT-03 + planted-secret tests |
| Forbidden-strings check | done | planted-string tests |
| Log redaction | done | X-03 |
| Account delete without GitHub calls | done | X-14 |
| CI workflow | done (green on harisonharold/sloane run #1; AI-Learning-Path run: see PROGRESS.md) | — |
| Real GitHub sign-in (manual) | blocked: needs GitHub App credentials | manual |
| Verify revoke link (D-37) | todo (P3-core job) | — |
| Move work to harisonharold/AI-Learning-Path (D-39) | done | CI on AI-Learning-Path |
| Decide what to do with the mistaken pushes in harisonharold/sloane | blocked: waiting for Harison | — |

## P1 Learning core (done on `p1-learning-core`, awaiting review)
| Task | Status | Tests |
|---|---|---|
| Pin GitHub Actions to commit SHAs (D-38, P1 exit condition) | done | `tests/unit/ci-pins.test.ts` |
| OpenTelemetry → Jaeger for web, workers, api-py, with redaction | done | telemetry unit tests (TS + Py), `tests/e2e/tracing.spec.ts` |
| Self-hosted fonts + OFL licence check (Q19) | done | licence files in `apps/web/app/fonts/` |
| Content pipeline: curriculum (24 RI + 16 ACC weeks, all gates and rubrics), sources, W1-W3 lessons with 15 cards each, W1 quiz, W1 exercise, diagnostic | done | `modules/learning/tests/content.test.ts` |
| Roadmap (graph / timeline / list) with gate-only locks and the W12/W15 exam rule | done | AT-06 (unit, int), roadmap e2e |
| Lesson viewer with verified_at + stale badges, report broken link | done | AT-12 (unit, int, e2e) |
| Pyodide practice checks on `SANDBOX_ORIGIN` | done | AT-08, X-05 (e2e) |
| Gates / attempts / evidence / rubrics; practice checks never count | done | AT-07, X-11, X-13 (unit, int, DB CHECK) |
| Server-graded quizzes (answer keys server-side only) | done | int + e2e + X-06 bundle canaries |
| Remediation that locks only dependants | done | AT-11 (unit, int) |
| FSRS cards + daily quiz from earlier weeks | done | AT-09 (unit, int), AT-14 (e2e) |
| Daily workspace + timer / time logs | done | AT-06 int, AT-14 e2e |
| Diagnostic (W1-W3 skips need counting evidence) | done | AT-10 (unit, int), diagnostic e2e |
| Learning-progress meter (mock excluded) | done | int |
| Accessibility on every P1 page, both themes | done | AT-13 (40 axe tests) |
| Keyboard-only core flow | done | AT-14 |
| Lessons for weeks 4-24 | todo (Q25) | — |

## P2 Lab (done on `p2-lab`, awaiting review)
| Task | Status | Tests |
|---|---|---|
| Node 24 + ts-fsrs 6 (Q26) | done (PR #3, D-52) | full suite on Node 24 |
| Upload contracts (Zod source, generated JSON Schemas, fixtures, canonical-JSON vectors) | done | `contract.test.ts`, `test_contracts.py`, `test_canonical.py` |
| Stats engine: percentiles, seeded bootstrap CIs, compare, Mann-Whitney U (numpy) | done | `test_stats.py` (AT-21 fixture), `test_stats_routes.py` |
| Projects with immutable pre-registration + amendments; configs; runs (session + runner) | done | `research.test.ts` (AT-15, AT-16, F.5) |
| Runner tokens (hashed, scoped, <= 90 d, revocable, bearer-only) + upload rate limits | done | `research.test.ts` (AT-18), authz matrix |
| Gate bundle w01@1 + runner_result evidence | done | `gate-bundles.test.ts`, `research.test.ts`, e2e |
| atlas-lab CLI (login, env, run, gate in Docker `--network none`, upload, notebooks, cost pre-flight, shutdown script) | done | `cli/atlas-lab/tests` (AT-17), e2e |
| Report generator (Markdown + HTML, baseline rule, failed runs kept) | done | `report-gate.test.ts`, `test_report.py`, e2e (AT-19) |
| Benchmark analytics page (ECharts; CDF, histogram, box, throughput, memory, GPU; table + summary per chart; diffs; degraded banner) | done | e2e, AT-47 e2e, axe |
| Sample-data toggle + SAMPLE DATA banner + exclusion | done | `research.test.ts`, e2e (AT-20) |
| Lessons W4-W8 (75 cards) + q-w04 (Q25) | done | content validation, axe on each lesson |

## P3-core Research (next; not started)
| Task | Status |
|---|---|
| Source verification job (SSRF-guarded); verify the 4 sources stored as unverified in P2 and the revoke link (D-37) | todo |
| Paper library (never locked) | todo |
| Lessons for week 9 before the learner can reach week 8 (Q25 rule) | todo |
| Gate bundles for W2-W8 (needs Q27) | blocked: waiting on Q27 |

## Revisit later
| Task | Trigger | Status |
|---|---|---|
| Move to ESLint 10 (D-29) | `eslint-config-next` and its plugins (react, import, jsx-a11y) declare ESLint 10 support | todo, check at each Next.js minor upgrade |
| Move to TypeScript 7 (D-30) | Next.js and typescript-eslint support the TS 7 native compiler | todo, check at each Next.js minor upgrade |
| Better Auth tables vs upstream schema (D-36) | any better-auth upgrade | todo, re-diff core schema on upgrade |
| Move to ts-fsrs 6 (D-41) | the stack runs Node 24 (Q26) | done (D-52) |
| Upgrade GitHub Actions majors (checkout/setup-node/pnpm v4 run on deprecated Node 20, per CI warnings) | before Node 20 actions stop working | todo; re-pin SHAs from the CI log |
| Compare and reports read raw gzip files for runs above 100k samples (RR12) | first run that large | todo |
| Refresh the pinned `python:3.12-slim` digest in gate bundles (security updates) | monthly dependency window (RR6) | todo; bumps the bundle version |
| Python CI job: pre-pull the gate image so `test_real_bundle_in_docker...` runs there too (it is skipped in that job; the e2e job runs a real Docker gate) | next CI change | todo |
