"""api-py: internal FastAPI compute service. Every route except /healthz requires an HMAC-signed request.
It holds no database credentials (single-writer rule, THREAT T-D4)."""

from typing import Any

import redis
from atlas_common import report, stats
from atlas_common.env import CommonEnv, load
from atlas_common.hmac_sig import NonceStore, RedisNonceStore, verify_request
from atlas_common.logging_json import log, register_secrets
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field


class Env(CommonEnv):
    pass


class Echo(BaseModel):
    message: str


class Metric(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    values: list[float] = Field(min_length=1, max_length=1_000_000)


class SummaryRequest(BaseModel):
    metrics: list[Metric] = Field(min_length=1, max_length=32)
    seed: int = stats.DEFAULT_SEED
    resamples: int = Field(default=stats.DEFAULT_RESAMPLES, ge=100, le=stats.MAX_RESAMPLES)


class CompareRequest(BaseModel):
    a: list[float] = Field(min_length=1, max_length=1_000_000)
    b: list[float] = Field(min_length=1, max_length=1_000_000)
    seed: int = stats.DEFAULT_SEED
    resamples: int = Field(default=stats.DEFAULT_RESAMPLES, ge=100, le=stats.MAX_RESAMPLES)


def create_app(env: Env | None = None, store: NonceStore | None = None) -> FastAPI:
    env = env or load(Env)
    register_secrets([env.INTERNAL_HMAC_KEY])
    client = redis.Redis.from_url(env.REDIS_URL, socket_timeout=2)
    nonce_store: NonceStore = store or RedisNonceStore(client)
    app = FastAPI(title="api-py", docs_url=None, redoc_url=None, openapi_url=None)

    async def signed(request: Request) -> bytes:
        body = await request.body()
        headers = {k.lower(): v for k, v in request.headers.items()}
        v = verify_request(env.INTERNAL_HMAC_KEY, nonce_store, request.method, request.url.path, headers, body)
        if not v.ok:
            log("warn", "signed request rejected", reason=v.reason, path=request.url.path)
            if v.reason == "nonce_store_unavailable":
                raise HTTPException(
                    503, {"code": "NONCE_STORE_UNAVAILABLE", "message": "Replay protection unavailable."}
                )
            raise HTTPException(
                401, {"code": "BAD_SIGNATURE", "message": "Request signature rejected.", "reason": v.reason}
            )
        return body

    @app.exception_handler(HTTPException)
    async def _err(_: Request, exc: HTTPException) -> JSONResponse:  # pyright: ignore[reportUnusedFunction]
        detail: Any = exc.detail
        if isinstance(detail, dict):
            d: dict[str, Any] = detail  # pyright: ignore[reportUnknownVariableType]
            payload = {"code": d.get("code"), "message": d.get("message"), "details": {"reason": d.get("reason")}}
        else:
            payload = {"code": "ERROR", "message": str(detail), "details": {}}
        return JSONResponse({"error": payload}, status_code=exc.status_code)

    @app.get("/healthz")
    def healthz() -> JSONResponse:  # pyright: ignore[reportUnusedFunction]
        try:
            ok = bool(client.ping())
        except redis.RedisError:
            ok = False
        return JSONResponse({"service": "api-py", "ok": ok, "checks": {"redis": ok}}, status_code=200 if ok else 503)

    @app.post("/diag/echo", dependencies=[Depends(signed)])
    def echo(payload: Echo) -> dict[str, str]:  # pyright: ignore[reportUnusedFunction]
        return {"echo": payload.message, "service": "api-py"}

    def bad_input(e: Exception) -> HTTPException:
        return HTTPException(422, {"code": "BAD_SAMPLES", "message": str(e)})

    @app.post("/stats/summary", dependencies=[Depends(signed)])
    def summary(req: SummaryRequest) -> dict[str, Any]:  # pyright: ignore[reportUnusedFunction]
        try:
            return {"metrics": {m.name: stats.summarize(m.values, req.seed, req.resamples) for m in req.metrics}}
        except stats.StatsInputError as e:
            raise bad_input(e) from e

    @app.post("/stats/compare", dependencies=[Depends(signed)])
    def compare(req: CompareRequest) -> dict[str, Any]:  # pyright: ignore[reportUnusedFunction]
        try:
            return stats.compare(req.a, req.b, req.seed, req.resamples)
        except stats.StatsInputError as e:
            raise bad_input(e) from e

    @app.post("/reports/render", dependencies=[Depends(signed)])
    def render(payload: dict[str, Any]) -> dict[str, Any]:  # pyright: ignore[reportUnusedFunction]
        try:
            return report.build(payload)
        except (KeyError, stats.StatsInputError) as e:
            raise bad_input(e) from e

    return app


def main() -> None:
    import uvicorn
    from atlas_common.telemetry import setup_tracing

    app = create_app()
    if setup_tracing("api-py"):
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        FastAPIInstrumentor.instrument_app(app, excluded_urls="healthz")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")  # noqa: S104 - container port


if __name__ == "__main__":
    main()
