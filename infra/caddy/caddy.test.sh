#!/bin/sh
# X-02: through the production Caddyfile, /api/internal/* is 404 on the app host and the sandbox host serves only
# static /sandbox/* with no cookies. Needs the Compose stack running (network systems-atlas_internal).
set -eu
cd "$(dirname "$0")/../.."
NAME=atlas-caddy-test
docker rm -f $NAME >/dev/null 2>&1 || true
docker run -d --name $NAME --network systems-atlas_internal -p 127.0.0.1:8088:8080 \
  -e APP_HOST=http://app.test:8080 -e SANDBOX_HOST=http://sandbox.test:8080 -e APP_ORIGIN=http://app.test:8080 \
  -e SANDBOX_UPSTREAM_HOST=127.0.0.1:3000 \
  -v "$PWD/infra/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2.10-alpine >/dev/null
trap 'docker rm -f $NAME >/dev/null 2>&1' EXIT
for i in $(seq 1 30); do curl -s -o /dev/null -H "Host: app.test:8080" http://127.0.0.1:8088/api/healthz && break; sleep 1; done
fail=0
expect() { # name expected_status host method path [header_must_be_absent]
  out=$(curl -s -D - -o /dev/null -X "$4" -H "Host: $3" "http://127.0.0.1:8088$5")
  status=$(echo "$out" | head -1 | awk '{print $2}')
  if [ "$status" != "$2" ]; then echo "FAIL $1: expected $2 got $status"; fail=1; else echo "ok   $1 ($status)"; fi
  if [ -n "${6:-}" ] && echo "$out" | grep -qi "^$6:"; then echo "FAIL $1: unexpected $6 header"; fail=1; fi
}
expect "app: /api/internal/* blocked"            404 app.test:8080     POST /api/internal/jobs/00000000-0000-0000-0000-000000000000/result
expect "app: /api/healthz proxied to web"         200 app.test:8080     GET  /api/healthz
expect "app: /sandbox/* not served"               404 app.test:8080     GET  /sandbox/runner.html
expect "sandbox: runner page served, no cookies"  200 sandbox.test:8080 GET  /sandbox/runner.html set-cookie
expect "sandbox: self-hosted Pyodide served"      200 sandbox.test:8080 GET  /sandbox/pyodide/pyodide.mjs set-cookie
expect "sandbox: no /api"                         404 sandbox.test:8080 GET  /api/me
expect "sandbox: no app pages"                    404 sandbox.test:8080 GET  /today
csp=$(curl -s -D - -o /dev/null -H "Host: sandbox.test:8080" http://127.0.0.1:8088/sandbox/runner.html | grep -i '^content-security-policy')
echo "$csp" | grep -q "frame-ancestors http://app.test:8080" && echo "ok   sandbox: frame-ancestors = app origin" || { echo "FAIL sandbox CSP: $csp"; fail=1; }
[ $fail -eq 0 ] && echo "X-02 PASS" || { echo "X-02 FAIL"; exit 1; }
