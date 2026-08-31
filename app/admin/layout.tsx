import './admin.css';
import { Hanken_Grotesk } from 'next/font/google';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ImpersonationProvider } from './components/ImpersonationContext';
import { SearchProvider } from './components/SearchContext';
import { SessionGate } from './components/SessionGate';

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

export const metadata: Metadata = {
  title: 'Growza Admin',
  description: 'Platform administration — businesses, billing, usage and control.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#264a3c',
};

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`admin-body ${hanken.className}`}>
        <ImpersonationProvider>
          <SearchProvider>
            <SessionGate>{children}</SessionGate>
          </SearchProvider>
        </ImpersonationProvider>
      </body>
    </html>
  );
}
