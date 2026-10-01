# Jira GRW-420 — the dashboard's image, built from THIS repo.
#
# What was here before was a byte-for-byte copy of growza's `web/Dockerfile`,
# which builds from the monorepo root: it does `COPY web/package.json` and
# `COPY shared/package.json`, and neither path exists here — `app/` is the root
# and there is no `shared/`. It could never have built, which is the clearest
# evidence that nothing has ever been built from this repository.
#
# The two structural differences from the monorepo's copy:
#
#   1. No workspace. `@growza-app/shared` is installed from GitHub Packages
#      (see .npmrc) instead of being a sibling directory, so the install needs
#      a token with `read:packages`. It is passed as a BUILD SECRET and never
#      becomes a layer:
#
#        docker build --secret id=npm_token,env=NODE_AUTH_TOKEN -t growza-web .
#
#      In Actions that is `secrets.GITHUB_TOKEN`, provided the package grants
#      this repository access (Packages → the package → Manage Actions access).
#
#   2. Flat paths. `next build` emits `.next/standalone/server.js` at the root
#      here, not `web/server.js`, because `outputFileTracingRoot` is this
#      directory rather than a workspace above it.
#
# Deliberately `npm install`, not `npm ci`: this repo has no package-lock.json
# yet — it was a workspace member and the lock lived in the monorepo. Commit a
# lockfile generated with the token in place and change this to `npm ci`, which
# is what makes a build reproducible.

# ---- deps ----
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json .npmrc ./
RUN --mount=type=secret,id=npm_token \
    NODE_AUTH_TOKEN="$(cat /run/secrets/npm_token 2>/dev/null || true)" npm install --no-audit --no-fund

# ---- build ----
FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# API_URL is BAKED IN, not read at runtime.
#
# next.config.ts uses it in `rewrites()` and in `env`, and Next compiles both
# into the build. Setting API_URL on the running container changes nothing; if
# the API moves, this image must be REBUILT. `http://api:3001` is the service
# name docker-compose.prod.yml gives the API.
ENV NEXT_TELEMETRY_DISABLED=1
ENV API_URL=http://api:3001
RUN npm run build

# ---- runtime: the standalone server and nothing else ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Not root. This is the process facing the internet through Caddy, and it has
# no reason to own its own filesystem.
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

# `standalone` carries its traced node_modules and a server.js. The static
# assets and public/ are NOT in it — Next expects them alongside, and leaving
# them out is the classic "the page loads but every stylesheet 404s".
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
