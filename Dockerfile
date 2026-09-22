# Jira GRW-181 — the dashboard's own image.
#
# The root Dockerfile builds api + worker and deliberately excludes web/ (its
# .dockerignore drops everything under web/ except package.json), on the
# assumption in its own header comment that the dashboard "deploys separately
# to Vercel". That is not the shape docs/architecture/08-operations.md §4
# describes: the test box is ONE machine running api, worker and web together
# under Docker Compose. This file is the missing third deployable.
#
# Built from the REPO ROOT, not from web/:
#   docker build -f web/Dockerfile -t growza-web .
# npm workspaces hoist next/react to the root node_modules, so a build context
# of web/ alone cannot install or trace them.

# ---- deps: the whole workspace, because the build needs the hoisted tree ----
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/package.json
# Jira GRW-370 — @growza-app/shared is a workspace the dashboard imports.
COPY shared/package.json shared/package.json
RUN npm ci

# ---- build: next build -> .next/standalone ----
FROM node:22-slim AS build
WORKDIR /app
# Only the ROOT node_modules: npm workspaces hoists everything, and with no
# version conflicts to resolve `npm ci` creates no web/node_modules at all.
# Copying a directory that does not exist fails the build at cache-key time.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY shared ./shared
COPY web ./web

# API_URL is BAKED IN HERE, not read at runtime.
#
# next.config.ts uses it in `rewrites()` and in `env`, and Next compiles both
# into the build (routes-manifest.json and inlined constants respectively).
# Setting API_URL on the running container therefore changes nothing — verified
# by doing exactly that and watching /api 500 while the same image, run under
# the hostname below, proxied fine.
#
# `http://api:3001` is correct because docker-compose.prod.yml names the API
# service `api`. If the API ever moves, this image must be REBUILT; a redeploy
# with a new environment variable will not do it.
ENV NEXT_TELEMETRY_DISABLED=1
ENV API_URL=http://api:3001
# Builds shared/dist first, then the dashboard (see package.json `build:web`).
RUN npm run build:web

# ---- runtime: the standalone server and nothing else ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Not root. The dashboard is the process facing the internet through Caddy, and
# it has no reason to own its own filesystem.
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

# `standalone` already contains its traced node_modules and a server.js. The
# static assets and public/ are NOT in it — Next expects them alongside, and
# leaving them out is the classic "the page loads but every stylesheet 404s".
COPY --from=build --chown=nextjs:nodejs /app/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/web/.next/static ./web/.next/static
COPY --from=build --chown=nextjs:nodejs /app/web/public ./web/public

USER nextjs
EXPOSE 3000

# The traced server lands at the path it had in the workspace.
CMD ["node", "web/server.js"]
