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

## P1 Learning core (next; not started)
| Task | Status |
|---|---|
| **P1 exit condition:** pin every GitHub Action in `.github/workflows/` to a full commit SHA, version in a comment (D-38) | todo |
| OpenTelemetry → Jaeger for web, workers, api-py | todo |
| Self-hosted fonts + OFL licence check (Q19) | todo |
| Content pipeline: `curriculum.yaml`, `sources.yaml`, W1–W3 MDX lessons + cards | todo |
| Roadmap (graph / timeline / list) with gate-only locks | todo |
| Lesson viewer with verified_at + stale badges | todo |
| Pyodide practice checks on `SANDBOX_ORIGIN` (half-day spike first, R-13) | todo |
| Gates / attempts / evidence / rubrics; practice checks never count | todo |
| Server-graded MCQ / short answers | todo |
| Remediation | todo |
| FSRS cards + daily quiz | todo |
| Daily workspace + timer / time logs | todo |
| Diagnostic (W1–W3 skips need counting evidence, Q23) | todo |
| Learning-progress meter | todo |

## Revisit later
| Task | Trigger | Status |
|---|---|---|
| Move to ESLint 10 (D-29) | `eslint-config-next` and its plugins (react, import, jsx-a11y) declare ESLint 10 support | todo, check at each Next.js minor upgrade |
| Move to TypeScript 7 (D-30) | Next.js and typescript-eslint support the TS 7 native compiler | todo, check at each Next.js minor upgrade |
| Better Auth tables vs upstream schema (D-36) | any better-auth upgrade | todo, re-diff core schema on upgrade |
