import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { api } from './lib/api';
import { Sidebar } from './components/Sidebar';
import { MobileChrome } from './components/MobileChrome';
import { PwaRegister } from './components/PwaRegister';
import { LiveRefresh } from './components/LiveRefresh';
import { LabelsProvider } from './components/LabelsProvider';
import type { MemberRole } from './lib/nav-policy';
import { BillingBanner } from './components/BillingBanner';
import { redirect } from 'next/navigation';
import { shouldSignInAgain, SIGN_IN_PATH } from './lib/session-policy';

export const metadata: Metadata = {
  title: 'Booking Dashboard',
  description: 'Manage bookings, staff, services, and offers.',
  manifest: '/manifest.json',
  icons: { icon: '/icon.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Bookings',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0f3d2e',
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: ReactNode }) {
  let labels: Record<string, string> = {};
  let tenantName = 'Booking';
  let timezone = 'Asia/Kolkata';
  let billing: { status: string; message: string | null } | null = null;
  /** Jira GRW-66 · GRW-157 — absent means owner (BR-03): a degraded session must not hide the product from the person who owns it. */
  let role: MemberRole | null = null;

  try {
    const me = await api.me();
    labels = me.labels;
    tenantName = me.tenant?.name ?? tenantName;
    timezone = me.tenant?.timezone ?? timezone;
    billing = me.billing ?? null;
    role = (me.member?.role as MemberRole | undefined) ?? null;
  } catch (error) {
    /**
     * Jira GRW-66 · GRW-160 — a 401 is the one failure that means something
     * we can act on. Everything else still falls through to the degraded
     * render below (BR-03).
     *
     * `redirect()` works by throwing, so it must be the last thing in this
     * block: anything after it would not run.
     */
    if (shouldSignInAgain(error)) redirect(SIGN_IN_PATH);
    // API down — pages render their own error state, and `billing` stays
    // null so no banner claims anything it cannot know (GRW-122).
  }

  return (
    <html lang="en">
      <body>
        <PwaRegister />
        <LiveRefresh />
        <LabelsProvider labels={labels}>
          <div className="shell">
            <Sidebar tenantName={tenantName} labels={labels} role={role} />
            <div className="content">
              <BillingBanner billing={billing} />
              {children}
              <MobileChrome labels={labels} timezone={timezone} role={role} />
            </div>
          </div>
        </LabelsProvider>
      </body>
    </html>
  );
}
