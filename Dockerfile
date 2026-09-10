FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# next build needs devDependencies (@tailwindcss/postcss, tailwindcss, typescript,
# @types/*). Coolify injects the app env — including NODE_ENV=production — into every
# stage, and npm ci omits devDependencies under that value, so this stage produced an
# incomplete node_modules and the build stage failed on @tailwindcss/postcss.
# --include=dev forces them in regardless of where the platform injects its ENV;
# NODE_ENV=development covers npm config that keys off it. Runtime stage stays production.
ENV NODE_ENV=development
RUN npm ci --ignore-scripts --include=dev
FROM node:20-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=5000
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 5000
CMD ["node", "server.js"]
