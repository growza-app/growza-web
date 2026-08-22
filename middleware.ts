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
    const [user, pass] = atob(header.slice(6)).split(':');
    if (user === USER && pass === PASS) return NextResponse.next();
  }

  return new NextResponse('Authentication required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Growza", charset="UTF-8"' },
  });
}

/** Guard everything except Next's own static assets and the favicon. */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
