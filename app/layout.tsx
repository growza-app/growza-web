import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { api } from './lib/api';
import { Sidebar } from './components/Sidebar';
import { MobileChrome } from './components/MobileChrome';
import { PwaRegister } from './components/PwaRegister';

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

  try {
    const me = await api.me();
    labels = me.labels;
    tenantName = me.tenant?.name ?? tenantName;
    timezone = me.tenant?.timezone ?? timezone;
  } catch {
    // API down — pages render their own error state.
  }

  return (
    <html lang="en">
      <body>
        <PwaRegister />
        <div className="shell">
          <Sidebar tenantName={tenantName} labels={labels} />
          <div className="content">
            {children}
            <MobileChrome labels={labels} timezone={timezone} />
          </div>
        </div>
      </body>
    </html>
  );
}
