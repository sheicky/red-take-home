# syntax=docker/dockerfile:1

# ── deps: exact lockfile, nothing else
FROM oven/bun:1.3.11 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── build: Next standalone output
FROM oven/bun:1.3.11 AS build
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
