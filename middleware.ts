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

export function middleware(req: NextRequest) {
  if (!USER || !PASS) return NextResponse.next();

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
      return NextResponse.next();
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
