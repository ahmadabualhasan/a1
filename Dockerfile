# syntax=docker/dockerfile:1.7
# CODEK production images (one Dockerfile, four targets):
#   docker build --target api     -t codek-api .
#   docker build --target worker  -t codek-worker .
#   docker build --target web     -t codek-web --build-arg API_INTERNAL_URL=http://api:4000 .
#   docker build --target migrate -t codek-migrate .   # one-off job: prisma migrate deploy + reference seed
# Pin the base image by digest in your registry mirror for reproducible builds (see docs/DEPLOYMENT.md).
# Builds behind a TLS-intercepting proxy can pass its CA without baking it into any layer:
#   docker build --secret id=extra_ca,src=/path/to/ca.pem …
ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo

# ── Dependencies (cached on the lockfile) ──
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc .pnpmfile.cjs ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY database/package.json database/
COPY packages/api-client/package.json packages/api-client/
COPY packages/config/package.json packages/config/
COPY packages/domain/package.json packages/domain/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/testing/package.json packages/testing/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm install --frozen-lockfile

# ── Build everything once ──
FROM deps AS build
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
COPY . .
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm db:generate && pnpm -r --workspace-concurrency=1 run build
# Self-contained production bundles for the Node services (workspace deps injected, dev deps pruned).
RUN --mount=type=cache,id=pnpm,target=/pnpm/store --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm --filter @codek/api deploy --prod --legacy /out/api && \
    pnpm --filter @codek/worker deploy --prod --legacy /out/worker && \
    pnpm --filter @codek/database deploy --legacy /out/database

# ── API ──
FROM ${NODE_IMAGE} AS api
ENV NODE_ENV=production API_PORT=4000
WORKDIR /app
COPY --from=build --chown=node:node /out/api /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

# ── Worker ──
FROM ${NODE_IMAGE} AS worker
ENV NODE_ENV=production WORKER_HEALTH_PORT=4100
WORKDIR /app
COPY --from=build --chown=node:node /out/worker /app
USER node
EXPOSE 4100
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.WORKER_HEALTH_PORT||4100)+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

# ── Web (Next.js standalone) ──
FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

# ── Migration job (Prisma CLI + migrations + compiled seed; run before rolling out api/worker) ──
FROM ${NODE_IMAGE} AS migrate
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/database /app
USER node
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/seed/run.js"]
