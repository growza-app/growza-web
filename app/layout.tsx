import './globals.css';
import type { ReactNode } from 'react';
import { api } from './lib/api';
import { Sidebar } from './components/Sidebar';

export const metadata = { title: 'Booking Dashboard' };
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: ReactNode }) {
  let labels: Record<string, string> = {};
  let tenantName = 'Booking';

  try {
    const me = await api.me();
    labels = me.labels;
    tenantName = me.tenant?.name ?? tenantName;
  } catch {
    // API down — pages render their own error state.
  }

  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Sidebar tenantName={tenantName} labels={labels} />
          <div className="content">{children}</div>
        </div>
      </body>
    </html>
  );
}
