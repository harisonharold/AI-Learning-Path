# Part A - Research Report

Checked 2026-11-16 (America/Toronto). Every resource named here is in `SOURCES.md` with its URL, venue/year, and for repos the licence and last-push date. Anything not verified is marked UNVERIFIED or left out.

## A.0 The honest summary first

- **4-6 months will not make you an expert.** It can take a learner with a 2-year diploma to *solid foundations plus 1-2 credible, public, measured projects and a few small merged open-source PRs*. Professional expertise in these fields takes years of production work.
- **The target companies hire mostly experienced people for these roles.** A live Databricks posting, "Senior Software Engineer, AI Runtime" (read 2026-11-16 via Greenhouse API), asks for "5+ years in large-scale distributed systems", FSDP/DeepSpeed/Megatron experience, and a BS in CS (MS/PhD preferred). Its 2027 intern posting lists Vancouver but requires graduating in fall 2027/spring 2028 with a CS degree. So the realistic first job after this program is a junior back-end, SRE, platform, or infra role, or an open-source-driven path. The platform must say this and must not promise interviews.
- **What does move a recruiter is public evidence**: merged PRs in known repos, reproducible benchmark reports, and a capstone with tests and a write-up. The platform is built around producing that evidence.

## A.1 The ten target fields: what is foundational vs advanced

| Field | Foundation you need first | Advanced core | Heavy prerequisites (math / engineering) | Feasible in 4-6 months? |
|---|---|---|---|---|
| Distributed systems | OS, networking, concurrency, Go | Raft, replication, consistency models, sharding, transactions | Proof-style reasoning (discrete math) | **Yes, to lab level** (MIT 6.5840 labs 1-4) |
| AI infrastructure | Python, Linux, HTTP, containers | Model serving, batching, KV cache, autoscaling | Transformer inference math | **Yes, to user/contributor level** |
| GPU computing & CUDA | C/C++, memory hierarchy, caches | Kernel optimization, profiling, roofline | Linear algebra, numerics | **Partly**: basics + one optimized kernel |
| HPC | C, parallel algorithms | MPI/collectives, NCCL, scaling | Performance modelling | **Intro only** |
| Distributed databases & storage | Data structures, OS I/O | Buffer pools, B+trees, LSM, MVCC, 2PC | Concurrency proofs | **Yes, BusTub-level** |
| Networking & low latency | Sockets, TCP, epoll | Kernel bypass, tail latency | Queueing theory, stats | **Intro + measurement skills** |
| Compilers & systems programming | C, assembly reading | IRs, MLIR/Triton compilers | Formal languages | **Exposure only** (via Triton) |
| ML systems | Python, NumPy, autograd | Parallelism (DP/TP/PP/FSDP) | Linear algebra, calculus | **Concepts + single/2-GPU experiments** |
| Inference optimization | Serving basics, profiling | Quantization, speculative decoding, disaggregation | Numerics, stats | **Yes, measurement-driven** |
| Cloud-native / Kubernetes | Linux, containers, networking | Controllers, scheduling, observability | None special | **Yes** (kind locally) |

**Most valuable specializations for this learner (ranked by evidence of demand x feasibility):** (1) LLM serving / inference systems, because the open-source ecosystem is very active (vLLM ~97k stars, last push 2026-11-16; SGLang ~39k; llm-d v1.0.0 released 2026-10-20; NVIDIA Dynamo v1.6.2) and much of it can be learned on 1 GPU or a CPU simulator (microsoft/vidur, MIT). (2) Distributed systems fundamentals, because every infra posting read asks for them (the CoreWeave Principal posting asks for consistency-model reasoning and multi-region operations). (3) GPU kernel performance, high value but the steepest; target "can optimize and profile a kernel", not "kernel expert".

## A.2 Primary language pathway (do not learn five languages at once)

1. **Python first (weeks 1+)**: PyTorch, vLLM, SGLang, Ray, FastAPI and most ML-systems code are Python-first.
2. **C next (weeks 2-5)**: memory, pointers, caches, OS labs (xv6 is C), sockets (Beej's guide).
3. **Go (from week 6-7)**: MIT 6.5840 labs and Fly.io Gossip Glomers docs are in Go; Kubernetes, etcd, Prometheus are Go.
4. **C++ / CUDA (from week 13-14)**: CUDA kernels; reading vLLM/FlashInfer/NCCL code.
5. **Rust (Research-Intensive mode only, late, optional)**: fundamentals only (TiKV, uv, ruff are Rust). Skip in Accelerated mode.

## A.3 Foundational resources (verified)

| Area | Primary resource | Why this one |
|---|---|---|
| Tooling | MIT Missing Semester | Shell, Git, debugging; free |
| Computer systems | CMU 15-213 + CS:APP 3e | Standard systems course; caches, memory, linking |
| Operating systems | OSTEP (free) + MIT 6.1810 xv6 labs (Fall 2026) | Concepts + real kernel labs |
| Concurrency/memory models | OSTEP concurrency chapters; Bornholt memory-models tutorial | Clear, free |
| Networking | Beej's Guide to Network Programming | Hands-on sockets |
| Databases | CMU 15-445/645 Fall 2026 + BusTub (MIT licence) | Best open DB-internals course. Its page says P1-P2 prohibit coding agents; we copy that rule. |
| Distributed systems | MIT 6.5840 Spring 2026 (Labs 1 MapReduce, 2 KV server, 3 Raft, 4 Fault-tolerant KV, 5 Sharded KV); Fly.io Gossip Glomers (6 challenges on Maelstrom, EPL-1.0); DDIA 2nd ed. (March 2026) | Labs with automated tests = objective grading |
| Parallel / GPU | Stanford CS149 (Fall 2025: CUDA circle renderer, "fastest CUDA kernels"); PMPP 4th ed.; CUDA Programming Guide + Best Practices (13.5); Nsight Systems/Compute docs; srush/GPU-Puzzles (MIT); Simon Boehm's matmul worklog | Theory + exercises + profiling |
| Triton | Triton tutorials (Triton v3.9.0); gpu-mode/Triton-Puzzles (Apache-2.0) | Python-level kernels |
| ML systems | CMU dlsyscourse.org; Stanford CS336; JAX "How To Scale Your Model"; HF Ultra-Scale Playbook; karpathy/nanoGPT, llm.c (MIT) | From autograd to parallelism |
| Production | Google SRE books (free); Kubernetes docs (v1.37.2); kind; Prometheus; OpenTelemetry; Jaeger; k6 (AGPL-3.0) | Standard stack |
| Math | MIT OCW 18.06 (linear algebra), 6.042J (math for CS), 6.041 (probability) | Free, complete |

## A.4 Research landscape: verified papers by topic

- **Consensus & replication:** Lamport 1978 (clocks); Paxos Made Simple (2001); Raft (USENIX ATC 2014); Dynamo (SOSP 2007); Spanner (OSDI 2012); GFS (SOSP 2003); MapReduce (OSDI 2004).
- **LLM serving:** Orca (OSDI 2022) introduced iteration-level scheduling; PagedAttention/vLLM (arXiv 2309.06180, SOSP 2023); SGLang/RadixAttention (2312.07104); SARATHI (2308.16369) and Sarathi-Serve (OSDI 2024); DistServe (OSDI 2024); Splitwise (2311.18677; ISCA 2024 per the Azure trace README); Mooncake (2407.00079); Llumnix (OSDI 2024); Preble (2407.00023); vAttention (ASPLOS 2025); LoongServe (2404.09526); Vidur simulator (2405.05465).
- **KV cache:** CacheGen (SIGCOMM 2024); CacheBlend (2405.16444); LMCache project.
- **Kernels/attention:** FlashAttention 1/2/3 (2205.14135, 2307.08691, 2407.08608); Triton (MAPL 2019); Ring Attention (2310.01889); Roofline (Berkeley TR EECS-2008-134).
- **Decoding/quantization:** Speculative decoding (ICML 2023); Medusa (2401.10774); GPTQ (ICLR 2023); AWQ (MLSys 2024 best paper); SmoothQuant (ICML 2023).
- **Training at scale:** Megatron-LM (1909.08053) and its SC 2021 follow-up (2104.04473); GPipe; ZeRO; GShard; PyTorch FSDP (2304.11277); Horovod; MegaScale (2402.15627, >10,000 GPUs); Llama 3 report (2407.21783); DeepSeek-V3 report (2412.19437) and "Insights into DeepSeek-V3" (ISCA 2025).
- **Energy:** Zeus (NSDI 2023); DynamoLLM (2408.00741; HPCA 2025 per the Azure trace README); ML.ENERGY leaderboard.
- **Workload traces:** BurstGPT (2401.17644); Azure/AzurePublicDataset (CC-BY-4.0). Its README lists Azure LLM Inference Traces from November 2023 (used in Splitwise, ISCA 2024) and May 2024 (used in DynamoLLM, HPCA 2025), plus GitHub Copilot coding-agent traces from June 2026; alibaba/clusterdata (no licence file reported by GitHub, so check terms before redistributing).

## A.5 Where real, documented open work exists (evidence dated)

These are the signals the research engine (Part F) uses. Full dossiers are in F.4.

| Signal | Evidence (date) | What it means |
|---|---|---|
| KV-cache offloading is under active design in vLLM | RFCs vllm#66782 (2026-11-10), vllm#66570 (2026-11-09), still open | Open engineering design space; high bar to contribute |
| KV sharing has security gaps | vllm#67692 "Unauthenticated P2P Offload Exposes Full CPU KV Cache" (open, 2026-11-14) | Documented open problem; security-sensitive |
| Cross-instance cache sharing in K8s serving | llm-d#3047 "CPU Cache Sharing" proposal (2026-11-09) | Engineering opportunity |
| Agentic workload cache management | sglang#50700 roadmap (2026-11-16) | Active roadmap item |
| Distributed training hangs are hard to diagnose | pytorch#196968 Flight Recorder misses a blocked rank (2026-09-14); torchft and nvidia-resiliency-ext exist | Documented open problem at scale |
| Benchmark reproducibility is weak even inside projects | LMCache#5402 "make flaky vllm_bench throughput comparisons reproducible" (2026-09-29); LMCache#6218 "Nothing catches a slowdown" (2026-10-31) | **Beginner-friendly and high value**: measurement work |
| Labels lie about difficulty | vllm#27433 "Batch Invariant Feature and Performance Optimization" and pytorch#188317 "[RFC] process group revoke" both carry `good first issue` | The platform must score difficulty itself |

## A.6 Open-source ecosystems: contribution reality check (2026-11-16)

| Project | Licence | Last push | Open "good first issue"-style label count | Notes |
|---|---|---|---|---|
| vLLM | Apache-2.0 | 2026-11-16 | 14 | Very active; docs/contributing page exists; huge PR volume = slow review |
| SGLang | Apache-2.0 | 2026-11-16 | 46 | Many kernel/model items |
| Ray | Apache-2.0 | 2026-11-16 | 70 (`good-first-issue`) | Best-structured beginner pipeline found |
| PyTorch | BSD-style | 2026-11-16 | 39 | Distributed docs issues exist (pytorch#121587) |
| Kubernetes | Apache-2.0 | 2026-11-16 | 6 | Contributor guide is excellent; CLA + SIG process |
| Triton | MIT | 2026-11-16 | 0 | Contribute via tutorials/bugs, not labels |
| Apache Arrow | Apache-2.0 | 2026-11-16 | 41 (`good-first-issue`) | Multi-language; good docs/test issues |
| Apache DataFusion | Apache-2.0 | 2026-11-16 | 25 | Rust; very welcoming SQL test work |
| TiDB | Apache-2.0 | 2026-11-16 | 55 | Go; MySQL compatibility issues |
| etcd / etcd-io/raft | Apache-2.0 | 2026-11-15 / 11-11 | 0 | Read for learning; contribute later |
| LMCache | Apache-2.0 | 2026-11-16 | 6 + onboarding tracker (LMCache#3372) | Small, KV-cache focused, explicit onboarding |
| llm-d | Apache-2.0 | 2026-11-16 | 0 | K8s-native serving; proposals open |
| CockroachDB | **CockroachDB Software License (source-available)** | 2026-11-11 | 0 | Read, but not an open-source contribution target |
| HF text-generation-inference | Apache-2.0 | **archived** (2026-03-21) | n/a | Do not target |

## A.7 Benchmarks and measurement sources

MLPerf Inference Datacenter (MLCommons, page shows v6.1); ML.ENERGY leaderboard; SemiAnalysis InferenceX (the old inferencemax URL now redirects there); vllm-project/guidellm (Apache-2.0) for load tests; nccl-tests (BSD-3) for collectives; k6 for HTTP. **No benchmark numbers from these are copied into this spec**: the platform should store links and let the learner reproduce numbers on their own hardware.

## A.8 What the research says about learning design

- Spaced repetition and retrieval practice: FSRS (open-spaced-repetition; `ts-fsrs` and `py-fsrs`, MIT, both pushed 2026-11-13) gives a maintained scheduler. The general claims come from the pages in SOURCES §4. The Dunlosky 2013 review could not be fetched and is not cited.
- **Mastery gating**: advancement is tied to passing objective tests (lab test suites, exams). MIT 6.5840 and BusTub already ship test suites, which is why they anchor the curriculum.
- AI-use policy: CMU 15-445 Fall 2026 bans coding agents on P1-P2. We adopt "no AI code generation on foundation labs; mentor may only ask questions" (Part C).
