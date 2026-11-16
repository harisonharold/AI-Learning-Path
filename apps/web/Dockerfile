# syntax=docker/dockerfile:1
# Optional: behind a TLS-intercepting proxy, pass HTTPS_PROXY as a build arg and the proxy CA as the
# BuildKit secret "extra_ca". Both are no-ops when absent and never end up in an image layer.
FROM node:22-alpine AS base
WORKDIR /repo
ARG HTTPS_PROXY
ARG NO_PROXY
RUN --mount=type=secret,id=extra_ca sh -c \
  'if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca npm_config_cafile=/run/secrets/extra_ca; fi; corepack enable && corepack prepare pnpm@10.28.0 --activate'

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/worker-node/package.json apps/worker-node/
COPY packages/ui/package.json packages/ui/
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=secret,id=extra_ca sh -c \
  'if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca npm_config_cafile=/run/secrets/extra_ca; fi; pnpm install --frozen-lockfile --filter @atlas/web...'

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @atlas/web build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 MIGRATIONS_DIR=/app/migrations
RUN addgroup -S atlas && adduser -S atlas -G atlas
COPY --from=build --chown=atlas:atlas /repo/apps/web/.next/standalone ./
COPY --from=build --chown=atlas:atlas /repo/apps/web/.next/static ./apps/web/.next/static
# Standalone output does not include public/; copy it (sandbox runner page lives there).
COPY --from=build --chown=atlas:atlas /repo/apps/web/public ./apps/web/public
COPY --from=build --chown=atlas:atlas /repo/apps/web/db/migrations ./migrations
USER atlas
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --retries=30 CMD wget -qO- --header "Host: localhost:3000" http://127.0.0.1:3000/api/healthz >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
