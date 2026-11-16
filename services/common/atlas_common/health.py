"""Tiny /healthz HTTP server for processes that have no web framework (worker-py)."""

from __future__ import annotations

import json
import threading
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def serve_health(port: int, service: str, check: Callable[[], dict[str, bool]]) -> ThreadingHTTPServer:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.path != "/healthz":
                self.send_response(404)
                self.end_headers()
                return
            checks = check()
            ok = all(checks.values())
            body = json.dumps({"service": service, "ok": ok, "checks": checks}).encode()
            self.send_response(200 if ok else 503)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: object) -> None:
            return

    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)  # noqa: S104 - container-internal port
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
