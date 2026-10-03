import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_ORIGIN = process.env.API_URL ?? 'http://localhost:3001';

/**
 * Every non-internal IPv4 address this machine currently has. Hardcoding a
 * single LAN IP here went stale the moment the Mac joined a different
 * Wi-Fi — the phone could still load the page (SSR HTML doesn't care) but
 * every JS chunk 403'd, so nothing was interactive. Detecting it at startup
 * means the same behaviour holds on whatever network `next dev` is actually
 * running on, without a config edit every time it changes.
 */
function currentLanIps(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i): i is NonNullable<typeof i> => !!i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

const nextConfig: NextConfig = {
  /**
   * Jira GRW-181 — the dashboard needs a container, and this is what makes it
   * a small one.
   *
   * `standalone` emits a self-contained server plus only the node_modules it
   * actually traced, so the runtime image carries neither the build toolchain
   * nor the API's dependency tree. Without it the deployable is the whole
   * workspace — 08 §4 puts api, worker and web on ONE box, so image size is
   * that box's disk, not somebody else's problem.
   *
   * `outputFileTracingRoot` is THIS directory, because in this repo the
   * dashboard IS the root: `app/` sits beside `package.json` and there is no
   * workspace above it.
   *
   * Jira GRW-420 — it used to be `'..'`, which was right in the growza
   * monorepo (where this file lived at `web/`, and `next` and `react` are
   * hoisted to the root `node_modules` a level up) and points outside the
   * repository here. Tracing from a parent that is not part of the project is
   * how a standalone server ends up missing the dependencies it traced, and
   * that fails at container start rather than at build — the expensive way
   * round.
   */
  output: 'standalone',
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  env: {
    API_URL: API_ORIGIN,
  },
  // Hide the Next.js dev-tools indicator (the floating "N" button) — it sits in
  // the bottom-left corner and overlaps the mobile tab bar's first tab. Dev-only
  // anyway; a production build never renders it.
  devIndicators: false,
  // Next's dev server blocks cross-origin requests to its JS chunks by
  // default (DNS-rebinding protection) — without this, loading the app from
  // a phone via the Mac's LAN IP silently 403s one of the chunks, so parts
  // of the page render but their interactivity never loads. Dev-only; the
  // production build has no dev server to protect.
  // Every LAN IP this machine currently has (detected at startup — see
  // currentLanIps above), plus every *.trycloudflare.com subdomain so a
  // quick Cloudflare tunnel (random hostname each run) can load the dev
  // chunks without a 403. Dev-only. Restart `next dev` after switching
  // networks so this list picks up the new address.
  allowedDevOrigins: [...currentLanIps(), '*.trycloudflare.com'],
  // Serve the API and its uploaded files under the SAME origin as the web
  // app. The browser then only ever talks to one host, which is what makes
  // the app work unchanged over localhost, a LAN IP, AND an HTTPS tunnel
  // (a PWA install needs a single secure origin — a separate :3001 host
  // can't be tunnelled alongside and would trip mixed-content blocking).
  // These run server-side on the machine hosting Next, where localhost:3001
  // is always reachable.
  // Jira GRW-476 — no "X-Powered-By: Next.js" advertising the framework and its version to whoever asks.
  poweredByHeader: false,
  /*
   * Jira GRW-476 — the dashboard's own security headers. It sent none (QA: only X-Powered-By). No full CSP here —
   * Next's own inline scripts would need a nonce pipeline, its own story — but framing is refused outright (the
   * clickjacking half of a CSP, `frame-ancestors`), types are not sniffed, the referrer is trimmed, and the
   * device features this app never uses are switched off.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` },
      { source: '/uploads/:path*', destination: `${API_ORIGIN}/uploads/:path*` },
    ];
  },
};

// Jira GRW-319 — message files per language; see i18n/request.ts.
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
