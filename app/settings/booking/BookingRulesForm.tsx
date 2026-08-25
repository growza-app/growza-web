'use client';

import { useState } from 'react';
import { api, type SettingsSummary } from '../../lib/api';

const SAVE_ERROR = 'Could not save — check the server is running.';

export function BookingRulesForm({ initial }: { initial: SettingsSummary }) {
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
      await api.updateBookingRules({
        slotGranularityMin,
        slotPolicy,
        minNoticeMin,
        bookingHorizonDays,
        cancellationCutoffMin,
      });
      setSaved(true);
    } catch {
      setError(SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-head">Booking settings</div>
      <div className="card-body">
        <div className="field">
          <label>
            <span>Slot length</span>
          </label>
          <input
            type="number"
            min={5}
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

        <div className="field" style={{ marginTop: 18 }}>
          <label>
            <span>Minimum notice</span>
          </label>
          <input type="number" min={0} step={5} value={minNoticeMin} onChange={(e) => setMinNoticeMin(Number(e.target.value))} />
          <span className="field-hint">Customers must book at least {minNoticeMin || 0} minutes ahead.</span>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label>
            <span>Booking horizon</span>
          </label>
          <input type="number" min={1} value={bookingHorizonDays} onChange={(e) => setBookingHorizonDays(Number(e.target.value))} />
          <span className="field-hint">Customers can book up to {bookingHorizonDays || 0} days ahead.</span>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label>
            <span>Cancellation cutoff</span>
          </label>
          <input
            type="number"
            min={0}
            step={15}
            value={cancellationCutoffMin}
            onChange={(e) => setCancellationCutoffMin(Number(e.target.value))}
          />
          <span className="field-hint">
            Bookings can&apos;t be cancelled within {cancellationCutoffMin || 0} minutes of the start time.
          </span>
        </div>

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
  );
}
