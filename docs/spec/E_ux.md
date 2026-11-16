# Part E - User Experience Specification

## E.1 Visual direction

**Concept: "lab notebook meets oscilloscope."** Calm, precise, data-first. Not a course template: no hero banners, stock photos, or cartoon badges.

- **Type**: a humanist serif for headings and long reading (e.g. Source Serif 4), a neutral sans for UI (e.g. Inter), a monospace for code and numbers (e.g. JetBrains Mono). Numbers in tables use tabular figures. (Font licences: confirm SIL OFL for each before shipping - UNVERIFIED here.)
- **Colour**: near-black ink on warm off-white (light); deep graphite with phosphor-green and amber accents (dark). Semantic colours: `verified` green, `self-assessed` blue, `AI-suggested` violet, `mock` striped amber, `stale source` orange. Every colour signal is paired with an icon + text (never colour alone).
- **Grid**: 12-column, 8 px spacing scale, max reading width 72ch.
- **Motion**: 150-250 ms ease-out for state changes; diagrams animate data flow only on hover/step; `prefers-reduced-motion` disables all non-essential motion.
- **Charts**: ECharts with a shared theme; always show n, units, method, and CI where relevant; log-scale toggle for latency.
- **Easter eggs (subtle, never in the way)**: the 404 page is a "lost packet" trace with a working `traceroute`-style animation; typing `:raft` in the command palette plays a 5-second leader election in the logo; a hidden "Byzantine mode" theme after passing the W12 exam.

## E.2 Navigation

- Left rail (collapsible): Today · Roadmap · Learn · Lab · Research · Open Source · Mentor · Interview · Portfolio · Analytics · Settings.
- **Progressive disclosure**: Research, Open Source and the advanced Lab tabs show "Unlocks after gate W8/W12" until earned, with a preview. Learners can peek but not start.
- Command palette `Ctrl/Cmd+K` for everything (pages, lessons, papers, commands).
- Keyboard shortcuts: `g t` Today, `g r` Roadmap, `g l` Lab, `/` search, `n` new note, `?` shortcut sheet, `j/k` next/prev item in lists, `1-4` card ratings in review, `Esc` close.

## E.3 Page-by-page

**1. Dashboard (`/today` doubles as dashboard)**: top strip: four meters (learning / engineering / research / hiring-readiness checklist) each with "how computed" popover. Main: today's plan sized to the hours budget; due cards count; current gate with "what's needed to pass"; latest benchmark run; open PRs status; budget gauges (AI spend, GPU estimate). Empty state for day 1: one button "Take the diagnostic (about 4 h, can pause)".

**2. Diagnostic**: one task per screen, timer, autosave, "I don't know" button (better data than guessing). Result page: skill map heatmap, recommended mode + calendar for chosen hours, the weeks that can be skipped and the gates that prove it.

**3. Roadmap**: React Flow graph of skills/weeks; nodes coloured by state; click opens the week. Toggle: graph / timeline (Gantt-like by calendar estimate) / list. Shows "re-estimated finish date" from actual pace with the formula.

**4. Daily workspace**: split view: left task list with timers; right active item (lesson, exercise, lab). Retrieval quiz first (blocking, 10-15 min). "Stuck" opens mentor in Socratic mode pinned to the current item.

**5. Lesson viewer**: MDX article, sticky outline, inline runnable Python (Pyodide), diagrams, "must-know" cards at the end (add to deck), resource list with verified dates and link status, "report a broken link".

**6. Coding exercises**: Monaco editor, test panel, run button. Python runs in browser. C/Go/C++ shows the `atlas-lab run <exercise-id>` command and streams results when the runner uploads. Hint ladder (3 levels) with an honest counter "hints used" stored on the attempt.

**7. Systems architecture laboratory**: canvas where the learner builds a system diagram from components (client, LB, service, queue, DB, cache, GPU worker). Each component has parameters (latency distribution, capacity, failure rate). "Simulate" sends it to `api-py /sim` (discrete-event, CPU) and plots throughput/latency/queue depth; "inject failure" toggles. Clearly labelled "simulation, not a real system".

**8. Research discovery dashboard**: cards per dossier with the classification badge, difficulty (1-5), feasibility (1-5), hardware tag, evidence count, newest evidence date, "stale" warning if no evidence re-checked in 30 days. Filters by field/classification/hardware. Detail page shows the 20 dossier fields with sources inline.

**9. Research project workspace**: tabs: Hypothesis · Plan · Configs · Runs · Compare · Failures · Reproducibility checklist · Report. Runs table shows env fingerprint; baseline pinned at top. "Generate report" is disabled until a baseline and >= 3 runs per config exist (button explains why).

**10. Paper library**: table (title, venue, year, verification badge, my status: to-read / read / analysed), FULLTEXT search, detail with abstract, my notes, analysis template, linked dossiers/projects.

**11. Benchmark analytics**: pick runs -> overlaid CDF, histogram, box plots, p50/p95/p99 table with bootstrap CIs, throughput over time, memory, GPU util/power timeline, config diff (JSON diff), environment diff (highlights a driver/GPU mismatch as a confounder warning).

**12. GitHub contribution tracker**: target repos list (licence, last push, archived flag, CLA/DCO note); issue triage view with the platform's difficulty estimate + reasons + "label says good first issue" shown separately; per-issue checklist; my PRs board (preparing / opened by me / in review / merged / closed). Prominent note: "Atlas never posts to GitHub. Copy the draft and open the PR yourself."

**13. AI mentor**: chat with mode selector; every assistant message tagged "AI-generated"; citations rendered as source chips with verification badges; confidence pill for research claims with "why this level"; budget meter; "Show hint level N" controls instead of "give me the answer".

**14. Interview simulator**: choose type; timer; coding uses exercise engine with hidden tests; system design uses whiteboard canvas + rubric; "defend your project" records audio/video locally (browser MediaRecorder; file stays local unless the learner uploads it) and scores with rubric; history of attempts.

**15. Portfolio builder**: list of eligible artifacts (only verified ones are selectable); quality-check results per project (README, licence, CI, tests, reproducible benchmark script); preview of the public page; publish toggles per item; writing helpers (LinkedIn summary / resume bullets / blog draft) where each sentence links to evidence, plus a copy button. No post or share buttons to external sites.

**16. Progress analytics**: the four meters over time, gate pass history, time per gate (actual vs estimate), FSRS retention curve, weakness list (from mentor + failed gates), remediation status.

**17. Settings & integrations**: profile, mode and hours, GitHub (sign-in + App install status, permissions listed), AI provider (key input write-only, model, daily/monthly caps), runner tokens (create/revoke, scopes), budgets, data export/delete, jobs log, "sample data" toggle (off in production by default).

## E.4 States every page must handle

Loading (skeletons, not spinners, for > 300 ms), empty (one clear next action), error (what failed + retry + whether data is safe), offline (read-only cached view), mock (persistent amber "SAMPLE DATA" banner), locked (what gate unlocks it).

## E.5 Accessibility (WCAG 2.2 AA)

- All interactive elements reachable and operable by keyboard; visible focus ring (>= 3:1 contrast); skip-to-content link.
- Charts: every chart has a data-table toggle and a text summary ("p99 rose from X to Y ms between run A and B").
- Diagrams: React Flow graphs have a list view equivalent; nodes are focusable with names.
- Colour contrast >= 4.5:1 text, >= 3:1 UI components, in both themes.
- Forms: labels, inline errors linked with `aria-describedby`; no time limits except exams, where the timer can be paused for accessibility settings.
- Target size >= 24x24 px (WCAG 2.2 SC 2.5.8).
- Automated axe checks per page in CI + a manual screen-reader pass (NVDA or VoiceOver) per release.
