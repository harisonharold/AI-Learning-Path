# Part F - Research Engine Specification

Evidence in this part was fetched 2026-11-16 (SOURCES §2, §3, §8). GitHub issue states change daily; the engine re-checks them before display.

## F.1 What the engine does

1. **Ingest sources** (arXiv API, GitHub REST API, URL fetch, manual entry).
2. **Verify** each source and stamp `verification` + `verified_at` + `verify_method`.
3. **Assemble dossiers** (20 fields) from verified sources only.
4. **Classify** each direction with one of five labels using explicit rules (F.3).
5. **Check novelty claims** before the learner calls anything new.
6. **Turn a dossier into a project** (hypothesis, baseline, method, metrics) and track runs.
7. **Support contributions** (issue triage with its own difficulty estimate, checklists, PR tracking, no automatic posting).

## F.2 Source verification pipeline

| Source type | Method | Stored fields | Verified when |
|---|---|---|---|
| arXiv paper | `GET export.arxiv.org/api/query?id_list=` | title, authors, first-version date, journal_ref/comment | API returns the entry and title matches |
| Venue (USENIX/ACM/etc.) | Fetch the venue's paper page | venue, year | Page returns 200 and title matches; if the publisher blocks bots, status = `partial` and venue is taken only from the arXiv comment or an official page |
| GitHub repo | `GET /repos/{owner}/{repo}` | licence SPDX, pushed_at, stars, archived, default branch | 200 response |
| GitHub issue | `GET /repos/{o}/{r}/issues/{n}` | state, labels, created/updated, comments, linked PRs | 200 response; re-checked at most daily |
| Course/doc page | HTTP GET + title | title, final URL after redirects | 200 + non-empty title not a captcha/"Access denied" page |
| Price page | Fetch + manual extraction | figure, unit, page date if shown | Always shown as "estimate, read on DATE" |
| Job posting | Public job-board APIs (e.g. Greenhouse `boards-api.greenhouse.io`) | title, requirements text, updated_at | 200; quoted, never paraphrased into stronger claims |

States: `verified` / `partial` (some fields unconfirmed) / `unverified` (manual entry) / `broken` (404 or blocked). Anything older than 30 days shows "stale, re-check". A nightly job re-verifies sources used in published items. **The engine never generates a citation**: an LLM can propose a search query, but only API-returned records become sources.

## F.3 Classification rules

| Label | Rule (all must hold) |
|---|---|
| **Documented open problem** | (a) A primary source (paper limitation section, maintainer RFC/issue, or official doc) says it is unresolved; (b) evidence dated within the last 12 months, or older evidence plus no closing fix found; (c) no merged solution referenced in the issue |
| **Engineering optimization opportunity** | Known technique exists; there is evidence (RFC, open issue, benchmark gap) that a specific system/config can still improve; success is measurable with an existing benchmark |
| **Unverified research hypothesis** | The learner's (or mentor's) idea; novelty check found no source testing it *or* only partial related work; always shown with "not yet tested" |
| **Already solved** | Published + implemented in mainstream systems (e.g. merged and documented); good for learning and reproduction, not for novelty |
| **Beginner-friendly contribution** | An issue the platform's estimator rates <= 2/5, with maintainer engagement in the last 90 days and no competing open PR. A `good first issue` label alone never qualifies |

**Novelty check (required before "unverified hypothesis" can be promoted):** arXiv API keyword search (title/abstract), GitHub issue search in the 3 most relevant repos, and the project's docs. The check log is stored and shown. Result can only be "no prior work found in these searches", never "novel".

**Difficulty estimator for issues (shown with reasons):** signals: estimated files/modules touched (from linked discussion and code search), presence of RFC/design discussion, number of maintainers involved, test infrastructure needed (GPU? multi-node?), age vs activity, existing PR attempts. Output 1-5 + reasons. Example from 2026-11-16: vllm#27433 "Batch Invariant Feature and Performance Optimization" carries `good first issue`, but spans kernels and performance across the engine, so the estimator should rate it high; pytorch#188317 "[RFC] Add process group revoke" also carries the label and is an RFC.

## F.4 Seed dossiers (13). Classification and dated evidence verified 2026-11-16

Fields per dossier, numbered as in the master prompt: 1 Problem · 2 Why it matters · 3 Existing approaches · 4 Papers · 5 OSS · 6 Evidence unresolved · 7 Prereqs · 8 Hardware · 9 Feasibility (1-5, 5 = easy) · 10 Difficulty (1-5) · 11 Hypothesis · 12 Method · 13 Baselines · 14 Metrics · 15 Confounders · 16 Reproducibility · 17 Contribution path · 18 Publication venue · 19 Risks · 20 Next experiment.

### F.4-1 Prefill/decode interference in LLM serving - **Engineering optimization opportunity**
1. Long prefills stall ongoing decodes, raising time-between-tokens. 2. Directly affects user-visible latency and goodput. 3. Chunked prefill (SARATHI, Sarathi-Serve), disaggregated prefill/decode (DistServe, Splitwise, Mooncake). 4. 2308.16369 (2023); Sarathi-Serve OSDI 2024; DistServe OSDI 2024; Splitwise ISCA 2024; Mooncake 2407.00079. 5. vLLM, SGLang, microsoft/sarathi-serve (Apache-2.0, pushed 2026-01-08), LLMServe/DistServe (pushed 2025-04-06), llm-d, NVIDIA Dynamo. 6. Core techniques are adopted; open questions are *when* to disaggregate vs chunk for a given workload. Evidence: llm-d (v1.0.0, 2026-10-20) and Dynamo (v1.6.2, 2026-11-05) are still actively shipping scheduling features; this is evidence of activity, not of a specific unsolved claim. 7. W17-W18. 8. CPU (Vidur simulator) for MVP; 1 GPU for validation. 9. 4. 10. 3. 11. "For bursty traces (BurstGPT), a chunk-size policy adapted to queue depth lowers p99 TBT vs a fixed chunk at equal throughput." 12. Simulate in Vidur on BurstGPT/Azure traces; then validate the direction on vLLM with GuideLLM on a small model. 13. Fixed chunk sizes; no chunking. 14. TTFT, TBT p50/p99, throughput, goodput at SLO. 15. Simulator fidelity, model size, GPU type, tokenizer, warm-up. 16. Trace version, seeds, config hash, Vidur commit. 17. Vidur docs/examples; GuideLLM scenarios. 18. Workshop papers or a blog report; not a main-track claim without real-cluster results. 19. Simulator results may not transfer. 20. Reproduce one Sarathi-Serve trend in Vidur.

### F.4-2 KV-cache offloading and tiering (GPU -> CPU -> SSD/remote) - **Engineering optimization opportunity**
1. KV cache exceeds GPU memory for long contexts/multi-turn; offloading trades bandwidth for capacity. 2. Cuts recompute, raises cache hit rates. 3. LMCache, Mooncake store, CacheGen compression, CacheBlend. 4. CacheGen (SIGCOMM 2024), CacheBlend 2405.16444, Mooncake 2407.00079. 5. LMCache (Apache-2.0, pushed 2026-11-16), kvcache-ai/Mooncake, vLLM OffloadingConnector. 6. vLLM RFCs still open: #66782 request-level KV promotions (created 2026-11-10), #66570 async CPU tier setup (2026-11-09); llm-d#3047 CPU cache sharing proposal (2026-11-09). 7. W17-W18 + OS (W4) + PCIe bandwidth basics. 8. 1 GPU with plenty of host RAM; CPU-only model possible for a cost model. 9. 3. 10. 4. 11. "A promotion policy that accounts for PCIe transfer time beats LRU on multi-turn traces." 12. Cost model first (bytes, bandwidth) -> simulate -> measure with LMCache + vLLM. 13. No offload; LRU offload. 14. Hit rate, TTFT, transfer bytes, host memory. 15. PCIe gen/topology of rented host, NUMA, page-locked memory. 16. Host topology captured by runner (`nvidia-smi topo -m`). 17. LMCache onboarding tracker (LMCache#3372). 18. Workshop / blog. 19. Moving target; RFCs may land first. 20. Build the cost model spreadsheet and check it against one LMCache run.

### F.4-3 Security of shared/offloaded KV cache - **Documented open problem**
1. Shared KV caches across peers can leak prompts if unauthenticated. 2. Multi-tenant privacy. 3. Authentication on transport, tenant isolation. 4. No paper verified for this specific issue. 5. vLLM. 6. vllm#67692 "Unauthenticated P2P Offload Exposes Full CPU KV Cache to Arbitrary Peers" (open, created 2026-11-14). 7. Networking (W6), threat modelling. 8. 1-2 GPUs or CPU-only repro if the path allows (UNVERIFIED). 9. 2. 10. 4. 11. n/a (security fix, not hypothesis). 12. Reproduce in an isolated lab network only. 13. n/a. 14. Exploit closed; overhead of auth. 15. -. 16. -. 17. Follow vLLM's SECURITY.md (exists in repo, checked 2026-11-16); **do not publish exploit details**; the platform links the policy and never posts. 18. n/a. 19. Ethics/legal: test only on own machines. 20. Read the issue and vLLM's SECURITY.md; write a threat model (no exploit code).

### F.4-4 Prefix-cache-aware routing across replicas - **Engineering optimization opportunity**
1. Routing requests to the replica that already holds their prefix vs balancing load. 2. Hit rate vs hotspot trade-off. 3. Preble, SGLang router, llm-d scheduler, Gateway API Inference Extension. 4. Preble 2407.00023 (2024); SGLang 2312.07104. 5. kubernetes-sigs/gateway-api-inference-extension (Apache-2.0, pushed 2026-11-09), llm-d, vllm-project/production-stack, AIBrix. 6. Active designs in several projects; no single standard policy (evidence: multiple competing implementations active in Nov 2026). 7. W18, W20. 8. CPU simulation for MVP; 2+ GPUs or a CPU-backed fake engine for system tests. 9. 4. 10. 3. 11. "A router mixing prefix affinity with queue-length penalty keeps >= 90% of the hit-rate gain of pure affinity while cutting p99 TTFT under skew." 12. Capstone router + fake engines with configurable cache; then real vLLM replicas. 13. Round robin, least-loaded, pure affinity. 14. Hit rate, TTFT p99, load imbalance. 15. Prefix distribution of the trace. 16. Trace + seeds. 17. Docs/benchmarks in gateway-api-inference-extension or production-stack. 18. Blog/workshop. 19. Results trace-dependent. 20. Capstone stage 2 (F.8).

### F.4-5 Continuous batching + paged KV memory - **Already solved** (learning/reproduction target)
1-3. Iteration-level scheduling (Orca, OSDI 2022) and PagedAttention (SOSP 2023) are standard in vLLM/SGLang; vAttention (ASPLOS 2025) offers an alternative memory design. 6. Solved for mainstream use. 9. 5. 10. 2. 12. Re-implement a toy continuous batcher + block allocator on CPU (capstone stage 1) and reproduce the qualitative throughput gain vs static batching. Use: learning and portfolio, not novelty.

### F.4-6 Benchmark reproducibility and performance-regression detection - **Beginner-friendly contribution**
1. Serving benchmarks are noisy; regressions slip through. 2. Every performance claim depends on it. 3. Repeated runs, CIs, pinned environments, CI perf gates. 4. Methodology, not a paper. 5. LMCache, vLLM benchmarks, GuideLLM. 6. LMCache#5402 "[good-first-issue] tests: make flaky vllm_bench throughput comparisons reproducible" (open, 2026-09-29); LMCache#6218 "[CI] Nothing catches a slowdown in the request transports" (open, 2026-10-31). 7. W6 stats, W1 testing. 8. CPU for stats tooling; GPU for real runs. 9. 5. 10. 2. 11. "Using >= N repeated runs with bootstrap CIs and warm-up exclusion makes the comparison stable at threshold X." 12. Measure run-to-run variance; propose test design; open PR **yourself**. 13. Current tests. 14. False positive/negative rate of the perf check. 15. Shared CI runners. 16. Scripts in PR. 17. Directly in those issues (check for existing PRs first). 18. Blog. 19. Maintainers may prefer another approach - ask in the issue first. 20. Read both issues and their comments; reproduce the flakiness locally.

### F.4-7 Phase-aware GPU power capping for energy per token - **Unverified research hypothesis**
1. Prefill is compute-bound, decode memory-bound; lower clocks/power in decode may save energy with little latency cost. 2. Energy cost of inference. 3. Zeus (NSDI 2023) for training energy; DynamoLLM (HPCA 2025) for inference cluster energy (reconfiguring instances, parallelism, frequency). 4. 2208.06102, 2408.00741; ML.ENERGY leaderboard. 5. ml-energy/zeus (Apache-2.0, pushed 2026-11-15). 6. Related work exists (DynamoLLM), so the learner's *specific* per-phase variant must pass the novelty check; until then: hypothesis. 7. W14, W17, W21. 8. A GPU where power limits/clocks can be set; many rentals do not allow it (UNVERIFIED per provider). 9. 2. 10. 4. 11. "Lowering power limit during decode-heavy periods reduces J/token by X% with < Y% TPOT increase." 12. Zeus measurement; sweep power limits; separate prefill/decode-heavy workloads. 13. Default power limit. 14. J/token, TPOT, TTFT. 15. Thermal state, other tenants, measurement API granularity. 16. GPU model, driver, power API. 17. Zeus docs/examples. 18. Workshop. 19. No permission to set limits on rented GPUs. 20. Check on a $0.27-0.50/h rental whether `nvidia-smi -pl` is permitted.

### F.4-8 Diagnosing hangs and failures in distributed training - **Documented open problem**
1. Collective hangs and rank failures waste large GPU time. 2. MegaScale (2402.15627) and the Llama 3 report (2407.21783) both describe failure handling at scale. 3. Flight recorders, watchdogs, fault-tolerant training (torchft), NVIDIA resiliency extension. 4. 2402.15627, 2407.21783. 5. meta-pytorch/torchft (pushed 2026-11-10), NVIDIA/nvidia-resiliency-ext (2026-11-15), PyTorch c10d. 6. pytorch#196968 "[c10d] Flight Recorder misses a rank blocked in legacy ProcessGroupNCCL teardown" (open, 2026-09-14); pytorch#155916 watchdog monitor error handling (open, 2025-06-13). 7. W5, W19. 8. CPU with gloo for simulated hangs; real NCCL needs >= 2 GPUs. 9. 2. 10. 4. 11. -. 12. Reproduce a mismatched-collective hang with gloo; study flight-recorder output. 13. -. 14. Time-to-detect, correctness of blame. 15. Backend differences gloo vs NCCL. 16. Scripts. 17. Docs issues like pytorch#121587 (clearer torch.distributed docs, good first issue, 2024-03-09) are the realistic entry. 18. -. 19. Real bugs need multi-GPU. 20. Build the gloo hang reproduction (W19 debugging challenge).

### F.4-9 Adaptive speculative decoding length - **Unverified research hypothesis**
1. Fixed draft length k wastes work when acceptance is low. 3. Speculative decoding (ICML 2023), Medusa (2401.10774); dynamic-k proposals. 6. vllm#54082 proposes entropy-gated dynamic k (open, 2026-08-27); no merged result verified. 8. 1 GPU. 9. 3. 10. 3. 11. "Dynamic k from draft entropy improves tokens/s over best fixed k on mixed prompts." 12. Measure acceptance vs entropy; compare to fixed k sweep. 14. Tokens/s, acceptance rate, output equivalence. 15. Draft/target pair choice. 19. May already be covered by existing vLLM spec-decode options; run the novelty check. 20. Read #54082 discussion and vLLM spec-decode docs.

### F.4-10 GPU-aware scheduling on Kubernetes - **Engineering optimization opportunity**
1. Gang scheduling, queueing, fair share and topology for GPU jobs. 3. Kueue, Volcano, KAI-Scheduler, Dynamic Resource Allocation (DRA). 5. kubernetes-sigs/kueue, volcano-sh/volcano, kai-scheduler/KAI-Scheduler, NVIDIA/k8s-device-plugin (all Apache-2.0, active Nov 2026); KEP #4381 "DRA: structured parameters" closed (updated 2026-04-21). 6. Multiple active schedulers with different policies = open engineering space, not a single open problem. 8. kind (CPU) for control-plane experiments; real GPUs for device behaviour. 9. 3. 10. 3. 12. Simulate queue policies with recorded job traces (Alibaba clusterdata: check its terms; no licence file reported by GitHub). 17. Docs/tests in Kueue/Volcano. 20. Run Kueue on kind with fake resources and compare two queueing policies.

### F.4-11 SQL engine correctness/compat work - **Beginner-friendly contribution**
5/6. apache/datafusion `good first issue` count 25 (e.g. #27239 rewrite regex error checks in sqllogictest, open 2026-11-08); pingcap/tidb 55 (e.g. #71059 `COMMIT AND CHAIN` not MySQL compatible, 2026-09-14); apache/arrow `good-first-issue` 41 (e.g. #55458 pytest numpy markers, 2026-11-09). 7. W8, Rust (DataFusion) or Go (TiDB). 8. CPU. 9. 5. 10. 1-2 (after estimator check). 17. Read CONTRIBUTING, comment to claim per project norms (learner does it), small PR. 20. Pick one with no open PR, reproduce locally.

### F.4-12 Kernel performance for specific shapes - **Engineering optimization opportunity** (plus reproduction)
3. FlashAttention 1/2/3, FlashInfer, Triton, TileLang, CUTLASS. 5. flashinfer-ai/flashinfer, Dao-AILab/flash-attention, tile-ai/tilelang, NVIDIA/cutlass (active Nov 2026). 6. sglang#2272 "[Kernel] cuDNN attention backend" is open with a good-first-issue label since 2024-11-30 (label-vs-difficulty caution applies). 8. 1 GPU. 9. 3. 10. 4. 11. Shape-specific Triton kernel beats the general one for a stated shape. 12. Boehm-style worklog + Nsight Compute. 14. TFLOP/s, % of peak, % of cuBLAS. 15. Clocks, GPU model, compile flags. 20. W15 exam kernel, then one Triton variant.

### F.4-13 Collective communication overhead at multi-node scale - **Engineering optimization opportunity (low feasibility)**
4. DeepSeek-V3 report (2412.19437) and "Insights into DeepSeek-V3" (ISCA 2025) discuss interconnect limits. 5. NVIDIA/nccl, nccl-tests, ai-dynamo/nixl. 8. Multi-node GPUs (expensive). 9. 1. 10. 5. Use: reading + alpha-beta modelling + single-node nccl-tests only. 20. Model ring vs tree all-reduce and compare to nccl-tests on one 2-GPU rental.

## F.5 Experimental methodology standard (enforced by the lab)

- Pre-register: hypothesis, primary metric, baseline, stopping rule, before running (stored with timestamp).
- Environment captured automatically by `atlas-lab` (hardware, driver, CUDA, libraries, git SHA, container digest, `nvidia-smi topo -m` if GPU).
- Warm-up runs excluded and declared; >= 5 repetitions per config by default (configurable); report median + p95/p99 + bootstrap 95% CI; show raw distributions.
- Change one variable at a time; config diff shown on every comparison.
- Confounder checklist: hardware differences, clocks/thermal, background load, cache state, dataset/trace version, tokenizer, random seeds.
- Failed runs are kept and shown (status `failed`, reason); a report can't hide them.
- Report generator refuses to output "X% faster" without a baseline in the same environment.

## F.6 Benchmark tracking

Runs -> metrics (summary + samples) -> comparisons. Regression alerts: if a project's tracked metric worsens beyond its CI vs the pinned baseline, the dashboard flags it. Public reports include the raw data download and the exact command.

## F.7 Open-source contribution workflow

1. Pick repo (licence and activity shown; archived repos hidden; source-available repos like CockroachDB labelled "not open source").
2. Triage issues with estimator; check for linked/open PRs.
3. Checklist: read CONTRIBUTING + code of conduct; CLA/DCO requirement; reproduce; write failing test; implement; run project's lint/tests; write PR description (template generated for copy).
4. **Learner opens the PR and writes any comments themselves.** The platform has no write permission to GitHub.
5. Tracker follows state, reviews, time to first review, merge; merged PRs become portfolio evidence automatically (verified by API).

## F.8 Capstone: open-source distributed AI inference and scheduling platform ("minisched")

Goal: a small, well-tested system that demonstrates scheduling, batching, routing, fault tolerance and observability. Not a vLLM/Kubernetes clone: real engines plug in behind an interface.

| Stage | Scope | Hardware | Done when |
|---|---|---|---|
| 0 Design | Design doc: components, failure model, SLOs, metrics, benchmark plan | - | Reviewed against rubric |
| 1 CPU MVP | Go or Python: gateway, scheduler, N **fake engine** workers that model prefill/decode time and KV-block memory from a config; continuous batching; block allocator | CPU | Unit + property tests; deterministic sim mode; throughput vs static batching reproduced qualitatively |
| 2 Routing + cache awareness | Router policies: round robin, least-loaded, prefix-affinity, affinity+queue penalty (F.4-4) | CPU | Benchmark harness replays BurstGPT/Azure traces; report with CIs |
| 3 Fault tolerance + observability | Worker heartbeats/failure detection, request retry with idempotency keys, drain; Prometheus metrics, OTel traces; chaos tests (kill workers, add latency) | CPU, kind | Chaos suite passes; no lost or duplicated completions; traces show retries |
| 4 Real engines | Adapter to vLLM/SGLang OpenAI-compatible servers or llama.cpp; GPU-aware placement by free memory | 1-2 GPUs (rent) or llama.cpp CPU | Same benchmarks on real engines; sim-vs-real gap reported |
| 5 Publish | README, architecture doc, benchmark methodology, engineering report, blog | - | External person reproduces one result from README |

Test coverage target >= 80% on scheduler/router packages. The report must list what the system does **not** do.
