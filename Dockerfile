FROM node:20-slim AS deps
WORKDIR /app
# Prisma's engines detect libssl at runtime; node:20-slim ships without it
# ("Prisma failed to detect the libssl/openssl version" warning). ca-certificates
# for TLS to the database and the APIs.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# next build needs devDependencies (@tailwindcss/postcss, tailwindcss, typescript,
# @types/*). Coolify injects the app env — including NODE_ENV=production — into every
# stage, and npm ci omits devDependencies under that value, so this stage produced an
# incomplete node_modules and the build stage failed on @tailwindcss/postcss.
# --include=dev forces them in regardless of where the platform injects its ENV;
# NODE_ENV=development covers npm config that keys off it. Runtime stage stays production.
ENV NODE_ENV=development
# The registry fetch is the least reliable step in this build — a single
# ECONNRESET two minutes in fails the whole deployment. Retries survive that;
# the cache mount means a retry (and every later build) reuses what already
# downloaded instead of starting from zero.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts --include=dev \
        --fetch-retries=5 \
        --fetch-retry-mintimeout=20000 \
        --fetch-retry-maxtimeout=120000 \
        --fetch-timeout=600000

# One-shot migration image: `docker build --target migrate -t crm-migrate .`, then
# run it once per instance (DATABASE_URL + DIRECT_URL in its env) BEFORE the new
# runtime container takes traffic. The runtime image never migrates on start.
# prisma/migrate-instance.ts builds an EMPTY database from schema.prisma and baselines the
# migration history (the history alone cannot build one), or runs `prisma migrate deploy`.
FROM deps AS migrate
WORKDIR /app
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
COPY prisma ./prisma
# npm ci ran with --ignore-scripts, so the Prisma engines were never fetched:
# fetch them now, at build time, so the migrate container needs no download.
RUN npx prisma generate && npx prisma version
CMD ["npx", "tsx", "prisma/migrate-instance.ts"]

# Captain Agent worker: `docker build --target agent-worker -t crm-agent .`, one
# container per agency next to the runtime one (same env file, no domain). The
# runtime image is Next standalone and ships no lib/** sources, so the worker is
# built like `migrate`: full sources on top of deps, run with tsx.
FROM deps AS agent-worker
WORKDIR /app
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
ENV NODE_ENV=production
COPY . .
RUN npx prisma generate
CMD ["npx", "tsx", "worker/agent.ts"]

FROM node:20-slim AS build
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=4096"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Last stage = what a plain `docker build` produces. Same image for every
# agency: brand, URLs and integrations come from the instance's DB and env.
FROM node:20-slim AS runtime
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=5000
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 5000
CMD ["node", "server.js"]
