import './admin.css';
import { Hanken_Grotesk } from 'next/font/google';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ImpersonationProvider } from './components/ImpersonationContext';
import { SearchProvider } from './components/SearchContext';
import { SessionGate } from './components/SessionGate';
import { PwaRegister } from '../(tenant)/components/PwaRegister';
import { InstallBanner } from '../shared/install/InstallBanner';
import { InstallPromptCapture } from '../shared/install/InstallPromptCapture';

/**
 * The platform plane's own root layout (GRW-93, GRW-95, ADR-14).
 *
 * A separate <html>/<body> from the tenant portal's — Next.js supports
 * multiple root layouts via route groups, and this is why the tenant routes
 * were moved into `(tenant)/layout.tsx`. The two plans share nothing here:
 * not a font, not a stylesheet, not a nav component. GRW-93's session and
 * GRW-94's guard are the structural separation; this is what makes it
 * visually unmistakable too.
 */
const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

/**
 * Jira GRW-265 · GRW-270 — installable, as its own app.
 *
 * Its own manifest (id, start_url and scope `/admin`), because the salon app's
 * manifest starts at `/`: installed from here with that one, "Growza" would
 * open the salon dashboard, not this portal.
 */
export const metadata: Metadata = {
  title: 'Growza Admin',
  description: 'Platform administration — businesses, billing, usage and control.',
  manifest: '/admin-manifest.json',
  icons: { icon: '/icon.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: {
    capable: true,
    // Not black-translucent: that draws the page under the status bar, which
    // needs the safe-area insets this stylesheet does not have (see below).
    statusBarStyle: 'default',
    title: 'Growza Admin',
  },
};

/**
 * Jira GRW-17 — `viewportFit: 'cover'` is deliberately NOT set here.
 *
 * It was, briefly. Setting it makes a page draw under the notch and the home
 * indicator, which is only an improvement if something then pads the content
 * back out with `env(safe-area-inset-*)`. The tenant dashboard does, in ten
 * places. **This stylesheet does so in none** — and it has sticky and fixed
 * chrome that would have gone straight under a Dynamic Island.
 *
 * GRW-265 made the admin plane installable and left this off on purpose: an
 * installed app without `viewport-fit=cover` is laid out below the notch and
 * above the home indicator by the system, which is exactly what a stylesheet
 * with no safe-area insets needs. Turn it on only once the insets are in.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Jira GRW-475 — no zoom lock (WCAG 1.4.4); the business dashboard dropped it in GRW-306.
  themeColor: '#264a3c',
};

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`admin-body ${hanken.className}`}>
        <InstallPromptCapture />
        <ImpersonationProvider>
          <SearchProvider>
            <SessionGate>{children}</SessionGate>
          </SearchProvider>
        </ImpersonationProvider>
        <PwaRegister />
        <InstallBanner app="admin" />
      </body>
    </html>
  );
}
