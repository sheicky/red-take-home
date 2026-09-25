# syntax=docker/dockerfile:1

# Build on Node, with the Bun binary only for installing and running scripts. On Bun's runtime
# alone, `next build` fails to load Next's compiled server ("Expected CommonJS module to have a
# function wrapper"); with Node present, `bun run build` hands `next` to Node, as on a laptop.

# ── deps: exact lockfile, nothing else
FROM node:24-bookworm-slim AS deps
COPY --from=oven/bun:1.3.11 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── build: Next standalone output
FROM node:24-bookworm-slim AS build
COPY --from=oven/bun:1.3.11 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# ── run: plain Node, non-root, only what the server needs
FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
# /api/airports reads the bundled data: a 200 proves the server AND the data are there.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- "http://127.0.0.1:3000/api/airports?q=new" >/dev/null || exit 1
CMD ["node", "server.js"]
