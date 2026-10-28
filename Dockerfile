# syntax=docker/dockerfile:1.7

# Node 24 is the active LTS line; use the same Alpine/musl build environment
# for frontend tooling, Prisma generation, native module compilation, and runtime.
FROM node:24.22.1-alpine3.24 AS pnpm-base

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

RUN npm install --global pnpm@12.8.1 \
    && ln -s "$(npm root --global)/npm/node_modules/node-gyp/bin/node-gyp.js" /usr/local/bin/node-gyp

WORKDIR /app

FROM pnpm-base AS client-build

COPY client/package.json client/pnpm-lock.yaml client/pnpm-workspace.yaml ./client/
RUN pnpm --dir client install --frozen-lockfile

COPY client ./client
RUN pnpm --dir client build

FROM pnpm-base AS backend-build

# better-sqlite3 may compile from source when no matching musl prebuild exists.
RUN apk add --no-cache --virtual .native-build-deps python3 make g++

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY prisma7.config.ts tsconfig.json ./
COPY server/package.json server/pnpm-lock.yaml server/pnpm-workspace.yaml ./server/
RUN pnpm install --frozen-lockfile \
    && pnpm --dir server install --frozen-lockfile

COPY server/src ./server/src
COPY server/scripts ./server/scripts
COPY server/tsconfig.build.json ./server/
RUN pnpm --dir server build

FROM pnpm-base AS backend-production-deps

# Build the runtime native module in Alpine, with the same Node ABI as runtime.
RUN apk add --no-cache --virtual .native-build-deps python3 make g++

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/pnpm-lock.yaml server/pnpm-workspace.yaml ./server/
RUN pnpm install --prod --frozen-lockfile \
    && pnpm --dir server install --prod --frozen-lockfile

FROM node:24.22.1-alpine3.24 AS backend

# The compiled better-sqlite3 binding uses the C++ runtime; SQLite itself is
# statically linked by better-sqlite3. Build tools remain in earlier stages.
RUN apk add --no-cache libstdc++ \
    && mkdir -p /app/server /app/prisma /app/data /var/lib/liveorder \
    && chown -R node:node /app /var/lib/liveorder

WORKDIR /app

COPY --from=backend-production-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=backend-production-deps --chown=node:node /app/server/node_modules ./server/node_modules
COPY --from=backend-build --chown=node:node /app/server/dist ./server/dist
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml prisma7.config.ts ./
COPY --chown=node:node server/package.json server/pnpm-lock.yaml server/pnpm-workspace.yaml ./server/
COPY --chown=node:node server/src/config/database.ts ./server/src/config/database.ts
COPY --chown=node:node prisma/schema.prisma ./prisma/schema.prisma
COPY --chown=node:node prisma/migrations ./prisma/migrations

WORKDIR /app/server
ENV NODE_ENV=production
ENV PORT=3000
ENV LIVEORDER_DATABASE_PATH=/var/lib/liveorder/liveorder.db

VOLUME ["/var/lib/liveorder"]
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/ready').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

# Direct Node execution ensures Docker forwards SIGTERM to the graceful server.
CMD ["node", "dist/server/src/server.js"]

FROM caddy:2.11.7-alpine AS caddy

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=client-build /app/client/dist /srv

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:2019/config/ || exit 1
