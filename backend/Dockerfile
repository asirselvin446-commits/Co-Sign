# syntax=docker/dockerfile:1.7
# Build context: repository root (docker build -f backend/Dockerfile .)

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /app

# Full dependency install for building backend and dashboard.
FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json backend/
COPY backend/prisma backend/prisma
COPY dashboard/package.json dashboard/
RUN pnpm install --frozen-lockfile
COPY shared shared
COPY backend backend
COPY dashboard dashboard
RUN pnpm --filter @co-sign/dashboard build && pnpm --filter @co-sign/backend build

# Production-only dependencies for the backend.
FROM base AS prod-deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json backend/
COPY backend/prisma backend/prisma
COPY dashboard/package.json dashboard/
RUN pnpm install --frozen-lockfile --prod --filter @co-sign/backend

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=8080 DASHBOARD_DIST=/app/dashboard/dist
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/backend/node_modules ./backend/node_modules
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
COPY --from=build --chown=node:node /app/backend/prisma ./backend/prisma
COPY --from=build --chown=node:node /app/backend/package.json ./backend/package.json
COPY --from=build --chown=node:node /app/dashboard/dist ./dashboard/dist
COPY --chown=node:node backend/docker-entrypoint.sh ./backend/docker-entrypoint.sh
USER node
WORKDIR /app/backend
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "sh", "./docker-entrypoint.sh"]
