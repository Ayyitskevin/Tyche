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

ENV API_HOST=0.0.0.0 \
    API_PORT=4010 \
    TYCHE_SERVE_WEB=/app/apps/web/dist \
    TYCHE_DATA_DIR=/app/data
VOLUME /app/data
EXPOSE 4010
CMD ["pnpm", "--filter", "@tyche/api", "start"]
