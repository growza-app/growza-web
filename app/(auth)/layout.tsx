import '../(tenant)/globals.css';
import { BrowserGate } from '../(tenant)/components/BrowserGate';
import { PwaRegister } from '../(tenant)/components/PwaRegister';
import { InstallBanner } from '../shared/install/InstallBanner';
import { InstallPromptCapture } from '../shared/install/InstallPromptCapture';
import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AUTH_MESSAGES } from '../../i18n/client-messages';
import { pickNamespaces, type Messages } from '../../i18n/messages';
import { serverLang } from '../(tenant)/lib/lang';

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
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return {
    title: t('metaTitle'),
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

  /** Jira GRW-17 — see the note in `(tenant)/layout.tsx`: this is what makes `env(safe-area-inset-*)` non-zero. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f3d2e',
};

export default async function AuthLayout({ children }: { children: ReactNode }) {
  // Jira GRW-361 — the visitor's language from the cookie: no `api.me()` here (that would put back the redirect loop this layout exists to prevent).
  const lang = await serverLang();
  const messages = await getMessages();
  return (
    <html lang={lang}>
      <body>
        <NextIntlClientProvider locale={lang} messages={pickNamespaces(messages as Messages, AUTH_MESSAGES)}>
        {/* GRW-197 — the sign-in screen is where an unsupported browser lands
            FIRST. Telling them here saves a password attempt on a form whose
            button will never respond. */}
        <BrowserGate />
        <InstallPromptCapture />
        {children}
        <PwaRegister />
        <InstallBanner app="salon" />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
