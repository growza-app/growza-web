'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ADMIN_HOST } from '../../shared/admin-address';

/**
 * Jira GRW-689 — the end of "Open as business" from admin.growza.biz.
 *
 * The admin page sent the browser here with the support session's grant in the fragment. The fragment is never sent
 * to a server, and it is wiped from the address bar before anything else, so it lands in no log and no history entry.
 * The API turns a live grant into this address's own session cookie, and the business's dashboard opens as usual,
 * with the support banner. An ended or made-up grant sets nothing.
 */
export default function ClaimSession() {
  const t = useTranslations('auth.claimSession');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const grant = decodeURIComponent(window.location.hash.slice(1));
    window.history.replaceState(null, '', '/claim-session');
    if (!grant) {
      setFailed(true);
      return;
    }
    fetch('/api/v1/auth/claim-impersonation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grant }) })
      .then((res) => (res.ok ? window.location.replace('/') : setFailed(true)))
      .catch(() => setFailed(true));
  }, []);
  return (
    <main className="claim-session" style={{ padding: 'var(--sp-6) var(--sp-4)', maxWidth: '28rem', margin: '0 auto' }}>
      {failed ? (
        <>
          <h1>{t('failedTitle')}</h1>
          <p>{t('failedBody')}</p>
          <p>
            <a className="btn" href={`https://${ADMIN_HOST}/admin`}>
              {t('back')}
            </a>
          </p>
        </>
      ) : (
        <p role="status">{t('opening')}</p>
      )}
    </main>
  );
}
