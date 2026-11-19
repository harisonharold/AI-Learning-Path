# PROGRESS.md

## 2026-11-19 — P3-core: source verification + paper library (finished on branch `p3-core`; awaiting review)

With P3-core, v1 (P0 + P1 + P2 + P3-core) is feature-complete.

### Built
- **safeFetch, the SSRF guard (D-17, D-67):**
  - Allows http/https on ports 80/443 only, and no credentials in the URL.
  - Parses hosts with the WHATWG parser, so decimal, octal and hex IPv4 forms are normalised.
  - Refuses localhost, `*.internal` and `*.local` names, single-label names and Compose service names.
  - Checks every DNS answer against IPv4/IPv6 blocklists: private, loopback, link-local, CGNAT, documentation, multicast and reserved ranges, mapped/NAT64/compat forms, and the Compose subnet.
  - Connects to the validated address only, so rebinding has no effect.
  - Re-checks every redirect (max 3), times out at 5 s to connect and 10 s total, aborts bodies over 2 MB mid-stream, and sends no cookies or credentials.
- **Verifiers (D-68):**
  - arXiv through its export API; GitHub through REST `GET /repos` and `GET /repos/{o}/{r}/issues/{n}`; other URLs by page title; price pages say "estimate, read on DATE".
  - A captcha or access-denied page is never verified.
  - Rate limits, timeouts and server errors keep the last status.
- **Jobs and scheduling (D-69):**
  - `verify.source` jobs run on worker-node, which reports results back over signed requests and holds no database credentials.
  - A nightly BullMQ schedule (03:17 UTC) asks web, over HMAC, to queue every source not checked in 20 hours.
  - "Re-check now" on each lesson resource, and "Report a broken link" now re-checks immediately.
- **Live data (AT-12, D-70):**
  - All 26 seed sources were re-checked on 2026-11-19 by the real verifier on GitHub Actions runners: 25 verified, 1 partial.
  - That includes the four sources left unverified in P2.
  - The revoke link (D-37) redirects to GitHub sign-in, so it is "partial". The account-delete page now shows that state from its sources row (D-72).
- **Paper library (D-71):** `/research/papers`, never locked.
  - Add a paper by arXiv id; title, authors and abstract come only from arXiv.
  - Or add a URL with your own title, shown as unverified until checked.
  - Notes, read/analysed status, and FULLTEXT search over title, abstract and notes.
- **P2 review follow-ups:**
  - Comparisons and reports that used only the first 100,000 stored samples show a note naming the runs (D-76).
  - GitHub Actions moved to Node 24 majors, still SHA-pinned (D-74). The Node 20 warning no longer appears in CI logs.
  - The Python CI job now pulls the gate image, so its real Docker gate test runs there too.
- **Q27 course graders (D-75):** licences and pinned commits are recorded and enforced by a content test. The table is below.

### Q27: course graders, licences and pinned commits (read 2026-11-19; nothing copied into this repo)
| Week / gate | Course | Repository | Pinned commit(s) | Licence (from its LICENSE file) | Use allowed | Status |
|---|---|---|---|---|---|---|
| W4 `atlas-lab:w04@1` | MIT 6.1810 (Fall 2026) | `git://g.csail.mit.edu/xv6-labs-2026` | `util` 8138d07d83441198b898e37d22840f5900cc0c32, `syscall` 99161db76e00d70945f5248c7439b64323e6077c | MIT (xv6 permission notice) | yes | pinned; bundle not built (Q29) |
| W7 `atlas-lab:w07@1` | Gossip Glomers on Maelstrom | `https://github.com/jepsen-io/maelstrom` | `v0.2.4` b70544f95ee0579b1a5e4bdf60bb2f90a44171bc | EPL-1.0 (running the program is permitted) | yes | pinned; bundle not built (Q29) |
| W8 `atlas-lab:w08@1` | CMU 15-445 BusTub P1 | `https://github.com/cmu-db/bustub` | `master` 820bcaf90710ec39f463532a10f6c66cd2368491 | MIT | yes; course rules: no coding agents on P1-P2, don't publish solutions | pinned; bundle not built (Q29) |

No licence forbids this use, so no gate became manual/self-assessed. The W2, W3, W5, W6 and W8-exam gates use Systems Atlas's own hidden tests, not course graders; those bundles are still to be written.

### Tested (local, 2026-11-19; CI on the branch: see below)
| Suite | Result |
|---|---|
| Lint / strict typecheck | clean |
| Web unit / UI / worker-node | 196 / 71 / 73 passed (worker-node includes X-04 and the verifiers) |
| Integration (Testcontainers MySQL 8.4 + Redis 7) | 139 passed |
| Python: services + atlas-lab | ruff, format and pyright clean; 69 + 40 = 109 passed |
| Playwright | 99 passed, 0 skipped: 37 e2e + 62 axe (sign-in, 27 pages, 3 project tabs, in both themes) |
| AT-01 / AT-03 + X-06 / X-02 / forbidden strings | pass / 0 findings (132 files, 11 canaries) / pass / pass |

Acceptance tests covered in P3-core:
- **AT-12 (live data):**
  - e2e: a lesson resource forced 40 days old shows "Stale".
  - "Re-check now" then runs worker-node, then safeFetch, then the signed callback, and the resource shows today's date.
- **AT-22:**
  - `verify.test.ts` parses the arXiv response recorded on 2026-11-19 through the full fetch pipeline: title "Efficient Memory Management for Large Language Model Serving with PagedAttention", first author Woosuk Kwon.
  - The integration test stores that title on the source and fills the paper. The e2e test does the same through the UI.
  - The live check is the nightly job wherever the stack runs; the recorder runs did it on GitHub Actions on 2026-11-19.
- **AT-23:**
  - Unit: a small captcha page is partial; 403 "Access denied" and Cloudflare's "Just a moment" (503) are broken; a large normal page that mentions captcha in a script is verified; a sign-in redirect is partial.
  - Integration and e2e cover the same rules end to end (`blocked.example.org` ends up partial).
- **AT-26:** integration and e2e search for "fragmentation", which appears only in the abstract, and find the paper. Notes are searchable; two-letter tokens like "KV" work; operator characters are harmless.
- **X-04:**
  - 57 unit cases, every one named in PLAN §5.
  - e2e: a paper URL `http://redis:6379/` is stored as a failed check with reason `port`.
- **AT-04:** the route manifest covers all 43 routes; the cross-user matrix adds papers.

### Failed, then fixed during P3-core (not hidden)
- **The first live run flagged two good GitHub pages as captchas:** GitHub's scripts mention "captcha". The heuristic now checks titles always and body phrases only on small pages or errors. The second run verified the FSRS wiki and classed the revoke link as a sign-in redirect.
- **A race made the e2e test flaky:** a verified source next to a paper still showing its placeholder title. Source and paper updates now happen in one transaction.
- **The web image failed to build:** an integration test imported worker-node's parser statically, and those files aren't in the web build context. It now loads the parser at run time.
- **The local disk filled up (100%)** with 22 GB of Docker build cache, and MySQL test containers could not start. The cache was pruned.
- **setup-node v5 auto-caching:** it tried to cache pnpm in a job without pnpm. That job now disables the cache.
- **Docker Hub rate limits (429)** blocked local image builds. The local daemon now uses Google's mirror; the repository is unchanged.
- **Tests that hard-coded the old seed facts** (2026-11-16 dates, revoke link "unverified") were updated to the live-verified seed.
- **I pushed one commit with two type errors in a test file** and fixed them in the next commit.

### Not done / limits (honest)
- **Course-grader bundles aren't built yet (Q29),** and Systems Atlas's own bundles for W2, W3, W5, W6 and the W8 exam aren't written. Those gates still say "hidden tests not published yet".
- **Verification runs only while the stack runs (RR13).** A machine that is off at night skips the sweep; resources turn stale after 30 days, and Settings shows the last check.
- **Proxies aren't supported by safeFetch,** because they would bypass address pinning. In this build environment the containers can't reach the internet, which is why fixtures were recorded on GitHub Actions.
- **The AT-22 live check isn't a CI job.** CI uses the recorded fixture; the live check is the app's nightly sweep in a running deployment.

### Mock data
- **In the product:** unchanged. Only the optional sample-data project.
- **Test-only:**
  - The mock server now also answers for three hosts during e2e (a course page, the recorded arXiv response, a captcha page).
  - worker-node accepts test-only DNS/dial maps; its env loader refuses them outside `ATLAS_ENV=test`.

### What I need from you
1. Review of the P3-core PR.
2. Decisions **D-67…D-76** (PLAN §9), especially D-67 (guard in worker-node), D-68 (verification rules) and D-70 (fixtures recorded on GitHub Actions).
3. **Q29:** toolchain images for course graders. I recommend our own Dockerfiles, built locally, with the digest recorded per result.
4. Your call on what's next: v1 is feature-complete, so the options are P3-rest (dossiers), P4, or hardening first.

## 2026-11-18 — P2 Lab (finished on branch `p2-lab`; awaiting review)

### Built
- **Node 24 + ts-fsrs 6 (D-52):** its own PR (#3), stacked on P1. ts-fsrs 6 dropped `elapsed_days`, so we compute it; cards stored under 5.x still load.
- **Upload contracts (D-53, D-54):**
  - Zod is the single source; `packages/contracts/schemas/benchmark.schema.json` and `gate-result.schema.json` are generated from it and a test fails on drift.
  - Fixtures cover valid and invalid uploads, gate results and canonical JSON. Canonical JSON uses JavaScript number formatting, identical in TypeScript and Python (checked on 8,000+ random doubles and in the shared vectors).
- **Stats engine (D-55, numpy approved):**
  - Percentiles; seeded percentile bootstrap for p50/p95/p99/mean; histogram; CDF.
  - Compare (bootstrap CI of B−A and of the relative change, Mann-Whitney U).
  - api-py serves `/stats/summary`, `/stats/compare` and `/reports/render` over HMAC; worker-py runs the `stats.summarize` and `report.render` jobs.
- **Research module:**
  - Projects with **immutable pre-registration** and timestamped amendments (D-57).
  - Configs deduplicated by canonical hash; runs uploaded from the browser or by atlas-lab (≤ 20 MB, stream-checked, `config` depth and size limits, rate-limited in Redis).
  - The server recomputes every summary with numpy-identical percentiles; the client summary is kept for audit only (D-56). Samples go to the DB up to 100k per metric, overflow to gzip files (deleted with the account).
  - Environment fingerprints; compare with confounder warnings and config/env diffs; degrades to stored summaries when api-py is down.
- **Report generator (D-58):** escaped Markdown and HTML with the F.5 claim rule (percentage only against the pre-registered baseline, same environment, CI excluding zero). Failed runs are always listed, with reproduce commands. Downloads are sandboxed attachments. New `project_reports` table (migration 0003).
- **Runner tokens (D-59):** shown once, SHA-256 stored, scoped (`results:write`, `tests:read`), 1-90 days, revocable, last use recorded, bearer-only.
- **Gate test bundles (D-60):** `content/gate-tests/w01@1` has a digest-pinned image, a stdlib harness, 8 hidden tests and a canary. A verified atlas-lab result becomes `runner_result` evidence, so **code-test gates can now pass** (closes the D-45 limit for W1).
- **atlas-lab CLI (D-61):**
  - `login --token` (hidden prompt, 0600 file, redaction), `env`, `upload`, and `notebook export|import` (nbformat v4 via the standard library).
  - `run <exercise>` runs hidden tests in Docker (`--network none`, read-only, no capabilities, nobody user, limits).
  - `run <experiment> -- cmd` handles repetitions, warm-ups, timeouts, `--max-hours`, GPU sampling via nvidia-smi and failed runs.
  - `--dry-run` prints the environment and the cost pre-flight. It writes a shutdown script and never runs it.
- **Pages:**
  - `/research/projects` and the project workspace (Hypothesis · Plan · Configs · Runs · Compare · Failures · Reproducibility · Report). The baseline is pinned; the report button explains why it's disabled.
  - `/analytics/benchmarks`: ECharts CDF, histogram, box plot, throughput, memory and GPU timeline, each with a text summary and a data table; percentile CI table; bootstrap differences; config/env diff with confounder warnings; degraded banner.
  - Settings: runner tokens and the sample-data toggle.
- **Sample data (D-62):** one `is_mock` project behind the Settings toggle, with the SAMPLE DATA banner. It is never reportable and never counted.
- **Content (Q25):** lessons for weeks 4-8 with 75 review cards and the `q-w04` virtual-memory quiz. Eight new sources come from SOURCES.md (checked 2026-11-16). Four (RFC 9112, epoll(7), flame graphs, Go diagnostics) were unreachable from here and are stored as **unverified** (shown with the Unverified badge).

### Tested (local on Node 24, 2026-11-18; CI on the branch: see below)
| Suite | Result |
|---|---|
| Lint (boundaries included) / strict typecheck | clean |
| Web unit | 194 passed (18 files) |
| UI contrast / worker-node | 71 / 2 passed |
| Integration (Testcontainers MySQL 8.4 + Redis 7) | 121 passed |
| Python: services + atlas-lab (ruff, ruff format, pyright strict, pytest) | clean; 68 + 40 = 108 passed, incl. a real Docker gate run |
| Playwright | 93 passed, 0 skipped: 33 e2e + 60 axe (sign-in, 26 pages and 3 project tabs, in both themes) |
| AT-01 compose smoke | pass |
| AT-03 + X-06 bundle scan | 0 findings in `.next/static` (131 files) and the sandbox files; 11 canaries incl. the hidden-test canary |
| X-02 Caddy edge / forbidden strings | 9/9 / pass |

Acceptance tests covered in P2:
- **AT-15:**
  - `research.test.ts`: server p50/p95/p99 equal the TS summary of the samples, and the client summary (p50 = 1) is ignored.
  - `contract.test.ts`: the TS summary equals the numpy fixture exactly.
  - e2e: the browser upload shows the server's 12.25 ms.
- **AT-16:**
  - Integration: the invalid fixture returns 422 listing `schema_version`, `config_hash`, `env.git_sha`, `metrics.0.name` and `metrics.0.samples`; a config-hash mismatch is a field error; non-JSON returns 422; 21 MB returns 413.
  - The same fixture fails the generated JSON Schema in Python.
- **AT-17:** `test_dry_run.py` checks env fields without a GPU, GPU fields from a stand-in `nvidia-smi`, cost from `--gpu-rate` × `--max-hours` or from the timeouts, and a warning when there is no limit.
- **AT-18:**
  - Integration: a results:write token uploads; a revoked or expired token gets 401; a missing scope gets 403; a cookie alone gets 401; only the hash and prefix are stored; tokens are capped at 90 days.
  - e2e: the token is shown once, then only by prefix, and works for `atlas-lab login`.
- **AT-19:**
  - `report-gate.test.ts` covers each reason.
  - Integration: 409 with reasons until a baseline and enough non-warm-up runs exist, then 202 and a job whose run set includes the failed run.
  - e2e: the downloaded report states the change against the baseline with a CI and lists the failed run's note.
- **AT-20:**
  - Integration: off by default; the toggle creates 12 `is_mock` runs; the project is never reportable; meters are unchanged; turning it off deletes it.
  - e2e: SAMPLE DATA banner on the project and analytics pages.
- **AT-21:**
  - The fixed-seed fixture is reproduced exactly in-process and over HTTP; floats compare to 1e-9 across Python builds.
  - The web compare signs its call and passes the fixture through (integration test with a signature-checking stub).
- **AT-47:**
  - Integration: compare returns `degraded: true` with stored summaries.
  - e2e: `api-py` is stopped, the analytics page shows the banner and the stored percentiles, and the banner clears after a restart.
- **Gate evidence end to end (e2e):**
  - The real `atlas-lab run ex-w01-log-levels` runs 8/8 hidden tests in Docker with no network and records `runner_result` on g-w01.
  - Tampered hashes and wrong test lists are refused (integration).
  - A learner socket call fails inside the container (pytest, Docker).
- **AT-04:** the route manifest covers all 39 routes; the cross-user matrix adds project, run, report and runner token.

### Failed, then fixed during P2 (not hidden)
- **CI found a last-bit float difference:** the Mann-Whitney p-value from `erfc` differed in the 17th digit on the runner's Python 3.12 build. The route test now compares to 1e-9, as the stats test already did.
- **Axe found three contrast or target problems:**
  - The per-run "JSON" links were smaller than 24×24 px.
  - Shiki's GitHub themes colour C comments and parameters below 4.5:1 (first seen on the W5 lesson, which has the first code comments); the colours are now replaced (D-66).
- **A JSON nesting attack crashed validation:** a 5,000-level `config` overflowed the stack inside Zod's refinements. Depth is now checked first, by a bounded function, before anything serialises the value.
- **Service image build broke:** the new atlas-lab workspace member was missing from the image context; the image now installs only api-py and worker-py (D-65).
- **Report Markdown was over-escaped:** `warm\-up`, `2026\-11\-18`. It now escapes only what forms Markdown syntax, with a test that link syntax stays dead.
- **Hidden skips:** in a full run the axe project-tab checks were *skipped* (6 tests), not passed, because the account-delete e2e test runs first and removes the project. They now create their own project. The account-delete test also stopped assuming an empty audit log (audit rows outlive the user by design).
- **Smaller fixes:**
  - `docker pull` contacted the registry even when the digest-pinned image was local; atlas-lab now pulls only if the image is missing, which also lets it work offline.
  - The sample-data checkbox only changed after the server answered; it now updates right away and reverts on error.

### Not done / limits (honest)
- **Only the W1 gate bundle exists.** Weeks 2-8 show "hidden tests not published yet" and need course graders (Q27).
- **Large runs (RR12):** runs above 100k samples per metric keep the first 100k in the database for compare and reports; the summary at upload uses all samples.
- **Compare speed:** it is synchronous with a 30 s timeout. Typical runs (≤ 10k samples) take under a second; 100k-sample runs take about 7 s.
- **Docker test skipped in the Python CI job:** the gate image isn't pulled there. The e2e job runs a real Docker gate.
- **Hidden tests readable by token (RR11):** a `tests:read` token can read the hidden tests.
- **Unverified sources:** four lesson sources stay unverified until the P3-core verification job runs.
- **Node 20 actions:** CI still warns about Node 20 actions (tracked).

### Mock data
- **In the product:** only the sample-data project, off by default, labelled SAMPLE DATA and excluded everywhere.
- **Test-only:** the mock GitHub OAuth server, labelled DB fixtures, and an HTTP stub for api-py in one integration test.

### What I need from you
1. Review of PR #3 (Node 24) and of the P2 PR.
2. Decisions **D-53…D-66** (PLAN §9), especially D-56 (sync compare, async CIs), D-57 (no uploads before pre-registration), D-60 (gate bundles) and D-61 (atlas-lab design).
3. **Q27:** run official course graders from your own clone. **Q28:** install atlas-lab from the repo, not PyPI.
4. "Go" for P3-core.

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

### Tested (local, 2026-11-17, and on GitHub CI)
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

**GitHub CI:** run [44027085773](https://github.com/harisonharold/AI-Learning-Path/actions/runs/44027085773) on `1fa56de` passed all four jobs, with every action pinned to a commit SHA. The run before it, 44025714721, failed one browser test; see below.

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
