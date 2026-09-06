# =============================================================================
# Trailhead Ledger — single-container build for Unraid
#
# One image, four supervised processes (supervisord):
#   postgres  — embedded PostgreSQL (data under /app/data/postgres)
#   db-init   — one-shot: createdb + drizzle push + admin seed
#   api       — Express API on 127.0.0.1:8080 (self-contained bundle)
#   nginx     — serves the Vite build on :80 and proxies /api -> :8080
#
# Only one port is exposed (80). SSL is handled by your reverse proxy.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1 — builder: full workspace toolchain. Produces runtime artifacts only.
# -----------------------------------------------------------------------------
FROM node:24-bookworm AS builder

RUN npm install -g pnpm@10

WORKDIR /app

# Workspace manifests + lockfile first so the dependency layer stays cached
# as long as the lockfile is unchanged.
COPY package.json .npmrc pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/web/package.json artifacts/web/
COPY lib/db/package.json lib/db/

RUN pnpm install --frozen-lockfile

# Source tree (heavy dirs excluded via .dockerignore).
COPY . .

# Build-time identity baked into /health.
ARG VERSION=dev
ARG GIT_SHA=dev
ENV VERSION=$VERSION GIT_SHA=$GIT_SHA

# Build the API (esbuild -> dist/index.mjs, db inlined) and the web bundle.
# Typechecking is skipped here — run it locally / in CI.
RUN pnpm --filter @scout-expense-tracker/api-server build \
  && pnpm --filter @scout-expense-tracker/web build

# Self-contained runtime deps:
#   /prod/api — api-server production node_modules (bundle externalizes npm pkgs)
#   /prod/db  — @scout-expense-tracker/db incl. devDeps so drizzle-kit is
#               available for the schema sync that runs at container boot.
# `--legacy` is required by pnpm v10 for workspace deploys.
RUN pnpm --filter @scout-expense-tracker/api-server deploy --legacy --prod /prod/api \
  && pnpm --filter @scout-expense-tracker/db deploy --legacy /prod/db

# -----------------------------------------------------------------------------
# Stage 2 — runtime: Node + embedded Postgres + Nginx + Supervisor + artifacts.
# -----------------------------------------------------------------------------
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       postgresql postgresql-client nginx supervisor sudo openssl curl \
  && rm -rf /var/lib/apt/lists/*

# Container runs as root; entrypoint drops privileges per-process (postgres
# runs as the `postgres` user via supervisord's `user=` directive).
USER root
WORKDIR /app

COPY --from=builder /prod/api/node_modules ./node_modules
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /app/artifacts/web/dist ./artifacts/web/dist
COPY --from=builder /prod/db ./db

# Source maps are dev-only — strip from the runtime image.
RUN rm -f ./artifacts/api-server/dist/*.map

COPY nginx.conf /etc/nginx/sites-available/default
RUN rm -f /etc/nginx/sites-enabled/default \
  && ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
COPY supervisord.conf /etc/supervisor/supervisord.conf
COPY entrypoint.sh db-init.sh api-start.sh /app/
RUN chmod +x /app/entrypoint.sh /app/db-init.sh /app/api-start.sh

ARG VERSION=dev
ARG GIT_SHA=dev
ENV NODE_ENV=production
ENV PORT=8080
ENV DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/scout_expense_tracker
ENV CORS_ORIGIN=*
ENV LOG_LEVEL=info
ENV VERSION=$VERSION GIT_SHA=$GIT_SHA

# One port in, everything behind Nginx.
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1/api/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
