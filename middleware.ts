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
 * Jira GRW-480 (S-10) — the admin portal runs only the scripts it was sent with.
 *
 * Its pages reach every business on the platform, so a script injected into one of them is the worst XSS this
 * product can have. A fresh nonce per request goes into the CSP and the request headers; Next puts it on its own
 * scripts, and the one inline script (`InstallPromptCapture`) takes it from `x-nonce`. `strict-dynamic` lets those
 * scripts load the chunks they need and nothing else may run. Styles stay `'unsafe-inline'`: Next and the font
 * loader inject them, and a style is not a script. Development adds `'unsafe-eval'`, which React's dev tooling needs.
 */
function adminCsp(nonce: string): string {
  const dev = process.env.NODE_ENV !== 'production';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
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

function pass(req: NextRequest): NextResponse {
  if (!req.nextUrl.pathname.startsWith('/admin')) return NextResponse.next();
  const nonce = btoa(crypto.randomUUID());
  const policy = adminCsp(nonce);
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
