# Spike: BullMQ with a Python worker (PLAN D-02)

**Result (2026-11-16): PASS. Keep BullMQ; the RQ fallback is not needed.**

Setup: Redis 7 (`redis:7-alpine`), Node producer using `bullmq` 6.7.6, Python consumer `services/worker-py`
using `bullmq` 3.6.1 (PyPI), callbacks verified with the TypeScript HMAC verifier (`apps/web/modules/platform/internal/hmac.ts`).

| Check | Result |
|---|---|
| Node enqueues `diag.echo` on `atlas-py`; Python worker processes it | `{"echo":"spike","worker":"worker-py"}` |
| Python signs the result callback; TS verifier accepts it | `{ ok: true }` |
| Unknown job kind with `attempts: 2` retries, then posts `failed` with `attempts: 2` | as expected |
| Byte-for-byte replay of the last callback | refused: `replayed` |
| Graceful shutdown on SIGTERM (`worker.close()`) | clean exit |

Known gap: `bullmq` 3.6.1's type hints declare the processor as returning a `Future`; it awaits coroutines correctly.
One `pyright: ignore[reportArgumentType]` covers it in `worker_py/main.py`.

Re-run: start Redis on 16379, run worker-py against it with `WEB_INTERNAL_URL=http://127.0.0.1:18080`, then
`node spikes/bullmq-py/spike.ts`. The same path is exercised end to end by `tests/e2e/jobs-roundtrip.spec.ts` (AT-05).
