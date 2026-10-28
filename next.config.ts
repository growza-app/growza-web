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
   *
   * **`geolocation=(self)`, not `geolocation=()`** (owner, 2026-10-11). An empty list means NOBODY, this page
   * included, so the browser refused the request before any prompt appeared — "Permissions policy violation:
   * Geolocation access has been blocked" in the console and nothing on screen. That header shipped with GRW-476
   * and phone check-in arrived after it (GRW-563), so "Use where I am now" and a stylist's own "I'm in" have
   * never once been able to ask for a position, on any origin, however the phone's own permission was set.
   * `(self)` is still the restrictive answer — this document may ask, and no embedded third party can.
   *
   * **`microphone=(self)`, not `microphone=()`** (owner, 2026-10-28) — and it is the SAME mistake, found
   * seventeen days later on the other feature that needed a device. Voice search (GRW-651) shipped behind a
   * header forbidding the microphone to this page, so `getUserMedia` answered `NotSupportedError` with
   * "Permissions policy violation: microphone is not allowed in this document" in the console, and Chrome
   * reported the permission as `denied` with no control offered to change it. Every owner who went looking
   * for the switch was sent after one that does not exist, on every origin, production included.
   *
   * The lesson this file has now taught twice: `()` is not "off until someone turns it on", it is "off, and
   * nobody may ask" — including us. A feature that needs a device needs `(self)` the day it ships.
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
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(self)' },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` },
      { source: '/uploads/:path*', destination: `${API_ORIGIN}/uploads/:path*` },
      /*
       * Jira GRW-582 — the link a business sends a customer for their invoice. Short, because it is typed into a
       * WhatsApp message; public, because the person opening it has no account; and answered by the API, which draws
       * the document from the record on every visit. No page of the dashboard is involved.
       */
      { source: '/d/:token', destination: `${API_ORIGIN}/api/v1/share/:token` },
    ];
  },
};

// Jira GRW-319 — message files per language; see i18n/request.ts.
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
