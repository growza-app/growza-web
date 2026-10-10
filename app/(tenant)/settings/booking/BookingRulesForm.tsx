'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError, type SettingsSummary } from '../../lib/api';
import { changeOf, daysOf, fromSaved, withDay, withoutDay } from './day-edits';
import { SettingsSaveBar } from '../SettingsSaveBar';
import { useCloseAfterSave } from '../../lib/close-after-save';
import { useWhatsappLive } from '../../components/SessionProvider';
import { showsBookingRule } from '../branch-keys';

/** "Mon, 20 Oct" for a stored "2026-10-20" — read as a calendar date, never shifted by the browser's timezone. */
function dayLabel(iso: string, locale: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(`${locale}-IN`, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** What a salon actually books by. Anything else already saved is added to this list rather than lost. */
const SLOT_CHOICES = [10, 15, 20, 30, 45, 60];

export function BookingRulesForm({ initial, branchName = null }: { initial: SettingsSummary; branchName?: string | null }) {
  const router = useRouter();
  const t = useTranslations('settingsBooking');
  const whatsappLive = useWhatsappLive();
  const shows = (key: string) => showsBookingRule(key, whatsappLive);
  // The same "{count} min" the menu and the free-times screen use, so one duration is written one way.
  const tmin = useTranslations('services');
  // Jira GRW-556 (follow-up) — Save finishes the task: back to the list, which says "Saved".
  const closeForm = useCloseAfterSave('/settings');
  const locale = useLocale();
  const day = (iso: string) => dayLabel(iso, locale);
  /** Jira GRW-248 — a branch is picked: these rules and closed days are that branch's. */
  const branchId = initial.scope.locationId;
  /**
   * This branch's own closed days (a one-branch business's: the business's). Jira GRW-398 — kept, like the
   * every-branch days below, as what this form changed and saved a day at a time (`day-edits.ts`).
   */
  const [own, setOwn] = useState(() => fromSaved(initial.booking.closedDates ?? []));
  const closedDates = daysOf(own);
  /**
   * Jira GRW-396 — days every branch is closed (a festival), kept by the business under every branch's own.
   * Settings has no "all branches" view any more, so they are added and removed here, from any branch.
   * Jira GRW-397 — sent as just the days changed: saving the whole list this page had loaded wiped a day another
   * tab had added since.
   */
  const [business, setBusiness] = useState(() => fromSaved(initial.booking.businessClosedDates ?? []));
  const businessClosed = daysOf(business);
  const [everyBranch, setEveryBranch] = useState(false);
  const [newClosed, setNewClosed] = useState('');
  const [slotGranularityMin, setSlotGranularityMin] = useState(initial.booking.slotGranularityMin);
  const [slotPolicy, setSlotPolicy] = useState(initial.booking.slotPolicy);
  const [minNoticeMin, setMinNoticeMin] = useState(initial.booking.minNoticeMin);
  const [bookingHorizonDays, setBookingHorizonDays] = useState(initial.booking.bookingHorizonDays);
  const [cancellationCutoffMin, setCancellationCutoffMin] = useState(initial.booking.cancellationCutoffMin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const b = initial.booking;
      if (branchId) {
        // Only what was changed becomes the branch's own; untouched rules keep following the business.
        const after = await api.updateBookingRules(
          {
            ...(slotGranularityMin !== b.slotGranularityMin ? { slotGranularityMin } : {}),
            ...(slotPolicy !== b.slotPolicy ? { slotPolicy } : {}),
            ...(minNoticeMin !== b.minNoticeMin ? { minNoticeMin } : {}),
            ...(bookingHorizonDays !== b.bookingHorizonDays ? { bookingHorizonDays } : {}),
            ...(cancellationCutoffMin !== b.cancellationCutoffMin ? { cancellationCutoffMin } : {}),
            ...changeOf(own),
          },
          branchId,
        );
        setOwn(fromSaved(after.booking.closedDates ?? []));
        if (business.added.length > 0 || business.removed.length > 0) {
          const forAll = await api.updateBookingRules(changeOf(business));
          setBusiness(fromSaved(forAll.booking.closedDates ?? []));
        }
        router.refresh();
      } else {
        const after = await api.updateBookingRules({
          slotGranularityMin,
          slotPolicy,
          minNoticeMin,
          bookingHorizonDays,
          cancellationCutoffMin,
          ...changeOf(own),
        });
        setOwn(fromSaved(after.booking.closedDates ?? []));
      }
      setSaved(true);
      closeForm();
    } catch (e) {
      // The server's own words ("Minimum notice must be shorter than…", "20 Sep 2026 has already passed").
      setError(e instanceof ApiError ? e.message : t('errors.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const addClosed = () => {
    if (!newClosed) return;
    if (branchId && everyBranch) {
      setBusiness(withDay(business, newClosed));
      // One chip per day (Jira GRW-397): closed for every branch covers this branch's own closing that day.
      if (closedDates.includes(newClosed)) setOwn(withoutDay(own, newClosed));
    } else if (!closedDates.includes(newClosed) && !(branchId && businessClosed.includes(newClosed))) {
      // Not a second chip for a day every branch is already closed (QA).
      setOwn(withDay(own, newClosed));
    }
    setNewClosed('');
    setSaved(false);
  };

  return (
    <>
    <div className="card">
      <div className="card-head">{t('title')}</div>
      <div className="card-body">
        {/* Jira GRW-228 — how times are offered | when customers may book, side by side on a laptop. */}
        <div className="rules-columns">
        <div className="rules-col">
        <div className="field">
          <label htmlFor="rule-slot">
            <span>{t('slotLength')}</span>
          </label>
          {/*
            A choice, not a typed number (design review, 2026-10-07): "offer choices instead of requiring text
            entry" (HIG, Entering data). It was a number field from 5 to 240 in steps of 5 — forty-eight
            answers, of which a salon uses five, and no salon has ever wanted bookings every 185 minutes.
            A value already saved that is not on the list is kept and shown, so an old setting is never
            silently rounded to something the owner did not choose.
          */}
          <select
            id="rule-slot"
            value={slotGranularityMin}
            onChange={(e) => setSlotGranularityMin(Number(e.target.value))}
          >
            {[...new Set([...SLOT_CHOICES, slotGranularityMin])]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {tmin('minutes', { count: n })}
                </option>
              ))}
          </select>
          {/* "Right after other bookings" ignores the interval (`computeCandidateStarts`), so say that, not a spacing. */}
          <span className="field-hint">{slotPolicy === 'gap_packed' ? t('slotHintGap') : t('slotHint', { count: slotGranularityMin || 0 })}</span>
        </div>

        <div style={{ marginTop: 18 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--muted)', marginBottom: 2 }}>
            {t('slotPattern')}
          </label>
          <label className="rules-option">
            <input type="radio" name="slotPolicy" checked={slotPolicy === 'fixed_grid'} onChange={() => setSlotPolicy('fixed_grid')} />
            <div className="rules-option-body">
              <div className="rules-option-title">{t('fixedGrid')}</div>
              <div className="rules-option-sub">{t('fixedGridSub')}</div>
            </div>
          </label>
          <label className="rules-option">
            <input type="radio" name="slotPolicy" checked={slotPolicy === 'gap_packed'} onChange={() => setSlotPolicy('gap_packed')} />
            <div className="rules-option-body">
              <div className="rules-option-title">{t('gapPacked')}</div>
              <div className="rules-option-sub">{t('gapPackedSub')}</div>
            </div>
          </label>
        </div>

        {/*
          * Jira GRW-229 — "Minimum notice" sits at the foot of the FIRST column, not the head of
          * the second. The two columns were 294px and 476px, and a grid row is as tall as its
          * tallest cell, so the second one alone decided the card's height: the pane scrolled 77px
          * at 1280×720 and 106px at 1366×680, with Save off the bottom. Moved, they are 399px and
          * 371px and the card fits. The reading order is unchanged — a two-column form is read down
          * then across, so this field still comes after the slot pattern and before the horizon.
          */}
        {/*
          Minimum notice, how far ahead and the cancel cutoff bind a CLIENT booking or cancelling by WhatsApp, and
          nobody else: the desk books with no notice (`bookingWindowFor` gives staff 0) and cancels at any time
          (`cancel.ts` checks only `cancelledVia === 'whatsapp'`). With WhatsApp off they changed nothing an owner
          could see, so they are not drawn (owner, 2026-10-10). Their values are kept and come back with it.
        */}
        {shows('min_notice_min') ? (
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="rule-notice">
            <span>{t('minNotice')}</span>
          </label>
          <input id="rule-notice" type="number" min={0} max={2880} step={5} value={minNoticeMin} onChange={(e) => setMinNoticeMin(Number(e.target.value))} />
          <span className="field-hint">{t('noticeHint', { count: minNoticeMin || 0 })}</span>
        </div>
        ) : null}

        </div>
        <div className="rules-col">
        {shows('booking_horizon_days') ? (
        <div className="field">
          <label htmlFor="rule-horizon">
            <span>{t('horizon')}</span>
          </label>
          <input id="rule-horizon" type="number" min={1} max={365} value={bookingHorizonDays} onChange={(e) => setBookingHorizonDays(Number(e.target.value))} />
          <span className="field-hint">{t('horizonHint', { count: bookingHorizonDays || 0 })}</span>
        </div>
        ) : null}

        {shows('cancellation_cutoff_min') ? (
        <div className="field" style={shows('booking_horizon_days') ? { marginTop: 14 } : undefined}>
          <label htmlFor="rule-cutoff">
            <span>{t('cutoff')}</span>
          </label>
          <input id="rule-cutoff"
            type="number"
            min={0}
            max={2880}
            step={15}
            value={cancellationCutoffMin}
            onChange={(e) => setCancellationCutoffMin(Number(e.target.value))}
          />
          <span className="field-hint">{t('cutoffHint', { count: cancellationCutoffMin || 0 })}</span>
        </div>
        ) : null}

        {/* Jira GRW-248 — days nobody can book: the business's, or with a branch picked, that branch's own. */}
        <div className="field closed-days" style={shows('booking_horizon_days') || shows('cancellation_cutoff_min') ? { marginTop: 14 } : undefined}>
          <label htmlFor="closed-day-new">
            <span>{branchId ? (branchName ? t('closedBranchNamed', { name: branchName }) : t('closedBranchUnnamed')) : t('closedBusiness')}</span>
          </label>
          <div className="closed-days-add">
            <input id="closed-day-new" type="date" value={newClosed} onChange={(e) => setNewClosed(e.target.value)} />
            <button type="button" className="btn btn-ghost" disabled={!newClosed} onClick={addClosed}>
              {t('add')}
            </button>
            {branchId && initial.branchCount > 1 ? (
              <label className="closed-days-every">
                <input type="checkbox" checked={everyBranch} onChange={(e) => setEveryBranch(e.target.checked)} />
                <span>{t('everyBranch')}</span>
              </label>
            ) : null}
          </div>
          <div className="closed-days-list">
            {closedDates.map((d) => (
              <span key={d} className="closed-day-chip">
                {day(d)}
                <button
                  type="button"
                  aria-label={t('removeAria', { day: day(d) })}
                  onClick={() => {
                    setOwn(withoutDay(own, d));
                    setSaved(false);
                  }}
                >
                  ×
                </button>
              </span>
            ))}
            {branchId
              ? businessClosed.map((d) => (
                  <span key={`all-${d}`} className="closed-day-chip closed-day-all" title={t('allBranchesTitle')}>
                    {t('allBranchesChip', { day: day(d) })}
                    <button
                      type="button"
                      aria-label={t('removeAllAria', { day: day(d) })}
                      onClick={() => {
                        setBusiness(withoutDay(business, d));
                        setSaved(false);
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))
              : null}
          </div>
          <span className="field-hint">
            {closedDates.length === 0 && !(branchId && businessClosed.length > 0)
              ? t('noClosed')
              : t('closedNote')}
          </span>
        </div>
        </div>
        </div>

        {error && <div role="alert" className="field-error">{error}</div>}
      </div>
    </div>
    <SettingsSaveBar
      busy={busy}
      saved={saved}
      onSave={save}
      saveLabel={t('save')}
      savingLabel={t('saving')}
      savedLabel={t('saved')}
    />
    </>
  );
}
