# Part B - 16-Week and 24-Week Curricula

All resources are verified in `SOURCES.md` (checked 2026-11-16). Hardware tag per week: **CPU** = any laptop; **GPU-free** = Colab/Kaggle free tier or Modal's $30/month Starter credit is enough; **GPU-rent** = a few rented GPU-hours (cost estimates in Part C §C.9).

## B.0 Rules that apply to every week

1. **Competence gates, not hours.** A week is "complete" only when its *gate* passes: an automated test suite, an exam with a rubric, or a benchmark report that another person could re-run. Logged hours are shown but never unlock anything.
2. **Every week ships to GitHub**: code + tests + `REPORT.md` (the weekly engineering report template is in B.5).
3. **Retrieval and spacing**: every week starts with a 30-minute retrieval quiz drawn from *earlier* weeks, scheduled by FSRS (ts-fsrs). Cards are created from each week's "must-know" list.
4. **Remediation**: a failed gate opens a remediation track (B.6) for that skill; the next week's new material is locked for that skill's dependants only, so other tracks keep going.
5. **AI-use rule**: in foundation labs (weeks 1-12 of Research-Intensive mode) the AI mentor may ask questions and point at docs but must not write solution code. This mirrors CMU 15-445 Fall 2026, which prohibits coding agents on P1-P2.
6. **Honesty labels** on every artifact: `verified` (a test or measurement exists), `self-assessed`, or `AI-suggested`.

## B.1 Weekly hour budgets (20 / 30 / 40 / 50 hours)

The 24-week Research-Intensive (RI) plan is designed for ~40 h/week (~960 h). The 16-week Accelerated (ACC) plan is designed for ~50 h/week (~800 h) and drops content (marked "RI only"). At fewer hours the platform **stretches the calendar** instead of cutting gates:

| Hours/week | RI content takes | ACC content takes | Weekly split (theory / guided exercises / labs+debugging / perf experiments / reading+papers / retrieval+report) |
|---|---|---|---|
| 20 | ~48 weeks | ~40 weeks | 4 / 4 / 6 / 2 / 2 / 2 |
| 30 | ~32 weeks | ~27 weeks | 6 / 6 / 10 / 3 / 3 / 2 |
| 40 | 24 weeks | ~20 weeks | 8 / 7 / 14 / 4 / 4 / 3 |
| 50 | ~19 weeks | 16 weeks | 9 / 8 / 18 / 6 / 5 / 4 |

These are planning estimates, not measured data. The platform re-estimates from the learner's own logged time per completed gate after week 2.

**Example 40-hour week**: Mon-Fri, 7 h/day: 1 h retrieval + theory, 2 h guided exercises, 3 h lab, 1 h reading; Saturday 5 h: performance experiment + weekly report + exam/gate attempt. Sunday off (rest is part of the plan; spacing needs it).

## B.2 24-week Research-Intensive curriculum

Format per week: **Objectives / Prereqs / Theory / Math / Resources / Guided exercise / Lab / Debugging challenge / Performance experiment / Reading + paper analysis / Gate (assessment) / GitHub deliverable / Hardware**.

### Phase 1 - Foundations rebuilt (Weeks 1-8)

**Week 0 (before week 1, ~4 h): Diagnostic.** Timed tasks: Python function + tests, C pointer quiz, Big-O questions, a shell task, a probability question, read-a-stack-trace task. The results place the learner and may skip weeks 1-3 *only if* those weeks' gates are passed outright.

**W1 - Python, Git, Linux tooling**
- Objectives: write tested Python; use Git branches, rebase, bisect; navigate Linux.
- Prereqs: diploma-level programming.
- Theory: processes vs programs, files, pipes, environment, exit codes. Math: propositional logic, sets (6.042J L1-2).
- Resources: MIT Missing Semester (shell, Git, debugging lectures); Python Tutorial; uv for environments; ruff + pyright.
- Guided: implement a CLI log analyzer in Python with pytest at 90% branch coverage.
- Lab: `git bisect` to find a planted regression in a provided repo.
- Debugging: a script that is slow only on large inputs (profile with cProfile).
- Perf experiment: list vs dict vs set lookups at 10^3..10^7; plot; explain the curve.
- Reading: none research-level yet; read Effective Python-style docs for style.
- Gate: auto-graded test suite + 10-question retrieval quiz >= 80%.
- Deliverable: `w01-tooling/` with CI (GitHub Actions; free for public repos). Hardware: CPU.

**W2 - C and memory**
- Objectives: pointers, stack vs heap, malloc/free, undefined behaviour; use gdb, ASan, Valgrind.
- Theory: memory layout of a process; integer/float representation (CS:APP ch. 2). Math: binary arithmetic, two's complement, IEEE-754.
- Resources: CS:APP 3e ch. 2-3; 15-213 lectures; Beej's guide intro.
- Guided: implement a dynamic array and hash map in C with unit tests.
- Lab: write a simple arena allocator; compare with malloc on many small allocations.
- Debugging: given C program with a use-after-free and an off-by-one; find both with ASan.
- Perf: allocation microbenchmark; report median and p99 over 30 runs with CI (confidence interval).
- Gate: ASan/UBSan-clean test suite + oral-style written explanation of a memory bug (rubric).
- Deliverable: `w02-c-memory/`. Hardware: CPU.

**W3 - Computer architecture and CPU caches**
- Objectives: explain cache lines, locality, branch prediction, SIMD at a high level; measure them.
- Theory: memory hierarchy (CS:APP ch. 5-6). Math: arithmetic intensity, intro roofline (Williams et al., Berkeley TR 2008).
- Guided: matrix multiply in C: naive, loop-reordered, blocked.
- Lab: measure with `perf stat` (cache-misses, IPC); draw your CPU's roofline from measured peak bandwidth and FLOP/s.
- Debugging: false-sharing bug in a multithreaded counter.
- Perf: matmul variants vs size; place each on your roofline.
- Reading: Roofline tech report (sections 1-4). Paper-analysis template, first use.
- Gate: blocked matmul >= 3x naive at N=1024 *on the learner's own machine* (relative target, so it is hardware-independent) + correct roofline placement.
- Deliverable: `w03-caches/` with plots + REPORT.md. Hardware: CPU.

**W4 - Operating systems: processes, virtual memory, scheduling**
- Objectives: fork/exec/wait, signals, page tables, TLB, scheduling policies.
- Resources: OSTEP virtualization chapters; MIT 6.1810 (Fall 2026) xv6 labs "util" and "syscall"; xv6-riscv repo.
- Guided: write a mini shell with pipes and redirection.
- Lab: xv6 util + syscall labs (their graders are the gate).
- Debugging: zombie processes and a signal race in the provided shell.
- Perf: measure page-fault cost with mmap touch patterns (sequential vs random).
- Gate: xv6 lab graders pass + quiz on virtual memory.
- Deliverable: `w04-os/`. Hardware: CPU (QEMU).

**W5 - Concurrency**
- Objectives: threads, mutexes, condition variables, atomics, memory ordering, deadlock.
- Resources: OSTEP concurrency chapters; Bornholt memory-models tutorial.
- Guided: thread pool + bounded blocking queue in C (pthreads).
- Lab: implement a reader-writer lock and a spinlock; test with ThreadSanitizer.
- Debugging: a deadlock and a lost-wakeup bug.
- Perf: mutex vs spinlock vs atomic counter under 1-32 threads; explain the crossover.
- Gate (**practical exam: implement concurrency primitives**): hidden stress tests under TSan + written explanation of the memory-ordering choice.
- Deliverable: `w05-concurrency/`. Hardware: CPU.

**W6 - Networking and latency measurement**
- Objectives: TCP/IP, sockets, HTTP/1.1 vs 2, TLS basics, epoll; measure tail latency correctly.
- Resources: Beej's guide; tcpdump/ss; k6.
- Math: percentiles, histograms, why the mean misleads; bootstrap confidence intervals; coordinated omission (as a concept).
- Guided: epoll-based echo server in C.
- Lab: HTTP/1.1 server; load test with k6; report p50/p95/p99.
- Debugging: Nagle + delayed-ACK latency spike (reproduce, then fix with TCP_NODELAY).
- Perf: thread-per-connection vs epoll at 100-10,000 connections.
- Gate: server passes conformance tests; latency report has CIs and a stated method.
- Deliverable: `w06-net/`. Hardware: CPU.

**W7 - Go + data structures & algorithms refresh**
- Objectives: Go syntax, goroutines, channels, context; core DS&A (heaps, tries, graphs, DP) at interview level.
- Resources: A Tour of Go; Effective Go; Gossip Glomers challenges 1-3 (Echo, Unique ID, Broadcast) on Maelstrom.
- Guided: implement an LRU cache and a priority queue in Go with tests and `go test -race`.
- Lab: Gossip Glomers 1-3.
- Debugging: goroutine leak (find with pprof goroutine profile).
- Perf: broadcast message count vs latency trade-off (Maelstrom reports both).
- Gate: Maelstrom checks pass for 1-3 + 6 timed DS&A problems.
- Deliverable: `w07-go/`. Hardware: CPU.

**W8 - Database internals**
- Objectives: pages, buffer pool, B+tree, WAL, MVCC concepts.
- Resources: CMU 15-445 Fall 2026 lectures; BusTub (MIT licence) Project #1 (buffer pool). Follow the course's no-coding-agent rule for P1-P2.
- Guided: implement LRU-K replacer.
- Lab: BusTub P1.
- Debugging: a latch-ordering deadlock.
- Perf: buffer pool hit rate vs pool size on a scan + point-lookup mix.
- Reading: DDIA 2e chapter on storage and retrieval.
- Gate: BusTub P1 local tests + an explanation of eviction policy trade-offs (rubric).
- Deliverable: `w08-db/` (note: course policy may ask students not to publish solutions; keep the repo private if the course asks, and publish only the write-up). Hardware: CPU.

**Checkpoint exam 1 (end W8)**: "Diagnose a performance bottleneck" (given a slow service + flame graph + perf counters, find the cause and fix it). Rubric in Part H.

### Phase 2 - Distributed systems (Weeks 9-12)

**W9 - Time, failure, RPC, MapReduce**
- Theory: failure models, partial failure, RPC semantics, Lamport and vector clocks. Math: partial orders.
- Resources: Lamport 1978; MapReduce (OSDI 2004); GFS (SOSP 2003); MIT 6.5840 Lab 1 (MapReduce) and Lab 2 (Key/Value Server).
- Guided: implement vector clocks in Go with property-based tests.
- Lab: 6.5840 Labs 1-2. Gossip Glomers 4 (Grow-Only Counter).
- Debugging: at-most-once semantics bug under retried RPCs.
- Perf: MapReduce job time vs workers; explain the stragglers.
- Paper analysis: MapReduce (template B.5).
- Gate: lab test suites pass 20/20 runs (flakiness counts as failure).
- Deliverable: `w09-ds1/` (follow MIT's collaboration policy; publish write-ups, not lab solutions, if the course asks).

**W10 - Consensus: Raft**
- Resources: Raft paper (ATC 2014); raft.github.io; Paxos Made Simple; etcd-io/raft source (read only).
- Lab: 6.5840 Lab 3 (Raft), all parts.
- Debugging: a split-vote livelock and a log-matching bug (both planted in a provided Raft).
- Perf: election time vs election-timeout randomization range.
- Gate: Lab 3 tests pass 100 consecutive runs (script provided); written answer to "why must a leader only commit entries from its own term by counting replicas?"
- Hardware: CPU.

**W11 - Replication and consistency models**
- Theory: linearizability, sequential, causal, eventual; CAP and its limits; PACELC. Resources: Jepsen consistency map; DDIA 2e replication + consistency chapters; Dynamo (SOSP 2007).
- Lab: 6.5840 Lab 4 (fault-tolerant KV on Raft); Gossip Glomers 5 (Kafka-Style Log).
- Debugging: a stale-read bug that only shows under partition (use Maelstrom's nemesis).
- Perf: read latency for leader reads vs lease reads (design + measure in your KV).
- Gate (**exam: explain consistency trade-offs**): 5 scenario questions graded by rubric + a linearizability check on your KV history (porcupine, MIT).

**W12 - Sharding and distributed transactions**
- Theory: partitioning, rebalancing, 2PC, Spanner's TrueTime idea. Resources: Spanner (OSDI 2012); DDIA 2e transactions chapter.
- Lab: 6.5840 Lab 5 (Sharded KV) **or** Gossip Glomers 6 (Totally-Available Transactions) in ACC mode.
- Debugging (**exam: debug a broken distributed system**): a provided 3-node service with 3 planted bugs (lost write on failover, clock-based ordering error, retry storm); learner must find, fix, and add a regression test for each.
- Gate: exam pass >= 2/3 bugs fixed with tests + design doc defending one choice (rubric).

### Phase 3 - GPU and ML-systems foundations (Weeks 13-17)

**W13 - Linear algebra, numerics, tiny autograd**
- Math: matrix multiply cost, norms, gradients, chain rule (18.06 selected lectures; calculus refresh); floating-point error, fp16/bf16/fp8 ranges.
- Resources: dlsyscourse.org (autograd lectures); karpathy/nanoGPT (read).
- Guided: NumPy MLP with hand-written backprop and a gradient checker.
- Lab: count FLOPs and bytes for one transformer layer forward pass; compare to measured CPU time.
- Debugging: NaN loss caused by fp16 overflow (reproduce, fix with scaling).
- Gate: gradient check passes; FLOP-count worksheet within 5% of the reference solution.
- Hardware: CPU.

**W14 - GPU architecture and CUDA I**
- Theory: SMs, warps, SIMT, occupancy, global/shared/registers, coalescing, CPU-GPU synchronization, streams.
- Resources: CUDA Programming Guide; CUDA Best Practices Guide; PMPP 4e early chapters; srush/GPU-Puzzles; Stanford CS149 CUDA assignment.
- Guided: GPU-Puzzles (runs in a notebook).
- Lab: vector add, reduction (naive -> shared memory -> warp shuffle), with Nsight Systems timeline showing host/device sync.
- Debugging: a race in shared memory (use compute-sanitizer); an implicit sync that kills overlap.
- Perf: reduction variants; effective bandwidth vs the GPU's spec bandwidth.
- Gate: correctness tests + bandwidth report with method. Hardware: **GPU-free** (T4-class is enough).

**W15 - CUDA II: kernel optimization and roofline**
- Resources: Simon Boehm's matmul worklog; Nsight Compute Profiling Guide; CS149 "fastest CUDA kernels".
- Lab: SGEMM: naive -> coalesced -> shared-memory tiling -> register blocking.
- Gate (**exam: optimize a small GPU kernel**): reach >= 50% of cuBLAS on the *same GPU* at N=4096 (relative target), with an Nsight Compute screenshot explaining the limiting factor and a roofline placement.
- Hardware: GPU-free or ~2 h GPU-rent.

**W16 - Triton and PyTorch performance**
- Resources: Triton tutorials (vector add, fused softmax, matmul); Triton-Puzzles; FlashAttention paper (2205.14135).
- Lab: fused softmax in Triton vs PyTorch eager vs torch.compile; then a simplified FlashAttention forward in Triton (tests vs reference).
- Paper analysis: FlashAttention: explain IO-awareness with your own byte counts.
- Gate: Triton kernels pass tests vs PyTorch reference (atol stated); perf report.
- Hardware: GPU-free.

**W17 - Transformer inference fundamentals**
- Theory: prefill vs decode, KV cache size formula, why decode is memory-bound, TTFT/TPOT/ITL, batching.
- Resources: Orca (OSDI 2022); PagedAttention (SOSP 2023); JAX scaling book (inference chapter); llama.cpp (CPU).
- Guided: add a KV cache to a nanoGPT-style model; measure tokens/s with and without it on CPU.
- Lab: compute KV-cache memory for a given model config; verify against measured memory.
- Gate: KV-cache implementation matches no-cache outputs exactly (greedy); report on memory-bound decode with arithmetic-intensity math.
- Hardware: CPU.

### Phase 4 - AI infrastructure (Weeks 18-21)

**W18 - LLM serving systems**
- Theory: continuous batching, paged KV, prefix caching, chunked prefill, disaggregated prefill/decode.
- Resources: vLLM docs (architecture overview); SGLang paper; Sarathi-Serve and DistServe (OSDI 2024); microsoft/vidur simulator (MIT); vllm-project/guidellm.
- Lab A (CPU): use Vidur to compare scheduling policies on a BurstGPT or Azure trace.
- Lab B (GPU): run vLLM with a small model; sweep max batch tokens and chunked prefill; measure TTFT/TPOT p50/p99 with GuideLLM.
- Paper analysis: Sarathi-Serve vs DistServe: what each trades.
- Gate: report reproduces *the direction* of one published claim (e.g. chunked prefill reduces decode stalls) with your own numbers and a confounder list.
- Hardware: CPU + ~3 h GPU-rent (24 GB card is enough for a small model; estimate in Part C).

**W19 - Distributed training and GPU communication**
- Theory: data/tensor/pipeline parallelism, FSDP/ZeRO, all-reduce algorithms (ring/tree), overlap of compute and communication.
- Resources: Megatron-LM (1909.08053, 2104.04473); GPipe; ZeRO; PyTorch FSDP paper + FSDP2 tutorial; NCCL docs; nccl-tests; HF Ultra-Scale Playbook.
- Lab (CPU): torch.distributed with the gloo backend on 4 processes; implement ring all-reduce yourself and compare with the library.
- Lab (GPU, optional): nccl-tests on a 2-GPU rental.
- Debugging: a hang caused by mismatched collective order across ranks.
- Gate: your ring all-reduce passes correctness tests; cost model (alpha-beta) predicts measured time within a stated error.
- Hardware: CPU; optional 1 h 2-GPU rent.

**W20 - Production infrastructure**
- Resources: Kubernetes docs (v1.37); kind; Prometheus; OpenTelemetry; Jaeger; k6; Google SRE book (SLOs, monitoring, postmortems chapters).
- Lab: deploy your W11 KV store + a FastAPI front end on kind; Prometheus metrics, OTel traces into Jaeger; SLO + alert.
- Debugging (**exam: analyze distributed traces**): given a trace set from a provided 4-service app, identify the slow span and the retry amplification.
- Perf: k6 load test to find the knee of the latency curve.
- Gate: trace exam + working deployment reproducible from `make up`.
- Hardware: CPU.

**W21 - Inference optimization: quantization, speculative decoding, energy**
- Resources: GPTQ, AWQ, SmoothQuant; speculative decoding (ICML 2023); Medusa; vllm-project/llm-compressor; Zeus (NSDI 2023); ML.ENERGY leaderboard.
- Lab: quantize a small model (e.g. 8-bit/4-bit) and measure accuracy on a fixed eval subset + latency + memory.
- Perf: energy per token with `nvidia-smi`/Zeus where the rental allows power readings (confounder: many rentals do not allow clock control).
- Gate: Pareto chart (quality vs latency vs memory) with method and limitations.
- Hardware: ~3 h GPU-rent.

### Phase 5 - Research, contribution, capstone (Weeks 22-24)

**W22 - Research dossier + reproduction**
- Pick one dossier from Part F (default: F.4-1 scheduling or F.4-6 benchmark reproducibility).
- Reproduce one published result's *direction* (Vidur on CPU or vLLM on GPU), write the baseline.
- Gate (**exam: evaluate a research paper critically** + **reproduce published results**): rubric-graded critique + reproduction report with config hashes.

**W23 - Capstone build + first open-source PR**
- Capstone stages 1-3 (Part F §F.8). Submit one PR to a target repo **after the learner approves it in the platform**; the platform never submits it.
- Gate: capstone test suite + chaos test pass; PR opened (merge is not required to pass; merge is tracked separately).

**W24 - Publish and defend**
- Engineering report, blog post, portfolio page; mock interviews (system design + coding + "defend your design").
- Gate (**exam: defend engineering design decisions** + **design a fault-tolerant service**): 45-min recorded defense graded by rubric; system design doc.
- RI-only optional extra: Rust fundamentals (The Rust Book ch. 1-10) aimed at DataFusion/Arrow-rs issues.

## B.3 16-week Accelerated curriculum

Same gates, fewer labs. "Drop" = moved to optional.

| Wk | Topics (RI weeks merged) | Main lab / gate | Dropped vs RI | HW |
|---|---|---|---|---|
| 1 | Python, Git, Linux (W1) | Tested CLI + bisect lab | - | CPU |
| 2 | C, memory, caches (W2+W3) | Allocator + blocked matmul >= 3x naive | Arena perf study | CPU |
| 3 | OS + concurrency (W4+W5) | Mini shell + thread pool + RW lock under TSan | xv6 syscall lab | CPU |
| 4 | Networking + Go (W6+W7) | epoll server latency report; Gossip Glomers 1-3 | DS&A drill to optional | CPU |
| 5 | Database internals (W8) | BusTub P1 | - | CPU |
| 6 | Clocks, RPC, MapReduce (W9) | 6.5840 Labs 1-2 | Vector-clock exercise | CPU |
| 7 | Raft (W10) | 6.5840 Lab 3, 100 runs | Paxos reading | CPU |
| 8 | Replication, consistency, transactions (W11+W12) | Lab 4 + broken-system exam | Lab 5 (use Glomers 6 instead) | CPU |
| 9 | Numerics + GPU architecture (W13+W14) | Autograd + CUDA reduction | FLOP worksheet shortened | GPU-free |
| 10 | CUDA optimization + roofline (W15) | SGEMM >= 50% cuBLAS exam | - | GPU-free/rent |
| 11 | Triton + inference fundamentals (W16+W17) | Fused softmax + KV-cache nanoGPT | FlashAttention-in-Triton | GPU-free |
| 12 | Serving systems (W18) | Vidur + vLLM sweep report | - | CPU + GPU-rent |
| 13 | Distributed training + comms (W19) | Ring all-reduce on gloo | nccl-tests | CPU |
| 14 | Production infra (W20) | kind deploy + trace exam | - | CPU |
| 15 | Capstone stages 1-3 + PR prep (W22+W23) | Capstone tests + chaos test | Quantization week (W21) | CPU |
| 16 | Publish + defend (W24) | Report + design defense | Rust | CPU |

## B.4 Spaced repetition, retrieval and revision

- Each week defines 15-30 "must-know" cards (definitions, formulas like KV-cache bytes = 2 x layers x kv_heads x head_dim x tokens x bytes_per_elem, and "explain why" prompts).
- FSRS schedules them; target retention 0.9 (configurable).
- Weeks 6, 12, 18 and 24 open with a cumulative closed-book test; a score under 70% on any earlier skill opens remediation for that skill.
- Interleaving: the daily quiz mixes topics on purpose.

## B.5 Templates

**Weekly engineering report (`REPORT.md`)**: Goal - What I built (links) - Tests and how to run them - Measurements (table, method, hardware, N runs, CI) - What failed and why - What I would do next - Honesty labels per claim.

**Paper analysis**: Problem - Key idea in 3 sentences - Assumptions - Evaluation setup (hardware, workloads, baselines) - What is *not* shown - One experiment I could run to test a claim - Verdict with confidence (low/med/high) and why.

## B.6 Adaptive remediation

| Failed gate | Remediation track | Re-attempt rule |
|---|---|---|
| Concurrency exam | OSTEP chapter re-read + 3 extra primitive drills with TSan | After 48 h, new hidden test set |
| Raft 100-run test | Planted-bug Raft debugging set + log-reading drill | Any time; must pass 100 runs |
| Kernel exam | GPU-Puzzles remainder + Boehm worklog steps 1-3 | New matrix size |
| Paper critique | Two guided critiques with model answers revealed *after* submission | New paper |

Advanced milestones (W18+) stay locked until the W12 and W15 exams pass, whatever the hours logged.
