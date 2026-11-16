"""worker-py: consumes the `atlas-py` BullMQ queue (PLAN D-02 spike target)."""

from __future__ import annotations

import asyncio
import signal
from typing import Any

import httpx
import redis
from atlas_common.env import CommonEnv, load
from atlas_common.health import serve_health
from atlas_common.logging_json import log, register_secrets
from bullmq import Job, Worker  # pyright: ignore[reportMissingTypeStubs]

from worker_py.callback import post_result
from worker_py.handlers import handle

QUEUE = "atlas-py"


class Env(CommonEnv):
    WEB_INTERNAL_URL: str = "http://web:3000"
    HEALTH_PORT: int = 8001


async def run() -> None:
    env = load(Env)
    register_secrets([env.INTERNAL_HMAC_KEY])
    http = httpx.Client()
    ping = redis.Redis.from_url(env.REDIS_URL, socket_timeout=2)

    def check() -> dict[str, bool]:
        try:
            return {"redis": bool(ping.ping())}
        except redis.RedisError:
            return {"redis": False}

    serve_health(env.HEALTH_PORT, "worker-py", check)

    async def process(job: Job, _token: str) -> dict[str, Any]:
        data: dict[str, Any] = job.data  # pyright: ignore[reportUnknownMemberType]
        job_id = str(data["jobId"])
        attempts = int(job.attemptsMade) + 1  # pyright: ignore[reportUnknownArgumentType]
        max_attempts = int(job.opts.get("attempts", 1))  # pyright: ignore[reportUnknownArgumentType, reportUnknownMemberType]
        try:
            result = handle(str(data["kind"]), dict(data.get("input") or {}))
        except Exception as e:
            log("error", "job failed", job_id=job_id, error=str(e), attempt=attempts)
            if attempts >= max_attempts:
                body = {"status": "failed", "error": str(e)[:4000], "attempts": attempts}
                await asyncio.to_thread(post_result, http, env.WEB_INTERNAL_URL, env.INTERNAL_HMAC_KEY, job_id, body)
            raise
        res = await asyncio.to_thread(
            post_result,
            http,
            env.WEB_INTERNAL_URL,
            env.INTERNAL_HMAC_KEY,
            job_id,
            {"status": "done", "result": result, "attempts": attempts},
        )
        if res.status_code >= 400 and res.status_code != 409:
            raise RuntimeError(f"callback rejected with HTTP {res.status_code}")
        log("info", "job done", job_id=job_id, kind=data["kind"])
        return result

    # bullmq 3.6.1 annotates `processor` as returning Future; it awaits coroutines (verified by the spike).
    worker = Worker(QUEUE, process, {"connection": env.REDIS_URL, "concurrency": 4})  # pyright: ignore[reportArgumentType]
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)
    log("info", "worker-py started", queue=QUEUE)
    await stop.wait()
    await worker.close()  # pyright: ignore[reportUnknownMemberType]
    await asyncio.to_thread(http.close)


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
