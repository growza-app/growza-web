import { NextResponse, type NextRequest } from 'next/server';

/**
 * HTTP Basic Auth gate for the whole dashboard.
 *
 * Only active when BOTH `TUNNEL_USER` and `TUNNEL_PASS` are set (see
 * `.env.local`). This is here to protect the app when it's exposed over a
 * public Cloudflare quick-tunnel for phone testing — with the vars unset the
 * gate is a no-op, so localhost and production behave exactly as before.
 */
const USER = process.env.TUNNEL_USER;
const PASS = process.env.TUNNEL_PASS;

/**
 * Jira GRW-674 (SEC-04) — and so does every other page, since 2026-11-05.
 *
 * The policy below was the admin portal's alone. Every tenant screen — clients' names and numbers, the till,
 * the day's money — went out with `frame-ancestors 'none'` and nothing else, so one injected script there
 * would have run with nothing to stop it. Same policy now, with one difference outside the admin portal:
 * `img-src` allows any https image. In production a service or product photo is fetched by the browser
 * straight from a presigned storage address, on a host this server does not know; an image is not a script,
 * and blocking it would blank every photo in the app to protect nothing.
 *
 * NOT applied to `/api/*` and `/uploads/*`. Those are the API's own responses passing through the rewrite, and
 * it sets its own policy on each — a shared invoice page carries one written for exactly that page. Two
 * policies on one response are enforced together, and this one would break that page.
 *
 * Jira GRW-480 (S-10) — the admin portal runs only the scripts it was sent with.
 *
 * Its pages reach every business on the platform, so a script injected into one of them is the worst XSS this
 * product can have. A fresh nonce per request goes into the CSP and the request headers; Next puts it on its own
 * scripts, and the one inline script (`InstallPromptCapture`) takes it from `x-nonce`. `strict-dynamic` lets those
 * scripts load the chunks they need and nothing else may run. Styles stay `'unsafe-inline'`: Next and the font
 * loader inject them, and a style is not a script. Development adds `'unsafe-eval'`, which React's dev tooling needs.
 */
export function pageCsp(nonce: string, admin: boolean, dev: boolean = process.env.NODE_ENV !== 'production'): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${admin ? '' : ' https:'}`,
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** The API's own answers, proxied: they carry the API's policy and must not be given a second one. */
export function isProxiedToApi(pathname: string): boolean {
  // `/d/:token` is the customer's short link to a shared document, rewritten to the API's own page
  // (next.config.ts). It carries the policy the API wrote for that page, like everything under `/api/`.
  return pathname.startsWith('/api/') || pathname.startsWith('/uploads/') || pathname.startsWith('/d/');
}

function pass(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  if (isProxiedToApi(pathname)) return NextResponse.next();
  const nonce = btoa(crypto.randomUUID());
  const policy = pageCsp(nonce, pathname.startsWith('/admin'));
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('Content-Security-Policy', policy);
  return res;
}

export function middleware(req: NextRequest) {
  if (!USER || !PASS) return pass(req);

  const header = req.headers.get('authorization');
  if (header?.startsWith('Basic ')) {
    /*
     * Jira GRW-476 — three fixes. A malformed header made `atob` throw (a 500, not a 401); a password containing
     * `:` was cut at the first one; and `===` returns as soon as a character differs, which times how much of a
     * guess was right. Split on the FIRST colon, and compare in constant time.
     */
    let decoded = '';
    try {
      decoded = atob(header.slice(6));
    } catch {
      decoded = '';
    }
    const colon = decoded.indexOf(':');
    if (colon > 0 && sameText(decoded.slice(0, colon), USER) && sameText(decoded.slice(colon + 1), PASS)) {
      return pass(req);
    }
  }

  return new NextResponse('Authentication required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Growza", charset="UTF-8"' },
  });
}

/** Guard everything except Next's own static assets and the favicon. */
export const config = {
  // Jira GRW-476 — `_next/image` is gated too: it fetches and resizes on request, so it is not a static file.
  matcher: ['/((?!_next/static|favicon.ico).*)'],
};

/** Equal strings, compared without stopping at the first difference (Jira GRW-476). */
function sameText(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
