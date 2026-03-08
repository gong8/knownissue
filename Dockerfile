# syntax=docker/dockerfile:1

# ---- Stage 1: Base image ----
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ---- Stage 2: Prune monorepo to only @knownissue/api + its deps ----
FROM base AS pruner
RUN pnpm add -g turbo@^2
COPY . .
RUN turbo prune @knownissue/api --docker

# ---- Stage 3: Install dependencies and build ----
FROM base AS builder

# Copy pruned package.json files + lockfile first (maximizes layer cache)
COPY --from=pruner /app/out/json/ .

# Install all deps (dev deps needed for build)
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy pruned source code
COPY --from=pruner /app/out/full/ .

# Generate Prisma client, then build all workspace packages
RUN pnpm --filter @knownissue/db db:generate
RUN pnpm turbo build --filter=@knownissue/api...

# ---- Stage 4: Production runtime ----
FROM node:22-alpine AS runner
RUN apk add --no-cache wget libc6-compat
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 hono

COPY --from=builder --chown=hono:nodejs /app .

USER hono
EXPOSE 3001

WORKDIR /app/apps/api

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "--import", "tsx", "dist/index.js"]
