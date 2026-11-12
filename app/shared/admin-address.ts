/**
 * Jira GRW-689 — the admin portal has its own address. On app.growza.biz the business app's install scope (`/`)
 * covered /admin, so Android Chrome would not install Growza Admin beside Growza. Same dashboard, two addresses:
 * this file says which pages belong to which, for the middleware and for "Open as business".
 */
// NEXT_PUBLIC_, so the middleware and the admin's browser page read the same two names: set at build for a local or
// test copy (app.localhost / admin.localhost); production needs neither — the defaults are the real addresses.
export const APP_HOST = process.env.NEXT_PUBLIC_APP_HOSTNAME || 'app.growza.biz';
export const ADMIN_HOST = process.env.NEXT_PUBLIC_ADMIN_HOSTNAME || 'admin.growza.biz';

const isAdminPath = (pathname: string) => pathname === '/admin' || pathname.startsWith('/admin/');

/**
 * Where a page request belongs, or null to serve it here. Only the two real addresses are ever redirected: on
 * localhost, a test box or a tunnel, everything is served where it is asked for, as before.
 */
export function addressFor(host: string | null | undefined, pathname: string, search = '', proto = 'https'): string | null {
  const [name = '', port] = (host ?? '').toLowerCase().split(':');
  // The port rides along (a local check on app.localhost:3110); the two real addresses have none.
  const at = (h: string) => `${proto}://${h}${port ? `:${port}` : ''}`;
  if (name === APP_HOST && isAdminPath(pathname)) return `${at(ADMIN_HOST)}${pathname}${search}`;
  if (name === ADMIN_HOST) {
    if (pathname === '/') return `${at(ADMIN_HOST)}/admin${search}`;
    if (!isAdminPath(pathname)) return `${at(APP_HOST)}${pathname}${search}`;
  }
  return null;
}

/** The business app's address, seen from the admin's: only when the admin is on its own address. */
export function businessOriginFrom(location: Pick<Location, 'hostname' | 'protocol' | 'port'>): string | null {
  return location.hostname === ADMIN_HOST ? `${location.protocol}//${APP_HOST}${location.port ? `:${location.port}` : ''}` : null;
}
