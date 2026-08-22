import type { NextConfig } from 'next';

const API_ORIGIN = process.env.API_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
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
  allowedDevOrigins: ['192.168.1.5'],
  // Serve the API and its uploaded files under the SAME origin as the web
  // app. The browser then only ever talks to one host, which is what makes
  // the app work unchanged over localhost, a LAN IP, AND an HTTPS tunnel
  // (a PWA install needs a single secure origin — a separate :3001 host
  // can't be tunnelled alongside and would trip mixed-content blocking).
  // These run server-side on the machine hosting Next, where localhost:3001
  // is always reachable.
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` },
      { source: '/uploads/:path*', destination: `${API_ORIGIN}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
