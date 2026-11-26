# Halal Meet API — production image. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t halal-meet-api .
# Migrations in apps/api/drizzle are applied automatically on start.

FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable

# Install with only the manifests first so this layer is cached between code changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
RUN pnpm install --frozen-lockfile --filter @halal-meet/api...

COPY packages/core packages/core
COPY apps/api apps/api
RUN pnpm --filter @halal-meet/core build \
 && pnpm --filter @halal-meet/api build \
 && pnpm --filter @halal-meet/api deploy --prod --legacy /out \
 && cp -r apps/api/dist apps/api/drizzle /out/

FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
