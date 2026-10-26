'use client';

import Link from '../../shared/AppLink';
import { useLayoutEffect, useState, type ReactNode } from 'react';
import { setupCopy, setupHref } from '../lib/setup-copy';
import type { Lang } from '../lib/lang';
import { IconCheck, IconChevronRight } from './icons';

type SetupItem = { key: string; met: boolean; branchName?: string };

/** The items this screen knows how to word. Anything else the API sends later is left out, not mis-worded. */
const KNOWN = new Set(['services', 'providers', 'salon_hours', 'working_hours']);
const known = (item: SetupItem) => KNOWN.has(item.key) || item.key.startsWith('branch:');

/**
 * Jira GRW-516 — shown in place of the billing banner while a business is `provisioning`.
 *
 * The whole checklist, not only what is missing: what is already done reads as progress, and what is left links to
 * its screen. The owner's alone: `/me` sends it to nobody else, since a receptionist or stylist can do none of it.
 * Renders nothing for a live business, and nothing when the API could not say.
 *
 * Folded by default on a phone: the banner sits above every screen, and the open list is taller than half of a
 * small phone. Folded, it still says how far along the setup is and what comes next. On a wider screen it opens.
 *
 * Owner, 2026-10-26 — the same banner in `attention` mode, for a LIVE business that has since lost something
 * off the list (`/me` sends only the missing rows then, and sends nothing at all when nothing is missing).
 * It says so in its own words, drops the progress count — "0 of 1 done" about a business already trading is a
 * sentence nobody needs — and opens on a phone too, being one or two rows rather than five.
 */
export function SetupBanner({
  setup,
  lang,
}: {
  setup: { mode?: 'setup' | 'attention'; items: SetupItem[] } | null | undefined;
  lang: Lang;
}): ReactNode {
  const attention = setup?.mode === 'attention';
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    if (attention || !window.matchMedia('(max-width: 860px)').matches) setOpen(true);
  }, [attention]);

  const items = (setup?.items ?? []).filter(known);
  if (items.length === 0) return null;
  const c = setupCopy(lang);
  const wording = (item: SetupItem): string =>
    item.key === 'services'
      ? c.services
      : item.key === 'providers'
        ? c.providers
        : item.key === 'salon_hours'
          ? c.salonHours
          : item.key === 'working_hours'
            ? c.workingHours
            : c.branchStaff(item.branchName ?? '');
  const done = items.filter((i) => i.met).length;
  const firstLeft = items.find((i) => !i.met);

  return (
    <details
      className={attention ? 'setup-banner setup-banner-attention' : 'setup-banner'}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="setup-head">
        <span className="setup-head-text">
          <span className="setup-title">{attention ? c.attentionTitle : c.title}</span>
          {open ? null : <span className="setup-next">{firstLeft ? c.next(wording(firstLeft)) : c.allDone}</span>}
        </span>
        {attention ? null : <span className="setup-progress">{c.progress(done, items.length)}</span>}
        <span className="setup-fold" aria-hidden>
          <IconChevronRight />
        </span>
      </summary>
      <p className="setup-intro" role="status">
        {attention ? c.attention : firstLeft ? c.intro : c.allDone}
      </p>
      <ul className="setup-list">
        {items.map((item) => {
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
                <Link
                  href={href}
                  className="setup-row setup-row-link"
                  // On a phone, fold on the way out: the open list would otherwise sit over the screen the owner went
                  // to fix (QA). A wider screen keeps it open, as it was.
                  onClick={() => {
                    if (window.matchMedia('(max-width: 860px)').matches) setOpen(false);
                  }}
                >
                  {row}
                </Link>
              ) : (
                <div className="setup-row">{row}</div>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
