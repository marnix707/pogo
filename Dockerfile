# Production image: builds the web app, bundles the server, and ships only what runs.
# Used by render.yaml. For local development use Dockerfile.dev via docker-compose.yml.

FROM node:20-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/

# Production dependencies of the server only, plus the generated Prisma client.
FROM base AS deps
RUN pnpm install --frozen-lockfile --prod --filter @pogo/server...
COPY apps/server/prisma apps/server/prisma
RUN cd apps/server && DIRECT_URL=unused DATABASE_URL=unused ./node_modules/.bin/prisma generate

# Full install, then build the web app and bundle the server.
FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @pogo/web build && pnpm --filter @pogo/server build

FROM node:20-bookworm-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    SERVER_PORT=10000 \
    WEB_DIST_DIR=/app/apps/web/dist
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=deps /app/apps/server/prisma ./apps/server/prisma
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY apps/server/package.json ./apps/server/
COPY docker/start.sh ./docker/start.sh
USER node
EXPOSE 10000
CMD ["sh", "/app/docker/start.sh"]
