#!/bin/sh
# AT-01: from a fresh stack, every /healthz returns 200 within 120 s.
# Usage: infra/scripts/compose-smoke.sh [extra compose args...]   (expects the stack to be starting or up)
set -eu
cd "$(dirname "$0")/../.."
DC="docker compose --env-file .env -f infra/compose/compose.yaml $*"
deadline=$(( $(date +%s) + 120 ))
check() {
  svc=$1; url=$2
  # web: send the app host; 127.0.0.1:3000 is the dev SANDBOX_ORIGIN, which serves only /sandbox/*.
  $DC exec -T "$svc" sh -c "wget -qO- --header 'Host: localhost:3000' $url 2>/dev/null || python -c \"import urllib.request;print(urllib.request.urlopen('$url').read().decode())\" 2>/dev/null"
}
for pair in "web http://127.0.0.1:3000/healthz" "web http://127.0.0.1:3000/api/healthz" "worker-node http://127.0.0.1:8002/healthz" "api-py http://127.0.0.1:8000/healthz" "worker-py http://127.0.0.1:8001/healthz"; do
  set -- $pair
  until out=$(check "$1" "$2") && echo "$out" | grep -q '"ok": *true'; do
    [ "$(date +%s)" -lt "$deadline" ] || { echo "FAIL: $1 $2 not healthy within 120 s"; exit 1; }
    sleep 2
  done
  echo "ok  $1 $2 -> $out"
done
echo "AT-01 PASS: all /healthz 200 within 120 s"
