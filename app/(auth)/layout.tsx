import '../(tenant)/globals.css';
import { BrowserGate } from '../(tenant)/components/BrowserGate';
import { PwaRegister } from '../(tenant)/components/PwaRegister';
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
/**
 * Jira GRW-262 · GRW-269 — installable from here, not only from the dashboard.
 *
 * Chrome offers "Install app" only on a page that links a manifest, and this is
 * the first page every new owner is sent to. While only `(tenant)` linked it,
 * an owner holding a phone and a sign-in link could not put Growza on the home
 * screen until after they had signed in.
 */
export const metadata: Metadata = {
  title: 'Sign in',
  manifest: '/manifest.json',
  icons: { icon: '/icon.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Growza',
  },
};

  /** Jira GRW-17 — see the note in `(tenant)/layout.tsx`: this is what makes `env(safe-area-inset-*)` non-zero. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f3d2e',
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* GRW-197 — the sign-in screen is where an unsupported browser lands
            FIRST. Telling them here saves a password attempt on a form whose
            button will never respond. */}
        <BrowserGate />
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
