# Part C - Product Requirements Document

Working name: **Systems Atlas** (rename freely). Single user first (Harison), designed so it could later host a few users. Sources: `SOURCES.md` (checked 2026-11-16).

## C.1 Problem and goal

A learner with a 2-year programming diploma wants to become credible in distributed systems / AI infrastructure / GPU systems in 4-6 months and leave a public, checkable trail of evidence. Existing options are link lists and video courses that advance you by time spent. This product advances you only on **demonstrated competence**, and turns work into **verifiable public evidence** (tests, benchmarks, PRs, reports).

**Non-goals:** no job guarantees, interview promises, or salary predictions; not a general chatbot; does not run CUDA in the browser; does not post to GitHub, LinkedIn or anywhere else without an explicit click-to-approve.

## C.2 Users and roles

| Role | Can |
|---|---|
| `learner` (owner) | Everything on own data |
| `reviewer` (optional, invited) | Read shared projects/reports, leave rubric scores and comments |
| `public` (anonymous) | Read only what the learner published to the portfolio |
| `admin` (same person, separate flag) | Settings, provider keys, budgets, data export/delete |

## C.3 Functional requirements

IDs are referenced by Part H acceptance tests.

### Learning core
- **FR-1 Diagnostic**: timed, auto-graded tasks (code tests + MCQ + short answers graded by rubric). Output: a skill map (per skill: `not started / developing / competent / verified`) and a recommended mode (ACC/RI) and hours plan.
- **FR-2 Roadmap**: dependency graph of skills and weeks (Part B). Nodes lock or unlock by gates, never by hours. Shows calendar re-estimate from the learner's actual pace.
- **FR-3 Daily workspace**: today's retrieval quiz (FSRS), today's tasks by hour budget, timer, notes, "stuck" button (opens mentor in Socratic mode).
- **FR-4 Lessons**: MDX content with runnable snippets, diagrams, a "must-know" card list, and a resource list where each resource shows its `verified_at` date and link status.
- **FR-5 Exercises**: (a) Python exercises run **in-browser via Pyodide** (WASM, no GPU); (b) C/Go/C++ exercises run via the **local runner** (FR-14) in Docker; (c) results are test-suite pass/fail with output, stored as `attempts`.
- **FR-6 Gates & exams**: each gate = objective tests and/or rubric. Rubric items carry evidence links. Advanced milestones require a passed gate *and* an evidence artifact (repo commit SHA, report, or recorded defense).
- **FR-7 Spaced repetition**: FSRS scheduler (ts-fsrs), card creation from lessons, cumulative tests at weeks 6/12/18/24 (RI).
- **FR-8 Remediation**: failed gate creates a remediation plan (Part B §B.6) and locks only dependent nodes.
- **FR-9 Progress analytics**: four separate meters that are never merged into one number: **learning progress**, **engineering proficiency**, **research quality**, **hiring readiness** (C.6).

### Research & lab
- **FR-10 Research discovery dashboard**: list of research directions (dossiers) with a **classification badge** (documented open problem / engineering optimization opportunity / unverified hypothesis / already solved / beginner-friendly contribution), the evidence list with dates, feasibility, and hardware needs. See Part F.
- **FR-11 Paper library**: import by arXiv id or DOI/URL; metadata fetched from arXiv API (or entered manually and flagged `unverified`); notes; paper-analysis template; links to repos; "cited by my projects".
- **FR-12 Research projects**: hypothesis, experiment plan, baselines, configs, runs, failures, conclusions, reproducibility checklist; report generator (Markdown/PDF) that only includes runs with stored raw data.
- **FR-13 Benchmark analytics**: upload JSON/CSV results (schema in Part D), compare runs, latency distributions (histogram, CDF, p50/p95/p99 with bootstrap CIs), throughput, memory, GPU utilization timelines, config diff between runs.
- **FR-14 Local runner (`atlas-lab` CLI)**: Python CLI the learner installs locally or on a rented GPU box. It runs exercises/benchmarks in Docker or directly, captures environment (CPU/GPU model, driver, CUDA, library versions, git SHA), and uploads results with a scoped API token. The browser never controls the GPU.
- **FR-15 Notebook integration**: export a project's experiment as a Jupyter notebook (nbformat); import results from a notebook cell via the same upload schema.
- **FR-16 Remote GPU guidance**: per-provider "how to run this experiment" pages with cost estimate, auto-shutdown script, and a pre-flight cost check (C.9). No provider API integration in v1.

### Open source
- **FR-17 GitHub connection**: sign in with GitHub; optional **GitHub App** install for repo-level read access (fine-grained permissions). Tokens encrypted at rest, server-side only.
- **FR-18 Repo explorer**: curated target list (vLLM, SGLang, Ray, PyTorch, Kubernetes, Triton, Arrow, DataFusion, TiDB, etcd, LMCache, llm-d) with licence, last push, open-issue counts, CONTRIBUTING link, CLA/DCO note; re-fetched on a schedule and on demand.
- **FR-19 Issue triage**: shows issues; computes the platform's own **difficulty estimate** from signals (files likely touched, discussion length, maintainer comments, linked PRs, labels) and shows *why*. Never trusts a `good first issue` label alone.
- **FR-20 Contribution checklist**: per issue: read CONTRIBUTING, reproduce, check for existing PRs, local build, tests, sign-off/CLA, draft PR description. A draft PR text is generated **for the learner to copy**; the platform never opens PRs, comments, or contacts maintainers.
- **FR-21 PR & review tracker**: tracks the learner's PRs (state, reviews, review comments count, time to first review, merged) via GitHub API.

### Mentor
- **FR-22 AI mentor (optional)**: modes: Socratic tutor, code reviewer, benchmark-method reviewer, paper explainer, debugger guide, mock interviewer, system-design critic. Behaviour rules in C.5.
- **FR-23 Interview simulator**: timed coding (graded by tests), system design (rubric), "defend your project" (rubric + recording), behavioural (self-review only).

### Career visibility
- **FR-24 Portfolio builder**: public pages generated from *verified* artifacts only: projects (README, tests badge, report), benchmark reports, merged PRs, paper summaries, blog posts.
- **FR-25 Portfolio quality checks**: objective checks on linked repos: README with run instructions, license, CI passing, tests present, reproducible benchmark script, issues/PR history.
- **FR-26 Writing helpers**: LinkedIn project summary, resume bullets, blog draft, all generated *from stored evidence*, each sentence linked to its evidence; anything without evidence is rejected. The learner copies them out; nothing is posted.
- **FR-27 Community/conference finder**: curated list (MLSys, OSDI, SOSP, NSDI, GPU MODE, project Slack/Discord links from official docs) with verified_at dates. No scraping of social networks.
- **FR-28 Presentation practice**: upload slides + record a talk locally; rubric self/peer review.

### Settings & ops
- **FR-29 Settings**: AI provider + model, monthly budget caps, GitHub connection, runner tokens, data export (JSON + Markdown) and full delete.
- **FR-30 Mock-data labelling**: any screen showing sample data shows a persistent "SAMPLE DATA" banner and the records carry `is_mock=true`; mock data is excluded from analytics, portfolio and reports.

## C.4 Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 Security | OWASP Top 10 and OWASP Top 10 for LLM Apps addressed in THREAT_MODEL.md; all secrets server-side; CSRF protection; rate limits; CSP; encrypted tokens (AES-256-GCM with key from env). |
| NFR-2 Privacy | Private by default; publishing is per item; export and delete available. |
| NFR-3 Accessibility | WCAG 2.2 AA; automated axe checks in CI; full keyboard use. |
| NFR-4 Performance | Dashboard LCP < 2.5 s on a mid laptop over broadband for a typical dataset (measured with Lighthouse in CI); benchmark charts handle 100k points (downsampled server-side). |
| NFR-5 Reliability | App usable when GitHub, AI provider or the Python service is down (graceful degradation with clear banners). Nightly DB backup + tested restore. |
| NFR-6 Cost | Runs at $0 locally; hard monthly caps on AI spend; no feature requires paid services. |
| NFR-7 Maintainability | One developer: modular monolith, typed boundaries, < 10 containers, docs for every module. |
| NFR-8 Truthfulness | Every external fact shown (paper, repo stat, price) carries a source URL and `verified_at`; stale (>30 days) facts show a warning. |
| NFR-9 Observability | Structured logs, OTel traces across Next.js -> FastAPI, error tracking (Sentry free tier optional). |
| NFR-10 Testability | Unit, integration, e2e, accessibility tests; coverage floor 80% for domain modules. |

## C.5 AI mentor behaviour spec

- **Socratic first**: on exercises, ask 1-3 guiding questions before any hint; hints come in levels (concept -> location -> pseudo-code). Full solutions for graded exercises are **never** shown before the gate is passed (enforced server-side by checking attempt state, not by prompt alone).
- **Foundation-lab rule**: in weeks marked "no AI code", the mentor cannot output code blocks longer than 3 lines (server-side filter).
- **Labels**: every mentor message is tagged `AI-generated`. Any claim about papers/benchmarks must cite a stored source; otherwise it is shown as "unverified suggestion".
- **Confidence indicator** for research claims: `high` = backed by >= 2 stored primary sources or the learner's own reproduced run; `medium` = 1 primary source; `low` = model reasoning only. The rule is computed from citations, not from the model's self-report.
- **Weakness tracking**: mentor writes structured observations (skill, evidence, date) that feed remediation; the learner can see and delete them.
- **Cost controls**: per-request token cap, daily and monthly USD caps, cheap model default, prompt caching where the provider supports it; when a cap is hit, mentor is disabled with a clear message.
- **Prompt-injection hygiene**: fetched content (issues, papers, READMEs) is passed as quoted data, never as instructions; mentor has no tools that write to GitHub or send messages.

## C.6 Scoring: four separate meters

No meter claims to be a recruiter's assessment. Each shows its formula and evidence.

| Meter | Computed from | Example rule |
|---|---|---|
| Learning progress | Gates passed / gates in mode; FSRS retention | 18/40 gates, retention 0.88 |
| Engineering proficiency | Objective artifacts: tests passing, CI green, exams passed, code-review findings resolved | Each exam passed = points; flaky tests subtract |
| Research quality | Reproducibility checklist completion, baselines present, CI on measurements, confounders listed, reviewer rubric | Report with no baseline caps at 40% |
| Hiring readiness | Evidence checklist only: >= 2 public projects passing FR-25 checks, >= 1 merged PR in a target repo, mock interviews passed, resume bullets backed by evidence | Shown as checklist, **not** a probability |

Disclaimer shown next to readiness: "This is a checklist of evidence, not a prediction of interviews or offers."

## C.7 Curriculum validation exams (rubrics summarized; full rubrics in Part H)

Debug broken distributed system (W12) · Explain consistency trade-offs (W11) · Implement concurrency primitives (W5) · Diagnose performance bottleneck (W8) · Optimize a small GPU kernel (W15) · Analyze distributed traces (W20) · Design fault-tolerant service (W24) · Evaluate a research paper critically (W22) · Reproduce published experimental results (W22) · Defend engineering design decisions (W24). Each has: objective tests where possible, a 4-level rubric (missing / partial / competent / strong) per criterion, and a required evidence artifact.

## C.8 Capstone requirement

See Part F §F.8: Open-source distributed AI inference and scheduling platform, staged, CPU-only MVP.

## C.9 Budget tiers (ALL ESTIMATES; prices read 2026-11-16 from the pages in SOURCES §6; re-check before paying)

| Tier | Hosting | Data | GPU | AI mentor | What you can do |
|---|---|---|---|---|---|
| **Free / near-free** | Everything local via Docker Compose; public portfolio as static export on GitHub Pages or Vercel Hobby ($0) | MySQL + Redis in Docker locally; Upstash Redis free (250 MB) if a hosted Redis is ever needed | Local CPU; Kaggle (~30 GPU-h/week, partially verified); Colab free (not guaranteed); Modal Starter $30/month free credits (~50 h of T4 at ~$0.59/h, or ~7.6 h of H100 at ~$3.95/h) | Off, or a small local model via llama.cpp (CPU, weaker) | All of weeks 1-13, 17, 19 (gloo), 20; CUDA weeks on free GPUs; Vidur simulations; capstone CPU MVP |
| **Under $25/month** | Hetzner Cloud from EUR 5.49/month excl. VAT (single VM running Compose) **or** Railway Hobby ($5 minimum usage) | MySQL in Compose on the VM (or Aiven MySQL Developer $5/month) | ~$10/month: e.g. ~20 h RTX 3090 on Runpod at ~$0.50/h, or ~37 h RTX A5000 at ~$0.27/h | ~$5/month cap; e.g. Claude Haiku 5.5 at $0.10 in / $0.50 out per MTok (prompts up to 100k tokens) | Hosted private app; vLLM experiments on a 24 GB card; quantization week |
| **Under $100/month** | Same VM (bigger plan) or Vercel Pro $20 + VM for FastAPI/MySQL/Redis | Managed MySQL (Aiven $5+) + backups | ~$50-60: e.g. ~25 h A100 SXM on Runpod at ~$2.19/h, or ~50 h L40S at ~$1.09/h; occasional H100 (Runpod H100 PCIe ~$2.89/h; Lambda 1x H100 SXM $4.89/h) | ~$15 cap; stronger model for paper explanation / design review | Multi-GPU nccl-tests (short rentals), larger-model serving, energy experiments |

**Experiments that need GPU hardware**: W14-W16 kernels (any recent NVIDIA GPU, free tier OK), W18 Lab B (24 GB+), W21 quantization (24 GB+), nccl-tests and tensor parallelism (2+ GPUs in one box), energy measurements (a host that exposes power readings; clock control is often blocked on rentals - UNVERIFIED per provider, test first), capstone stage 4.

**How to avoid surprise bills**
1. Set provider spend caps before first use: Modal workspace budget; Vercel spend management hard pause (new teams default to a $200 on-demand budget, so lower it); GitHub Actions blocks usage at the included amount when no payment method is on file.
2. Every GPU job runs with `timeout` + an auto-shutdown script (`atlas-lab` writes it) and a pre-flight estimate: `hours x hourly rate` shown before launch.
3. Prefer per-second billed providers (Runpod, Modal, Vast) for short runs; delete volumes after runs (storage can bill while pods are stopped - check the provider's page).
4. Keep repos public where possible: standard GitHub-hosted runners are free for public repos.
5. Mentor: hard daily and monthly caps in Settings; default to the cheapest model.
