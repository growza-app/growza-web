'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError, type SettingsSummary } from '../../lib/api';
import { BranchScopeNote } from '../BranchScopeNote';

const SAVE_ERROR = 'Could not save — check the server is running.';

/** Jira GRW-248 — the settings keys this form can keep per branch, for the "own / business's" note. */
const BRANCH_KEYS = ['slot_granularity_min', 'slot_policy', 'min_notice_min', 'booking_horizon_days', 'cancellation_cutoff_min', 'closed_dates'];

/** "Mon, 20 Oct" for a stored "2026-10-20" — read as a calendar date, never shifted by the browser's timezone. */
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function BookingRulesForm({ initial, branchName = null }: { initial: SettingsSummary; branchName?: string | null }) {
  const router = useRouter();
  /** Jira GRW-248 — a branch is picked: these rules and closed days are that branch's. */
  const branchId = initial.scope.locationId;
  const [closedDates, setClosedDates] = useState<string[]>(initial.booking.closedDates ?? []);
  const [newClosed, setNewClosed] = useState('');
  const [slotGranularityMin, setSlotGranularityMin] = useState(initial.booking.slotGranularityMin);
  const [slotPolicy, setSlotPolicy] = useState(initial.booking.slotPolicy);
  const [minNoticeMin, setMinNoticeMin] = useState(initial.booking.minNoticeMin);
  const [bookingHorizonDays, setBookingHorizonDays] = useState(initial.booking.bookingHorizonDays);
  const [cancellationCutoffMin, setCancellationCutoffMin] = useState(initial.booking.cancellationCutoffMin);
  const [staffSeesClientContact, setStaffSeesClientContact] = useState(initial.booking.staffSeesClientContact);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const b = initial.booking;
      const sameDays = closedDates.join() === (b.closedDates ?? []).join();
      if (branchId) {
        // Only what was changed becomes the branch's own; untouched rules keep following the business.
        await api.updateBookingRules(
          {
            ...(slotGranularityMin !== b.slotGranularityMin ? { slotGranularityMin } : {}),
            ...(slotPolicy !== b.slotPolicy ? { slotPolicy } : {}),
            ...(minNoticeMin !== b.minNoticeMin ? { minNoticeMin } : {}),
            ...(bookingHorizonDays !== b.bookingHorizonDays ? { bookingHorizonDays } : {}),
            ...(cancellationCutoffMin !== b.cancellationCutoffMin ? { cancellationCutoffMin } : {}),
            ...(sameDays ? {} : { closedDates }),
          },
          branchId,
        );
        router.refresh();
      } else {
        await api.updateBookingRules({
          slotGranularityMin,
          slotPolicy,
          minNoticeMin,
          bookingHorizonDays,
          cancellationCutoffMin,
          staffSeesClientContact,
          ...(sameDays ? {} : { closedDates }),
        });
      }
      setSaved(true);
    } catch (e) {
      // The server's own words ("Minimum notice must be shorter than…", "20 Sep 2026 has already passed").
      setError(e instanceof ApiError ? e.message : SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const addClosed = () => {
    if (!newClosed || closedDates.includes(newClosed)) return;
    setClosedDates([...closedDates, newClosed].sort());
    setNewClosed('');
    setSaved(false);
  };

  return (
    <>
    <BranchScopeNote settings={initial} branchName={branchName} keys={BRANCH_KEYS} what="booking rules" />
    <div className="card">
      <div className="card-head">Booking settings</div>
      <div className="card-body">
        {/* Jira GRW-228 — how times are offered | when customers may book, side by side on a laptop. */}
        <div className="rules-columns">
        <div className="rules-col">
        <div className="field">
          <label>
            <span>Slot length</span>
          </label>
          <input
            type="number"
            min={5}
            max={240}
            step={5}
            value={slotGranularityMin}
            onChange={(e) => setSlotGranularityMin(Number(e.target.value))}
          />
          <span className="field-hint">Bookable times are shown every {slotGranularityMin || 0} minutes.</span>
        </div>

        <div style={{ marginTop: 18 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--muted)', marginBottom: 2 }}>
            Slot pattern
          </label>
          <label className="rules-option">
            <input type="radio" name="slotPolicy" checked={slotPolicy === 'fixed_grid'} onChange={() => setSlotPolicy('fixed_grid')} />
            <div className="rules-option-body">
              <div className="rules-option-title">Fixed grid</div>
              <div className="rules-option-sub">Times always land on the slot length above — e.g. 9:00, 9:30, 10:00.</div>
            </div>
          </label>
          <label className="rules-option">
            <input type="radio" name="slotPolicy" checked={slotPolicy === 'gap_packed'} onChange={() => setSlotPolicy('gap_packed')} />
            <div className="rules-option-body">
              <div className="rules-option-title">Gap-packed</div>
              <div className="rules-option-sub">Times fill the gaps between existing bookings as tightly as possible.</div>
            </div>
          </label>
        </div>

        </div>
        <div className="rules-col">
        <div className="field">
          <label>
            <span>Minimum notice</span>
          </label>
          <input type="number" min={0} max={2880} step={5} value={minNoticeMin} onChange={(e) => setMinNoticeMin(Number(e.target.value))} />
          <span className="field-hint">Customers must book at least {minNoticeMin || 0} minutes ahead.</span>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label>
            <span>Booking horizon</span>
          </label>
          <input type="number" min={1} max={365} value={bookingHorizonDays} onChange={(e) => setBookingHorizonDays(Number(e.target.value))} />
          <span className="field-hint">Customers can book up to {bookingHorizonDays || 0} days ahead.</span>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label>
            <span>Cancellation cutoff</span>
          </label>
          <input
            type="number"
            min={0}
            max={2880}
            step={15}
            value={cancellationCutoffMin}
            onChange={(e) => setCancellationCutoffMin(Number(e.target.value))}
          />
          <span className="field-hint">
            Customers can&apos;t cancel within {cancellationCutoffMin || 0} minutes of the start time.
          </span>
        </div>

        {/* Jira GRW-248 — days nobody can book: the business's, or with a branch picked, that branch's own. */}
        <div className="field closed-days" style={{ marginTop: 14 }}>
          <label htmlFor="closed-day-new">
            <span>{branchId ? `Days ${branchName ?? 'this branch'} is closed` : 'Days you are closed'}</span>
          </label>
          <div className="closed-days-add">
            <input id="closed-day-new" type="date" value={newClosed} onChange={(e) => setNewClosed(e.target.value)} />
            <button type="button" className="btn btn-ghost" disabled={!newClosed} onClick={addClosed}>
              Add
            </button>
          </div>
          <div className="closed-days-list">
            {closedDates.map((d) => (
              <span key={d} className="closed-day-chip">
                {dayLabel(d)}
                <button
                  type="button"
                  aria-label={`Open again on ${dayLabel(d)}`}
                  onClick={() => {
                    setClosedDates(closedDates.filter((x) => x !== d));
                    setSaved(false);
                  }}
                >
                  ×
                </button>
              </span>
            ))}
            {branchId
              ? (initial.booking.businessClosedDates ?? []).map((d) => (
                  <span key={`all-${d}`} className="closed-day-chip closed-day-all" title="Closed at every branch — change it under All branches">
                    {dayLabel(d)} · all branches
                  </span>
                ))
              : null}
          </div>
          <span className="field-hint">
            {closedDates.length === 0 && !(branchId && (initial.booking.businessClosedDates ?? []).length > 0)
              ? 'No closed days. Add a holiday and nobody can book that day.'
              : 'Nobody can book on these days. Bookings already made are not cancelled.'}
          </span>
        </div>
        </div>
        </div>

        {/*
          GRW-166 — a privacy decision rather than a booking rule, so it sits
          apart from the numbers above with its own separator. Worded for an
          owner: what their team can see, not what the API returns.
        */}
        {/* Who sees client contact is the business's decision, not a branch's (Jira GRW-248). */}
        {branchId ? null : (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <label className="switch" style={{ marginTop: 2 }}>
              <input
                type="checkbox"
                checked={staffSeesClientContact}
                onChange={() => setStaffSeesClientContact((v) => !v)}
              />
              <span className="switch-track">
                <span className="switch-thumb" />
              </span>
            </label>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 620, fontSize: 14.5 }}>Staff can see client name and number</div>
              <span className="field-hint" style={{ margin: '4px 0 0' }}>
                {staffSeesClientContact
                  ? 'Your team sees who each booking is for, and can call them.'
                  : 'Your team sees the booking, the service and the time — but not who it is for. You and your managers still see everything.'}
              </span>
            </div>
          </div>
        </div>
        )}

        {error && <div className="field-error">{error}</div>}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          {saved && !busy && (
            <span className="field-hint" style={{ margin: 0, color: 'var(--accent-deep)' }}>
              Saved
            </span>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
