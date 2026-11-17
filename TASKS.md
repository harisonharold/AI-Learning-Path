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

## P2 Lab (next; not started)
| Task | Status |
|---|---|
| Projects with pre-registration, configs, runs; upload API + JSON Schema | todo |
| atlas-lab CLI (env capture, run in Docker `--network none`, upload, cost pre-flight, auto-shutdown, notebooks) — also unblocks code-test gates (D-45) | todo |
| api-py stats (percentiles, bootstrap CI, Mann-Whitney U) | todo |
| Benchmark analytics page (ECharts, data-table toggle and text summary per chart) | todo |
| Report generator with the baseline rule (Markdown/HTML) | todo |
| Mock banner + sample-data toggle | todo |
| Move the stack to Node 24 (Q26) | todo, needs approval |

## Revisit later
| Task | Trigger | Status |
|---|---|---|
| Move to ESLint 10 (D-29) | `eslint-config-next` and its plugins (react, import, jsx-a11y) declare ESLint 10 support | todo, check at each Next.js minor upgrade |
| Move to TypeScript 7 (D-30) | Next.js and typescript-eslint support the TS 7 native compiler | todo, check at each Next.js minor upgrade |
| Better Auth tables vs upstream schema (D-36) | any better-auth upgrade | todo, re-diff core schema on upgrade |
| Move to ts-fsrs 6 (D-41) | the stack runs Node 24 (Q26) | todo |
| Upgrade GitHub Actions majors (checkout/setup-node/pnpm v4 run on deprecated Node 20, per CI warnings) | before Node 20 actions stop working | todo; re-pin SHAs from the CI log |
