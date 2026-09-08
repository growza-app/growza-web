import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { api } from './lib/api';
import { Sidebar } from './components/Sidebar';
import { MobileChrome } from './components/MobileChrome';
import { PwaRegister } from './components/PwaRegister';
import { LiveRefresh } from './components/LiveRefresh';
import { SessionProvider } from './components/SessionProvider';
import { LabelsProvider } from './components/LabelsProvider';
import type { MemberRole } from './lib/nav-policy';
import { BillingBanner } from './components/BillingBanner';
import { ImpersonationBanner } from './components/ImpersonationBanner';
import { redirect } from 'next/navigation';
import { accountStatusRefusal, shouldSignInAgain, SIGN_IN_PATH } from './lib/session-policy';
import { AccountStatusScreen } from './components/AccountStatusScreen';

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

  /**
   * Jira GRW-17 — `viewport-fit: cover` is what makes `env(safe-area-inset-*)`
   * mean anything.
   *
   * Without it those insets resolve to 0 in every browser, so the ten
   * safe-area rules already written across this stylesheet — the tab bar's
   * padding, the FAB's offset, the sheet footers — have never once taken
   * effect. They were correct and dead. This is the line that switches them on.
   *
   * It also opts the page into drawing UNDER the notch and the home indicator,
   * which is the point: the app is installable (`display: standalone` in
   * manifest.json), and a PWA that stops at the safe area has black bars.
   * Drawing edge-to-edge and padding with the insets is the native look.
   */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  maximumScale: 1,
  themeColor: '#0f3d2e',
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: ReactNode }) {
  let labels: Record<string, string> = {};
  let tenantName = 'Booking';
  let timezone = 'Asia/Kolkata';
  let billing: { status: string; message: string | null } | null = null;
  /** GRW-145/163 — whether the billing banner may offer "Pay now". */
  let canPayOnline = false;
  /**
   * GRW-165 — whether WhatsApp is live for this business.
   *
   * Starts FALSE, and stays false when the API cannot be reached. A screen
   * that cannot tell must say "coming soon" rather than imply a message will
   * be sent — the safe direction here is the pessimistic one, because the
   * optimistic one is a promise nothing keeps.
   */
  let whatsappLive = false;
  /** Jira GRW-66 · GRW-157 — absent means owner (BR-03): a degraded session must not hide the product from the person who owns it. */
  let role: MemberRole | null = null;
  /**
   * GRW-197 — the Reports tabs this caller may open, already resolved for
   * their own role by `/me`. Undefined until it answers; a limited role with
   * no grant is offered no Reports link, matching an API that would refuse
   * every report route for them.
   */
  let reportTabs: string[] | undefined;
  /** GRW-203 — the number they sign in with, for the account menu. */
  let memberPhone: string | null = null;
  /** Jira GRW-90 · GRW-137 — null on every ordinary session. */
  let impersonation: { businessName: string; role: string } | null = null;
  /** GRW-164 — set when the API says this account may not operate. */
  let accountStatus: { reason: string; message: string; support?: { email?: string; phone?: string } } | null = null;

  try {
    const me = await api.me();
    labels = me.labels;
    tenantName = me.tenant?.name ?? tenantName;
    timezone = me.tenant?.timezone ?? timezone;
    billing = me.billing ?? null;
    canPayOnline = me.payments?.online ?? false;
    whatsappLive = me.whatsapp?.booking ?? false;
    role = (me.member?.role as MemberRole | undefined) ?? null;
    reportTabs = me.reportTabs;
    memberPhone = me.member?.phone ?? null;
    impersonation = me.impersonation ?? null;
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
    /**
     * GRW-164 — a suspended, closed or half-provisioned account.
     *
     * NOT a redirect to /login: signing in again is precisely what will not
     * help, and sending them there to discover that is the failure this
     * replaces. Rendered instead of the shell, so no navigation and no data
     * appear behind it.
     */
    accountStatus = accountStatusRefusal(error);
    // API down — pages render their own error state, and `billing` stays
    // null so no banner claims anything it cannot know (GRW-122).
  }

  if (accountStatus) {
    return (
      <html lang="en">
        <body>
          <AccountStatusScreen message={accountStatus.message} support={accountStatus.support} />
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body>
        <PwaRegister />
        <LiveRefresh />
        {/* Above the shell, not inside it: this is the most important thing on
            the screen and it must not scroll away with the content or sit
            below the billing banner. */}
        {impersonation ? <ImpersonationBanner businessName={impersonation.businessName} role={impersonation.role} /> : null}
        <SessionProvider
          session={{
            initial: (tenantName ?? 'S').charAt(0).toUpperCase(),
            role: role ?? null,
            phone: memberPhone,
            businessName: tenantName ?? null,
          }}
        >
        <LabelsProvider labels={labels}>
          <div className={impersonation ? 'shell shell-impersonating' : 'shell'}>
            <Sidebar tenantName={tenantName} labels={labels} role={role} reportTabs={reportTabs} whatsappLive={whatsappLive} />
            <div className="content">
              <BillingBanner billing={billing} canPayOnline={canPayOnline} />
              {children}
              <MobileChrome labels={labels} timezone={timezone} role={role} reportTabs={reportTabs} />
            </div>
          </div>
        </LabelsProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
