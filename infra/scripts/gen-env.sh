#!/bin/sh
# Writes .env with fresh random secrets if it does not exist. Never commit .env.
set -eu
cd "$(dirname "$0")/../.."
[ -f .env ] && { echo ".env exists; leaving it alone"; exit 0; }
rand() { node -e "process.stdout.write(require('node:crypto').randomBytes($1).toString('$2'))"; }
umask 077
cat > .env <<ENV
ATLAS_ENV=development
APP_ORIGIN=http://localhost:3000
SANDBOX_ORIGIN=http://127.0.0.1:3000
# Harison's GitHub numeric user id (owner of harisonharold/AI-Learning-Path, read from the GitHub API on 2026-11-16).
ALLOWED_GITHUB_USER_ID=123658133
MYSQL_ROOT_PASSWORD=$(rand 24 hex)
MYSQL_APP_PASSWORD=$(rand 24 hex)
MYSQL_MIGRATE_PASSWORD=$(rand 24 hex)
REDIS_PASSWORD=$(rand 24 hex)
BETTER_AUTH_SECRET=$(rand 32 base64url)
TOKEN_ENC_KEY=$(rand 32 base64)
INTERNAL_HMAC_KEY=$(rand 32 base64url)
# Fill these from your GitHub App (see /setup); leave empty to see the "not configured" page.
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
ENV
echo "wrote .env"
