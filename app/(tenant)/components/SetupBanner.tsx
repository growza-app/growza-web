import Link from 'next/link';
import type { ReactNode } from 'react';
import { setupCopy, setupHref } from '../lib/setup-copy';
import type { Lang } from '../lib/lang';
import { IconCheck, IconChevronRight } from './icons';

type SetupItem = { key: string; met: boolean; branchName?: string };

/**
 * Jira GRW-516 — shown in place of the billing banner while a business is `provisioning`.
 *
 * The whole checklist, not only what is missing: what is already done reads as progress, and what is left names
 * its screen and links to it. The owner can do all of it from here; the Growza team does the last step (going
 * live). Renders nothing for a live business, and nothing when the API could not say, so it never claims a state
 * it cannot know. A native <details>, open by default, so it can be folded away without any script.
 */
export function SetupBanner({ setup, lang }: { setup: { items: SetupItem[] } | null | undefined; lang: Lang }): ReactNode {
  if (!setup || setup.items.length === 0) return null;
  const c = setupCopy(lang);
  const wording = (item: SetupItem): string =>
    item.key === 'services'
      ? c.services
      : item.key === 'providers'
        ? c.providers
        : item.key === 'working_hours'
          ? c.workingHours
          : c.branchStaff(item.branchName ?? '');
  const done = setup.items.filter((i) => i.met).length;
  const total = setup.items.length;
  const allDone = done === total;

  return (
    <details className="setup-banner" open role="status">
      <summary className="setup-head">
        <span className="setup-title">{c.title}</span>
        <span className="setup-progress">{c.progress(done, total)}</span>
        <span className="setup-fold" aria-hidden>
          <IconChevronRight />
        </span>
      </summary>
      <p className="setup-intro">{allDone ? c.allDone : c.intro}</p>
      <ul className="setup-list">
        {setup.items.map((item) => {
          const href = item.met ? null : setupHref(item.key);
          const row = (
            <>
              <span className={item.met ? 'setup-dot setup-dot-done' : 'setup-dot'} aria-hidden>
                {item.met ? <IconCheck /> : null}
              </span>
              <span className="setup-text">
                <span className="setup-label">{wording(item)}</span>
                {!item.met && item.key === 'working_hours' ? <span className="setup-hint">{c.workingHoursHint}</span> : null}
              </span>
              <span className="setup-state">{item.met ? c.done : c.todo}</span>
              {href ? (
                <span className="setup-go" aria-hidden>
                  <IconChevronRight />
                </span>
              ) : null}
            </>
          );
          return (
            <li key={item.key} className={item.met ? 'setup-item setup-item-done' : 'setup-item'}>
              {href ? (
                <Link href={href} className="setup-row setup-row-link">
                  {row}
                </Link>
              ) : (
                <div className="setup-row">{row}</div>
              )}
            </li>
          );
        })}
        <li className="setup-item setup-item-last">
          <div className="setup-row">
            <span className="setup-dot" aria-hidden />
            <span className="setup-text">
              <span className="setup-label">{c.goLive}</span>
            </span>
            <span className="setup-state">{allDone ? c.todo : ''}</span>
          </div>
        </li>
      </ul>
    </details>
  );
}
