# syntax=docker/dockerfile:1
# Worker image (pg-boss + Playwright). Build context = repo root:
#   docker build -f apps/worker/Dockerfile -t rivalmonday-worker .
# Railway builds it via apps/worker/railway.json; CI builds it and runs `pnpm --filter @cs/worker smoke:image` in it.

# --- 1. Prune the monorepo to @cs/worker and its workspace deps -------------------------------------------------
FROM node:24-bookworm-slim AS prune
WORKDIR /repo
RUN npm install -g turbo@2.11.5
COPY . .
RUN turbo prune @cs/worker --docker

# --- 2. Runtime ---------------------------------------------------------------------------------------------------
FROM node:24-bookworm-slim
ENV CI=true PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# pnpm matches the root package.json `packageManager`; installed globally so the non-root user needs no corepack download.
RUN npm install -g pnpm@10.17.0
WORKDIR /app

# Dependencies first (layer cache). The pruned lockfile keeps `pnpmfileChecksum`, and prune does not copy the root
# .pnpmfile.cjs, so the frozen install fails without this explicit copy.
COPY --from=prune /repo/out/json/ ./
COPY --from=prune /repo/.pnpmfile.cjs ./
RUN pnpm install --frozen-lockfile
# Chromium + its system libraries (apt, so as root), into PLAYWRIGHT_BROWSERS_PATH where the non-root user can read it.
RUN pnpm --filter @cs/collectors exec playwright install --with-deps chromium

# Sources. Every package tsconfig extends the root tsconfig.base.json, which prune does not copy (tsx reads it).
COPY --from=prune /repo/out/full/ ./
COPY --from=prune /repo/tsconfig.base.json ./
# Runtime config read from disk: the AI config (verticals packs are not read at runtime).
COPY packages/ai/config/ ./packages/ai/config/
# Sentry release stamp written by the deploy job; the glob makes it optional (package.json always matches).
COPY apps/worker/package.json apps/worker/.releas[e] ./apps/worker/

USER node
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
# node is PID 1 so SIGTERM reaches the worker's graceful pg-boss stop directly (Railway drains for 40 s).
WORKDIR /app/apps/worker
CMD ["node", "--import", "tsx", "src/main.ts"]
