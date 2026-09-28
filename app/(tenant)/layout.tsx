import './globals.css';
import { Figtree, Noto_Sans_Devanagari } from 'next/font/google';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { api } from './lib/api';
import { Sidebar } from './components/Sidebar';
import { MobileChrome } from './components/MobileChrome';
import { MobileNavProvider } from './components/MobileNavProvider';
import { PwaRegister } from './components/PwaRegister';
import { LanguageSync } from './components/LanguageSync';
import { ViewportHeight } from './components/ViewportHeight';
import { InstallBanner } from '../shared/install/InstallBanner';
import { InstallPromptCapture } from '../shared/install/InstallPromptCapture';
import { BrowserGate } from './components/BrowserGate';
import { LiveRefresh } from './components/LiveRefresh';
import { SessionRefresh } from './components/SessionRefresh';
import { SessionProvider } from './components/SessionProvider';
import { BranchProvider } from './components/BranchProvider';
import { LabelsProvider } from './components/LabelsProvider';
import { mayUse, type MemberRole } from './lib/nav-policy';
import { BillingBanner } from './components/BillingBanner';
import { ImpersonationBanner } from './components/ImpersonationBanner';
import { redirect } from 'next/navigation';
import { accountStatusRefusal, shouldSignInAgain, SIGN_IN_PATH } from './lib/session-policy';
import { AccountStatusScreen } from './components/AccountStatusScreen';
import { serverLang } from './lib/lang';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { pickNamespaces, type Messages } from '../../i18n/messages';
import { CLIENT_MESSAGES } from '../../i18n/client-messages';

/**
 * Jira GRW-222 — the Home redesign's typeface, and the Devanagari one Hindi needs.
 *
 * Through `next/font`, which downloads the files at build time and serves them
 * from this origin: no request to Google from an owner's phone, and nothing
 * that breaks when the PWA is offline. Exposed as CSS variables so 00-base.css
 * keeps owning the stack and its system-font fallback.
 */
const figtree = Figtree({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], display: 'swap', variable: '--font-figtree' });
const devanagari = Noto_Sans_Devanagari({ subsets: ['devanagari'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-devanagari' });
const fontClass = `${figtree.variable} ${devanagari.variable}`;

/**
 * Jira GRW-192 — the tab says which screen, and whose business.
 *
 * Every screen used to render `<title>Booking Dashboard</title>`. Thirteen
 * tabs, one name: the tab strip, the bookmark dialog and the history list
 * could not tell them apart. It cost real time during the GRW-216 device
 * sweep, where a correct navigation looked like a failed one because the title
 * never changed, and the harness had to start recording `location.pathname` on
 * every row before its results could be trusted.
 *
 * `template` is what each page's own `title` drops into, so a page declares
 * "Bookings" and the tab reads "Bookings · Glow Salon". The business name is
 * there because the first cohort is white-glove: Growza staff will have
 * several salons open at once, and "Bookings" three times over is the same
 * problem one level up.
 *
 * `default` covers a route declaring no title of its own, and is deliberately
 * the business name rather than a screen name — inheriting some OTHER screen's
 * name is exactly the confusion being removed, so an undeclared route says
 * less rather than something wrong. `title-coverage.test.ts` fails when a
 * route relies on it.
 *
 * The `/me` call here is free: React memoises identical fetches within a
 * render pass, so it is the same request the shell below already makes.
 * Counted in the API log rather than assumed — one `/api/v1/me` per page load,
 * not two.
 */
export async function generateMetadata(): Promise<Metadata> {
  let business = 'Growza';
  try {
    const me = await api.me();
    business = me.tenant?.name ?? business;
  } catch {
    // A title is never worth a broken page. The shell below already renders
    // degraded when `/me` is unreachable; this matches it.
  }

  return {
    title: { template: `%s · ${business}`, default: business },
    // i18n-ok: the page's meta description (search / install prompt), not read on a screen by an owner
    description: 'Manage bookings, staff, services, and offers.',
    manifest: '/manifest.json',
    icons: { icon: '/icon.png', apple: '/icons/apple-touch-icon.png' },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      // i18n-ok: brand name
      title: 'Growza',
    },
  };
}

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
  // No maximumScale: pinch-zoom is how a low-vision owner reads the small print (WCAG 1.4.4, Jira GRW-306).
  themeColor: '#0f3d2e',
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: ReactNode }) {
  let labels: Record<string, string> = {};
  let tenantName = 'Booking';
  let timezone = 'Asia/Kolkata';
  /** Jira GRW-413 — `autopayHalted` comes with it: the warning then names the two actions that recover the account. */
  let billing: { status: string; message: string | null; autopayHalted?: boolean } | null = null;
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
  /** Jira GRW-266 · GRW-271 — the Try WhatsApp demo exists only off production. False when the API cannot say. */
  let whatsappDemo = false;
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
  let accountStatus: { reason: string; message: string; support?: { phone?: string } } | null = null;
  /** Jira GRW-222 — the primary branch's name for the sidebar, when there is one. */
  let locationName: string | null = null;
  // Jira GRW-395 — where a member held to a branch works, at a business with several (null otherwise): the header says it.
  let workBranchName: string | null = null;
  let branchCount = 1;
  let branches: Array<{ id: string; name: string }> = [];
  /** Jira GRW-377 — the member's own branch; fixes a receptionist or stylist to it everywhere. */
  let memberLocationId: string | null = null;
  /** Jira GRW-310 — what LiveRefresh treats as "unchanged" until it sees a different one. */
  let liveVersionAtRender: string | null = null;
  /** Jira GRW-329 — the language on the person's account; the cookie is a cache of it. */
  let storedLang: string | null = null;
  const lang = await serverLang();
  const messages = await getMessages();

  try {
    // Jira GRW-310 — read alongside `/me`, before the page's own data, so LiveRefresh compares
    // against the version this render was drawn from. A change landing after this read shows up
    // as a difference on the next tick; one landing before it is already on the page.
    const [me, version] = await Promise.all([api.me(), api.liveVersion().catch(() => null)]);
    liveVersionAtRender = version;
    labels = me.labels;
    storedLang = me.member?.lang ?? null;
    tenantName = me.tenant?.name ?? tenantName;
    timezone = me.tenant?.timezone ?? timezone;
    billing = me.billing ?? null;
    whatsappLive = me.whatsapp?.booking ?? false;
    whatsappDemo = me.whatsapp?.demo ?? false;
    role = (me.member?.role as MemberRole | undefined) ?? null;
    // Jira GRW-409 — the banner's words are for everyone at the salon; "Pay now" only for a role the payment-link
    // route serves. A receptionist tapping it got "forbidden" in the middle of a warning about the account.
    canPayOnline = (me.payments?.online ?? false) && mayUse(role, 'billing.payNow');
    reportTabs = me.reportTabs;
    memberPhone = me.member?.phone ?? null;
    branches = me.branches ?? [];
    memberLocationId = me.member?.locationId ?? null;
    impersonation = me.impersonation ?? null;
    // Jira GRW-237 — a receptionist with a branch is named at that branch.
    locationName = me.member?.locationName ?? me.tenant?.locationName ?? null;
    workBranchName = me.member?.locationName ?? null;
    // Jira GRW-225 — an owner of several branches watches all of them (multi-branch
    // is owner-only); naming the primary under the business read as "you are in
    // Koramangala" while Home showed every branch.
    branchCount = me.tenant?.branchCount ?? 1;
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
      <html lang={lang} className={fontClass}>
        <body>
          <BrowserGate />
          <AccountStatusScreen message={accountStatus.message} support={accountStatus.support} />
        </body>
      </html>
    );
  }

  return (
    <html lang={lang} className={fontClass}>
      <body>
        {/* GRW-197 — first in the body, so it runs before the app bundle has a
            chance to fail to parse. */}
        <BrowserGate />
        <InstallPromptCapture />
        <PwaRegister />
        <ViewportHeight />
        <LanguageSync stored={storedLang} rendered={lang} />
        <LiveRefresh initialVersion={liveVersionAtRender} />
        <SessionRefresh />
        {/* Above the shell, not inside it: this is the most important thing on
            the screen and it must not scroll away with the content or sit
            below the billing banner. */}
        {impersonation ? <ImpersonationBanner businessName={impersonation.businessName} role={impersonation.role} /> : null}
        {/* Jira GRW-319 — only the groups client components read; the rest stays on the server. */}
        <NextIntlClientProvider locale={lang} messages={pickNamespaces(messages as Messages, CLIENT_MESSAGES)}>
        <SessionProvider
          session={{
            initial: (tenantName ?? 'S').charAt(0).toUpperCase(),
            role: role ?? null,
            phone: memberPhone,
            businessName: tenantName ?? null,
            branches,
            lang,
          }}
        >
        <BranchProvider branches={branches} role={role ?? null} memberLocationId={memberLocationId} workBranchName={workBranchName}>
        <LabelsProvider labels={labels}>
        <MobileNavProvider>
          <div className={impersonation ? 'shell shell-impersonating' : 'shell'}>
            <Sidebar tenantName={tenantName} labels={labels} role={role} reportTabs={reportTabs} whatsappLive={whatsappLive} whatsappDemo={whatsappDemo} lang={lang} locationName={locationName} branchCount={role === 'owner' ? branchCount : 1} phone={memberPhone} />
            <div className="content">
              {/*
                * Jira GRW-300 — its own grid item, not a bare `BillingBanner`
                * sibling. `.content`'s grid places each direct/
                * `display:contents`-unwrapped child into its own row by DOM
                * order; a banner as its own top-level item pushed the page's
                * own header (`.topbar`/`.hm-head`, next in DOM order) out of
                * row 2 and into an implicit row after `.bottom-nav` —
                * invisible, scrolled past the fold. Kept as a wrapper (not
                * just pinning `BillingBanner` itself) because a second
                * account-status banner is exactly the kind of thing that
                * gets added here again later — Jira GRW-301 just removed the
                * one that used to make this two.
                */}
              <div className="content-banners">
                <BillingBanner billing={billing} canPayOnline={canPayOnline} />
              </div>
              {/*
                * Jira GRW-192 — one `<main>`, in the shell, for every screen.
                *
                * The ticket said `/search` was the odd one out. It was not: only
                * Home had a `<main>` at all, so twelve screens offered no "skip to
                * main content" target and nothing scoped to the landmark could
                * find the page. Putting it here fixes all of them at once and
                * cannot be forgotten by the next route — which is the same
                * argument GRW-203 made about the account button being an
                * opt-in prop.
                *
                * It sits INSIDE `.content` rather than replacing it because the
                * banner above and the mobile nav below are not main content. It
                * passes the grid sizing through (see `.content-main`) so the
                * middle row still behaves exactly as it did when `{children}`
                * was the grid item directly.
                */}
              <main className="content-main">{children}</main>
              <MobileChrome labels={labels} timezone={timezone} role={role} reportTabs={reportTabs} lang={lang} />
            </div>
          </div>
        </MobileNavProvider>
        </LabelsProvider>
        </BranchProvider>
        </SessionProvider>
        </NextIntlClientProvider>
        <InstallBanner app="salon" />
      </body>
    </html>
  );
}
