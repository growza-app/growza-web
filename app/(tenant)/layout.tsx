import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { api } from './lib/api';
import { Sidebar } from './components/Sidebar';
import { MobileChrome } from './components/MobileChrome';
import { PwaRegister } from './components/PwaRegister';
import { LiveRefresh } from './components/LiveRefresh';
import { LabelsProvider } from './components/LabelsProvider';
import { BillingBanner } from './components/BillingBanner';

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

  try {
    const me = await api.me();
    labels = me.labels;
    tenantName = me.tenant?.name ?? tenantName;
    timezone = me.tenant?.timezone ?? timezone;
    billing = me.billing ?? null;
  } catch {
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
            <Sidebar tenantName={tenantName} labels={labels} />
            <div className="content">
              <BillingBanner billing={billing} />
              {children}
              <MobileChrome labels={labels} timezone={timezone} />
            </div>
          </div>
        </LabelsProvider>
      </body>
    </html>
  );
}
