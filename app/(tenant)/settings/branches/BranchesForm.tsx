'use client';

import Link from 'next/link';
import { bookingLinkUrl, whatsappDigits } from '@growza-app/shared';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BranchActionDialog } from './BranchActionDialog';
import { IconCheck, IconMapPin, IconStaff } from '../../components/icons';
import { ApiError, BookingConflictError, api, type BranchSettings } from '../../lib/api';
import { useCloseAfterSave } from '../../lib/close-after-save';

/**
 * Jira GRW-227 — Settings › Branches: every branch of the business, each its
 * own card with its own Save.
 *
 * One Save per card rather than one for the page, because a branch is one
 * thing an owner corrects at a time ("Indiranagar moved") and a refused save
 * ("another branch already has this name") has to point at the card it came
 * from. Adding, closing and reordering branches stays in the admin portal;
 * opening hours are still one set for the whole business (Jira GRW-64).
 */

const NAME_MAX = 50;
const ADDRESS_MAX = 100;

type Draft = { name: string; addressLine1: string; addressCity: string };
const draftOf = (b: BranchSettings): Draft => ({ name: b.name, addressLine1: b.addressLine1, addressCity: b.addressCity });

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
      <div className="bp-branches">
        {initial.map((b) => (
          <BranchCard key={b.id} initial={b} whatsappNumber={whatsappNumber} demo={demo} />
        ))}
      </div>
      {/* Jira GRW-246 — the owner closes a branch or makes one main here; adding or reopening one raises the bill, so it goes through support. */}
      <p className="field-hint bp-foot">{t('foot')}</p>
    </div>
  );
}

function BranchCard({ initial, whatsappNumber, demo }: { initial: BranchSettings; whatsappNumber: string | null; demo: boolean }) {
  const t = useTranslations('settingsBranches');
  // Jira GRW-556 (follow-up) — Save finishes the task: back to the list, which says "Saved".
  const closeForm = useCloseAfterSave('/settings');
  const router = useRouter();
  const [branch, setBranch] = useState(initial);
  const [action, setAction] = useState<'close' | 'make-main' | null>(null);
  const [d, setD] = useState<Draft>(() => draftOf(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const saved0 = draftOf(branch);
  const dirty = d.name !== saved0.name || d.addressLine1 !== saved0.addressLine1 || d.addressCity !== saved0.addressCity;
  const set = (key: keyof Draft, value: string) => {
    setD((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setError(null);
    if (key === 'name') setNameError(null);
  };

  const save = async () => {
    if (!d.name.trim()) {
      setNameError(t('nameEmpty'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { branch: next } = await api.updateBranch(branch.id, d);
      setBranch(next);
      setD(draftOf(next));
      setSaved(true);
      closeForm();
    } catch (e) {
      // The client raises every 409 as BookingConflictError; here it can only be the name (BR-02).
      if (e instanceof BookingConflictError) setNameError(e.message);
      else setError(e instanceof ApiError && e.status === 400 ? e.message : t('errors.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const id = (field: string) => `branch-${branch.id}-${field}`;

  return (
    <form
      className="card bp-card"
      aria-labelledby={id('title')}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="bp-card-head">
        <span className="bp-card-icon">
          <IconMapPin />
        </span>
        <div className="bp-branch-title">
          <div className="bp-card-title" id={id('title')}>
            {branch.name}
            {branch.isPrimary ? <span className="bp-badge">{t('main')}</span> : null}
          </div>
          <div className="bp-branch-meta">
            <IconStaff /> {t('staff', { count: branch.staffCount })}
          </div>
        </div>
        {branch.isPrimary ? null : (
          <div className="bp-branch-actions">
            <button type="button" className="btn btn-ghost bp-action-btn" onClick={() => setAction('make-main')}>
              {t('makeMain')}
            </button>
            <button type="button" className="btn btn-ghost btn-danger bp-action-btn" onClick={() => setAction('close')}>
              {t('closeBranch')}
            </button>
          </div>
        )}
      </div>
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

      <div className="bp-grid">
        <div className="field">
          <label htmlFor={id('name')}>
            <span>{t('fields.branchName')}</span>
            <span className="field-counter">
              {d.name.length}/{NAME_MAX}
            </span>
          </label>
          <input
            id={id('name')}
            type="text"
            value={d.name}
            maxLength={NAME_MAX}
            onChange={(e) => set('name', e.target.value)}
            className={nameError ? 'field-invalid' : ''}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? id('name-error') : undefined}
          />
          {nameError ? (
            <div role="alert" className="field-error" id={id('name-error')}>
              {nameError}
            </div>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor={id('city')}>
            <span>{t('fields.city')}</span>
          </label>
          <input id={id('city')} type="text" value={d.addressCity} onChange={(e) => set('addressCity', e.target.value)} />
        </div>
        <div className="field bp-span">
          <label htmlFor={id('address')}>
            <span>{t('fields.address')}</span>
            <span className="field-counter">
              {d.addressLine1.length}/{ADDRESS_MAX}
            </span>
          </label>
          <input id={id('address')} type="text" value={d.addressLine1} maxLength={ADDRESS_MAX} onChange={(e) => set('addressLine1', e.target.value)} placeholder={t('addressPlaceholder')} />
        </div>
      </div>

      <BookingLink branch={branch} whatsappNumber={whatsappNumber} demo={demo} />

      <div className="bp-card-actions" role="status" aria-live="polite">
        <span className={`bp-save-state ${error ? 'is-error' : ''}`}>
          {error ? (
            error
          ) : saved && !dirty ? (
            <>
              <IconCheck /> {t('saved')}
            </>
          ) : dirty ? (
            t('unsaved')
          ) : null}
        </span>
        <button type="submit" className="btn bp-save" disabled={busy || !dirty}>
          {busy ? t('saving') : t('saveBranch')}
        </button>
      </div>
    </form>
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
