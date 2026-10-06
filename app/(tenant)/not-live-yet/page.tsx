import { redirect } from 'next/navigation';
import { screenTitle } from '../lib/page-title';
import { api } from '../lib/api';
import { serverLang } from '../lib/lang';
import { isLive } from '../lib/go-live';
import { setupCopy } from '../lib/setup-copy';
import { PageHeader } from '../components/PageHeader';

// Jira GRW-556 — a screen that opens at go-live, reached by its address before then.
export const metadata = screenTitle('Not open yet');

/**
 * What an address that opens at go-live lands on while the business is still being set up: one sentence that says
 * why, and the way back. Not an error — the owner did nothing wrong, the screen is simply not open yet.
 *
 * Once the business IS live this address means nothing, so it goes Home (a bookmarked "not live yet" must not
 * outlive the thing it describes).
 */
export default async function NotLiveYetPage() {
  try {
    if (isLive((await api.me()).tenant?.status)) redirect('/');
  } catch (error) {
    // `redirect()` works by throwing; anything else (a `/me` that cannot answer) just shows the page.
    if (error && typeof error === 'object' && 'digest' in error) throw error;
  }
  const c = setupCopy(await serverLang()).closed;
  return (
    <>
      <PageHeader title={c.title} />
      <div className="page-body">
        <div className="card not-live">
          <p className="not-live-body">{c.body}</p>
          <a className="btn" href="/">
            {c.back}
          </a>
        </div>
      </div>
    </>
  );
}
