# NodeBeacon single-container image (ADR-0005).
# The Fastify API serves /api/* and hosts the built web bundle from apps/web/dist.
# Multi-stage: build the full pnpm workspace, then ship the built tree.

# ---- builder ----
FROM node:20-slim AS builder
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    CI=true
# Pin pnpm to the repo's version. (Latest pnpm 11 needs Node 22's node:sqlite.)
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

WORKDIR /app

# better-sqlite3 normally installs a prebuilt binary; keep the native toolchain
# available in the builder so a supported Node/platform can compile from source
# when a prebuild is temporarily unavailable.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Install against the committed lockfile. The .dockerignore keeps node_modules
# and build output out of the context so this is a clean, reproducible install.
COPY . .
RUN pnpm install --frozen-lockfile

# Build shared -> api -> web (tsc + vite). Web output lands in apps/web/dist,
# which the API serves at runtime. Remove incremental metadata first so stale
# host tsbuildinfo files cannot make TypeScript skip emit in Docker.
RUN find . -name '*.tsbuildinfo' -delete && pnpm build

# ---- runtime ----
FROM node:20-slim AS runtime
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=3001
WORKDIR /app

# Copy the whole built workspace. Preserving the apps/ + packages/ layout keeps
# the API's relative paths (../../web/dist, ../../../../config) and the pnpm
# node_modules symlinks intact.
COPY --from=builder /app /app

EXPOSE 3001
USER node

# Fastify /healthz doubles as the container liveness signal.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/server.js"]
