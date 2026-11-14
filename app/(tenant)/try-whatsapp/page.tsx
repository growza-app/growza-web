import { screenTitle } from '../lib/page-title';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { ChatWindow } from './ChatWindow';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { loadErrorKind } from '../lib/load-error';
import { guardScreen, guardWritable } from '../lib/screen-guard';

export const dynamic = 'force-dynamic';

/** A local stand-in for the real WhatsApp channel (FND-04, pending Meta approval) — proves the booking flow customers will actually use. */
export default async function TryWhatsAppPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  // Jira GRW-409 — a role the nav does not offer this screen lands on Home, not on controls that answer 403.
  await guardScreen('/try-whatsapp');
  // Jira GRW-556 (follow-up) — every tap on this screen starts a chat the API refuses for a suspended business.
  await guardWritable('/');
  // Jira GRW-385 — opened from a branch's booking link in Settings › Branches: the chat starts at that branch.
  const { branch } = await searchParams;
  const t = await getTranslations('tryWhatsApp');
  let me;
  try {
    me = await api.me();
  } catch (error) {
    return (
      <>
        <PageHeader title={t('title')} />
        <div className="page-body">
          <LoadErrorBanner kind={loadErrorKind(error)} />
        </div>
      </>
    );
  }

  /**
   * Jira GRW-266 · GRW-271 — production has no demo: the API does not register `/chat/*`
   * there, so this screen could only fail. A typed-in or bookmarked URL gets the
   * ordinary not-found page instead of a phone that cannot start a chat.
   */
  if (!me.whatsapp?.demo) notFound();

  return (
    <>
      {/**
        * Jira GRW-158 · GRW-165 — in the SUBTITLE, not a banner in the body.
        *
        * This is the screen most easily mistaken for a live channel, because
        * everything on it works — so it has to say so. It said the wrong thing
        * to the wrong person: "until Meta approval is live" is developer-facing,
        * and an owner does not know what Meta approval is.
        *
        * A banner above the phone was the first attempt and was wrong twice
        * over: the page is fit-to-screen, so 65px of banner pushed the phone
        * past the bottom of its own region, and the region then scrolled to the
        * focused input and hid the banner. A caveat nobody can see is worse
        * than none, because it looks like due diligence was done.
        */}
      <PageHeader
        title={t('title')}
        subtitle={me.whatsapp?.booking ? t('subtitleLive') : t('tryIsADemo')}
      />
      <div className="page-body">
        {/* Emerald v3 (owner, 14 Nov 2026: "fix all") — on a laptop the phone stood alone in a wide grey page; three
            short steps beside it say what to do. On a phone the wrapper has no box and the steps are hidden. */}
        <div className="tw-desk">
          <ChatWindow tenantName={me.tenant?.name ?? (await getTranslations('chrome'))('yourBusiness')} branch={branch} />
          <aside className="tw-how" aria-labelledby="tw-how-title">
            <h2 id="tw-how-title">{t('how.title')}</h2>
            <ol>
              <li>{t('how.step1')}</li>
              <li>{t('how.step2')}</li>
              <li>{t('how.step3')}</li>
            </ol>
          </aside>
        </div>
      </div>
    </>
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('WhatsApp');
