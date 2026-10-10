'use client';

import Link from 'next/link';
import { bookingLinkUrl, whatsappDigits } from '@growza-app/shared';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BranchActionDialog } from './BranchActionDialog';
import { IconChevronRight, IconMapPin, IconStaff } from '../../components/icons';
import { type BranchSettings } from '../../lib/api';
import { useWhatsappLive } from '../../components/SessionProvider';
import { withBranch } from '../branch-link';

/**
 * Jira GRW-227 — Settings › Branches: every branch of the business, one line each.
 *
 * Each branch used to be a full form here — name, city, address, a booking-link paragraph and its own Save — so
 * five branches were five stacked forms, and the name and address were ALSO the first three fields of Branch
 * profile: two places to change one thing (owner, 2026-10-10). A branch is now one row that opens its Branch
 * profile (`?branch=` switches the header to it, `BranchUrlSync`), where its details are edited in one place.
 *
 * What stays here is what is about the set of branches rather than one branch: which is main, and closing one.
 * Adding or reopening a branch raises the bill, so it still goes through support (Jira GRW-246).
 */
export function BranchesForm({
  initial,
  whatsappNumber = null,
  demo = false,
}: {
  initial: BranchSettings[];
  /** Jira GRW-385 — the number a booking link opens WhatsApp at: the business's phone. */
  whatsappNumber?: string | null;
  demo?: boolean;
}) {
  const t = useTranslations('settingsBranches');
  return (
    <div className="bp-form">
      <div className="bp-intro">
        <h2 className="bp-title">{t('title')}</h2>
        <p className="bp-sub">{t('intro', { count: initial.length })}</p>
      </div>
      <ul className="menu-list bp-rows">
        {initial.map((b) => (
          <BranchRow key={b.id} branch={b} whatsappNumber={whatsappNumber} demo={demo} />
        ))}
      </ul>
      {/* Jira GRW-246 — the owner closes a branch or makes one main here; adding or reopening one raises the bill, so it goes through support. */}
      <p className="field-hint bp-foot">{t('foot')}</p>
    </div>
  );
}

function BranchRow({ branch, whatsappNumber, demo }: { branch: BranchSettings; whatsappNumber: string | null; demo: boolean }) {
  const t = useTranslations('settingsBranches');
  const router = useRouter();
  const whatsappLive = useWhatsappLive();
  const [action, setAction] = useState<'close' | 'make-main' | null>(null);
  return (
    <li className="bp-row">
      {/* No aria-label: its text — the name, "Main", the staff count — is the accessible name, and a label would hide it. */}
      <Link className="settings-row" href={withBranch('/settings/profile', branch.id)}>
        <span className="settings-row-icon">
          <IconMapPin />
        </span>
        <div className="settings-row-body">
          <div className="settings-row-title">
            {branch.name}
            {branch.isPrimary ? <span className="bp-badge">{t('main')}</span> : null}
          </div>
          <div className="bp-branch-meta">
            <IconStaff /> {t('staff', { count: branch.staffCount })}
          </div>
        </div>
        <span className="settings-row-chev">
          <IconChevronRight />
        </span>
      </Link>
      {branch.isPrimary ? null : (
        <div className="bp-row-actions">
          <button type="button" className="btn btn-ghost bp-action-btn" onClick={() => setAction('make-main')}>
            {t('makeMain')}
          </button>
          <button type="button" className="btn btn-ghost btn-danger bp-action-btn" onClick={() => setAction('close')}>
            {t('closeBranch')}
          </button>
        </div>
      )}
      {/*
        A WhatsApp booking link: with WhatsApp off it opens a chat nobody answers, so it is not offered — except in the
        demo, where its "Try it" is the way into the WhatsApp try-out (`/try-whatsapp`).
      */}
      {whatsappLive || demo ? <BookingLink branch={branch} whatsappNumber={whatsappNumber} demo={demo} /> : null}
      {action ? (
        <BranchActionDialog
          action={action}
          branch={{ id: branch.id, name: branch.name }}
          onCancel={() => setAction(null)}
          onDone={() => {
            setAction(null);
            router.refresh();
          }}
        />
      ) : null}
    </li>
  );
}

/**
 * Jira GRW-385 — the branch's own booking link: for its QR on the counter and its Instagram bio. It opens
 * WhatsApp at the business's number with a message naming the branch, so the chat starts there instead of asking.
 */
function BookingLink({ branch, whatsappNumber, demo }: { branch: BranchSettings; whatsappNumber: string | null; demo: boolean }) {
  const t = useTranslations('settingsBranches');
  const [copied, setCopied] = useState(false);
  const url = bookingLinkUrl(whatsappNumber, branch.name, branch.id);
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="field bp-link">
      <span className="field-label">{t('bookingLink')}</span>
      {url ? (
        <div className="bp-link-row">
          <input type="text" readOnly value={url} aria-label={t('bookingLinkAria', { name: branch.name })} onFocus={(e) => e.target.select()} />
          <button type="button" className="btn btn-ghost" onClick={() => void copy()}>
            {copied ? t('copied') : t('copy')}
          </button>
        </div>
      ) : (
        <span className="field-hint">{t('bookingLinkNoNumber')}</span>
      )}
      {/* Jira GRW-399 — the number it opens, so an owner whose customers message another number sees it. */}
      {url ? <span className="field-hint">{t('bookingLinkNumber', { number: `+${whatsappDigits(whatsappNumber)}` })}</span> : null}
      <span className="field-hint">
        {t('bookingLinkHint')}{' '}
        {demo ? <Link href={`/try-whatsapp?branch=${branch.id}`}>{t('tryIt')}</Link> : null}
      </span>
    </div>
  );
}
