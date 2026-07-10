# Tyche — single-container self-host image.
# Builds the web app for same-origin serving and runs the API with
# TYCHE_SERVE_WEB pointed at the built assets. Mock mode works with no keys;
# real providers activate via env (SEC_EDGAR_USER_AGENT, FRED_API_KEY, …).
FROM node:22-alpine

WORKDIR /app
RUN corepack enable

# Install with the lockfile first for layer caching.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/analytics/package.json packages/analytics/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/data-adapters/package.json packages/data-adapters/package.json
COPY packages/module-sdk/package.json packages/module-sdk/package.json
COPY packages/terminal-kernel/package.json packages/terminal-kernel/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

COPY . .
# Empty base URL = same-origin API calls from the served bundle.
RUN VITE_API_BASE_URL= VITE_DEMO_WORKSPACE=1 pnpm build

# Version reported by /api/health. The CMD below runs tsx directly (not via
# pnpm), so npm_package_version isn't set — surface it explicitly. Release
# builds can override: --build-arg TYCHE_VERSION=<tag>.
ARG TYCHE_VERSION=0.1.0
ENV API_HOST=0.0.0.0 \
    API_PORT=4010 \
    TYCHE_VERSION=${TYCHE_VERSION} \
    TYCHE_SERVE_WEB=/app/apps/web/dist \
    TYCHE_DATA_DIR=/app/data
VOLUME /app/data
EXPOSE 4010
# Container liveness for `docker`/compose (drives compose `service_healthy`
# gating). Node 22 has global fetch, so no curl/wget dependency in the image.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4010)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Run tsx DIRECTLY, not via `pnpm --filter … start`: pnpm as PID 1 does not
# forward SIGTERM to its node child, so `docker stop`/redeploy would SIGKILL the
# API and skip graceful shutdown (SQLite WAL checkpoint, audit/registry flush).
# tsx forwards signals to node, so index.ts's SIGTERM handler runs. Data-dir and
# serve-web are absolute via ENV, so the changed working directory is harmless.
CMD ["apps/api/node_modules/.bin/tsx", "apps/api/src/index.ts"]
