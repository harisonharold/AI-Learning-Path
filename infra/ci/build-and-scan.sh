#!/bin/sh
# AT-03 end to end: build the web app with canary values in every secret variable, then scan .next/static.
set -eu
cd "$(dirname "$0")/../.."
c() { echo "canary-$1-$(node -e "process.stdout.write(require('node:crypto').randomBytes(12).toString('hex'))")"; }
export BETTER_AUTH_SECRET="$(c auth)" INTERNAL_HMAC_KEY="$(c hmac)" GITHUB_APP_CLIENT_SECRET="$(c ghsecret)"
export MYSQL_CANARY="$(c mysql)" REDIS_CANARY="$(c redis)"
export TOKEN_ENC_KEY="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))")"
export DATABASE_URL="mysql://atlas_app:${MYSQL_CANARY}@mysql:3306/atlas" REDIS_URL="redis://:${REDIS_CANARY}@redis:6379"
export GITHUB_APP_CLIENT_ID=Iv1.canary APP_ORIGIN=http://localhost:3000 SANDBOX_ORIGIN=http://127.0.0.1:3000 ALLOWED_GITHUB_USER_ID=1
export NEXT_TELEMETRY_DISABLED=1
pnpm --filter @atlas/web build >/dev/null
CANARY_VALUES="$BETTER_AUTH_SECRET,$INTERNAL_HMAC_KEY,$GITHUB_APP_CLIENT_SECRET,$MYSQL_CANARY,$REDIS_CANARY,$TOKEN_ENC_KEY" node infra/ci/scan-bundle.mjs apps/web/.next/static
