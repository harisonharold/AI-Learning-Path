# syntax=docker/dockerfile:1
FROM node:24-alpine
WORKDIR /repo
ARG HTTPS_PROXY
ARG NO_PROXY
RUN --mount=type=secret,id=extra_ca sh -c \
  'if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca npm_config_cafile=/run/secrets/extra_ca; fi; corepack enable && corepack prepare pnpm@10.28.0 --activate'
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/worker-node/package.json apps/worker-node/
COPY apps/web/package.json apps/web/
COPY packages/ui/package.json packages/ui/
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=secret,id=extra_ca sh -c \
  'if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca npm_config_cafile=/run/secrets/extra_ca; fi; pnpm install --frozen-lockfile --prod --filter @atlas/worker-node'
COPY apps/worker-node/src apps/worker-node/src
RUN addgroup -S atlas && adduser -S atlas -G atlas
USER atlas
WORKDIR /repo/apps/worker-node
HEALTHCHECK --interval=5s --timeout=3s --retries=30 CMD wget -qO- http://127.0.0.1:8002/healthz >/dev/null || exit 1
CMD ["node", "src/main.ts"]
