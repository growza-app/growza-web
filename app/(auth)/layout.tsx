import '../(tenant)/globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

/**
 * Jira GRW-66 · GRW-160 — the sign-in screen's own root layout.
 *
 * A second root layout via a route group, the way `admin/` already is. This is
 * not tidiness: it is what makes "a 401 in the dashboard redirects to /login" a
 * safe rule. `(tenant)/layout.tsx` calls `api.me()` on every render, so if
 * `/login` sat inside it, that call would 401 for the very visitor who came to
 * sign in and redirect them to the page they are already on, forever. Keeping
 * the two apart makes the loop structurally impossible rather than something
 * somebody has to remember to special-case (BR-01).
 *
 * It borrows the dashboard's stylesheet and nothing else — no sidebar, no nav,
 * no billing banner. Chrome for a product the visitor cannot use yet.
 */
export const metadata: Metadata = {
  title: 'Sign in',
  icons: { icon: '/icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f3d2e',
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
