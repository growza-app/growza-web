'use client';

import { useState } from 'react';
import { PhoneField } from '../../components/PhoneField';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DateTime } from 'luxon';
import {
  api,
  ApiError,
  type ProviderDay,
  type ProviderDetail,
  type ProviderStats,
  type ProviderWorkingHourRow,
  type Service,
} from '../../lib/api';
import { toWeekdayRows, WeekdayHoursEditor, type WeekdayRow } from '../../components/WeekdayHoursEditor';
import { IconArrowLeft, IconCheck } from '../../components/icons';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { copy } from '../../lib/copy';
import { validateRequired } from '../../lib/validate';
import { fromStoredPhone, toStoredPhone, validateNationalPhone } from '../../lib/phone';
import { avatarTone, initials } from '../StaffRoster';
import { useLabel } from '../../components/LabelsProvider';

const SAVE_ERROR = 'Could not save — check the server is running.';

function rowsEqual(a: WeekdayRow[], b: WeekdayRow[]): boolean {
  return (
    a.length === b.length &&
    a.every((r, i) => r.weekday === b[i]!.weekday && r.open === b[i]!.open && (!r.open || (r.startTime === b[i]!.startTime && r.endTime === b[i]!.endTime)))
  );
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((v) => b.has(v));
}

function hours(minutes: number): string {
  return `${Math.round(minutes / 60)}`;
}

export function StaffEditClient({
  detail: initialDetail,
  services,
  day,
  stats,
  staffWord,
  orgWorkingHours,
}: {
  detail: ProviderDetail;
  services: Service[];
  day: ProviderDay | null;
  stats: ProviderStats | null;
  staffWord: string;
  /** The business's default week — previewed in the editor when "Same as the business" is on, so that switch can defer to Save like every other field. */
  orgWorkingHours: ProviderWorkingHourRow[];
}) {
  const providerWord = useLabel('provider', 'Staff member');
  const router = useRouter();
  const [detail, setDetail] = useState(initialDetail);

  const [displayName, setDisplayName] = useState(detail.displayName);
  const [title, setTitle] = useState(detail.title ?? '');
  const [phone, setPhone] = useState(detail.phone ?? '');
  const [active, setActive] = useState(detail.active);
  const [unavailableToday, setUnavailableToday] = useState(detail.unavailableToday);
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set(detail.serviceIds));
  const [hourRows, setHourRows] = useState<WeekdayRow[]>(() => toWeekdayRows(detail.workingHours));
  const [usesOrgHours, setUsesOrgHours] = useState(detail.usesOrgHours);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showAllDays, setShowAllDays] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  /** Per-field messages, shown under the field itself rather than as one banner — a top-level "check the form" makes the user hunt. */
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; phone?: string }>({});

  const resetFrom = (d: ProviderDetail) => {
    setDetail(d);
    setDisplayName(d.displayName);
    setTitle(d.title ?? '');
    // GRW-199 — the field holds ten NATIONAL digits; the stored value is E.164.
    setPhone(fromStoredPhone(d.phone));
    setActive(d.active);
    setUnavailableToday(d.unavailableToday);
    setSelectedServiceIds(new Set(d.serviceIds));
    setHourRows(toWeekdayRows(d.workingHours));
    setUsesOrgHours(d.usesOrgHours);
  };

  const aboutDirty =
    displayName !== detail.displayName ||
    title !== (detail.title ?? '') ||
    phone !== (detail.phone ?? '') ||
    active !== detail.active;
  const skillsDirty = !setsEqual(selectedServiceIds, new Set(detail.serviceIds));
  const orgHoursDirty = usesOrgHours !== detail.usesOrgHours;
  const availabilityDirty = unavailableToday !== detail.unavailableToday;
  // While "Same as the business" is on the rows are a read-only preview of the org
  // week, so there is nothing of the user's own in them to be dirty about.
  const hoursDirty = !usesOrgHours && !rowsEqual(hourRows, toWeekdayRows(detail.workingHours));
  const dirty = aboutDirty || skillsDirty || hoursDirty || orgHoursDirty || availabilityDirty;

  const updateHourRow = (weekday: number, patch: Partial<WeekdayRow>) => {
    setHourRows((prev) => prev.map((r) => (r.weekday === weekday ? { ...r, ...patch } : r)));
    setSaved(false);
  };

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSaved(false);
  };

  /**
   * "Same as the business" is a form field, not an instant action: flipping it only
   * previews the business's week in the (disabled) editor and marks the form
   * dirty — Save is what persists it. Previously this wrote to the server on
   * flip, which left Save greyed out and made the switch look broken.
   */
  const toggleOrgHours = (next: boolean) => {
    setUsesOrgHours(next);
    setHourRows(toWeekdayRows(next ? orgWorkingHours : detail.workingHours));
    setSaved(false);
  };

  const validateAll = () => {
    const next = {
      name: validateRequired(displayName, 'Name') ?? undefined,
      phone: validateNationalPhone(phone) ?? undefined,
    };
    setFieldErrors(next);
    return next;
  };

  const save = async () => {
    const errs = validateAll();
    if (errs.name || errs.phone) {
      setError(null);
      return;
    }
    const openRows = hourRows.filter((r) => r.open);
    if (!usesOrgHours && openRows.some((r) => r.startTime >= r.endTime)) {
      return setError('Start time must be before end time');
    }

    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const calls: Array<Promise<unknown>> = [];
      if (aboutDirty || orgHoursDirty) {
        calls.push(
          api.updateProviderProfile(detail.id, {
            displayName: displayName.trim(),
            // Stored E.164, so the separators a human typed are stripped once
            // here rather than leaving "+91 98765 43210" in the column.
            phone: toStoredPhone(phone) ?? '',
            title: title.trim() || null,
                  active,
            usesOrgHours,
          }),
        );
      }
      if (skillsDirty) calls.push(api.updateProviderServices(detail.id, [...selectedServiceIds]));
      if (availabilityDirty) calls.push(api.setProviderAvailabilityToday(detail.id, unavailableToday));
      if (hoursDirty && !usesOrgHours) {
        calls.push(
          api.updateProviderWorkingHours(
            detail.id,
            openRows.map((r) => ({ weekday: r.weekday, startTime: r.startTime, endTime: r.endTime })),
          ),
        );
      }
      await Promise.all(calls);
      resetFrom(await api.providerDetail(detail.id));
      setSaved(true);
      router.refresh();
    } catch {
      setError(SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Deferred like every other field on this screen. The roster row still
   * flips availability instantly — there the switch IS the whole interaction
   * and there is no Save button to reconcile with. On a form, one Save owns
   * every pending change; a control that self-applied would leave the screen
   * with two different save models.
   */
  const setAvailableToday = (available: boolean) => {
    setUnavailableToday(!available);
    setSaved(false);
  };

  const setActiveAndSave = async (next: boolean) => {
    if (!next) {
      setConfirmRemove(true);
      return;
    }
    await applyActive(true);
  };

  const applyActive = async (next: boolean) => {
    setBusy(true);
    try {
      await api.updateProviderProfile(detail.id, { active: next });
      setActive(next);
      setDetail((prev) => ({ ...prev, active: next }));
      router.refresh();
      if (!next) router.push('/providers');
    } catch (e) {
      /*
       * QA on GRW-23: un-retiring can now be REFUSED, because bringing
       * somebody back takes a seat exactly as hiring them does. Swallowing
       * that into "check the server is running" is the same defect GRW-23
       * fixed on the Add-staff panel — it sends an owner who has run out of
       * seats to go and look at their server.
       */
      setError(e instanceof ApiError && e.status === 403 ? e.message : SAVE_ERROR);
    } finally {
      setBusy(false);
      setConfirmRemove(false);
    }
  };

  // Only what's still ahead today — a list of appointments already finished is
  // not context for a change you're about to make.
  const upcoming = (day?.entries ?? []).filter((e) => e.kind === 'booking' && DateTime.fromISO(e.startAt) > DateTime.now());
  const visibleDays = showAllDays ? hourRows : hourRows.filter((r) => r.open);
  const hiddenDayCount = hourRows.length - visibleDays.length;

  return (
    <>
      <div className="edit-header">
        <div className="edit-header-left">
          <Link href="/providers" className="staff-icon-btn" aria-label={`Back to ${staffWord}`}>
            <IconArrowLeft />
          </Link>
          <div className={`staff-avatar ${avatarTone(detail.displayName)} edit-header-avatar`}>{initials(detail.displayName)}</div>
          <div>
            <div className="edit-crumb">
              <Link href="/providers">{staffWord}</Link> · Edit
            </div>
            <h1 className="edit-title">{detail.displayName}</h1>
          </div>
        </div>
        <div className="edit-header-actions">
          <div className="edit-header-toggle">
            <span className="staff-toggle-label">
              {unavailableToday ? 'Off today' : 'Available'}
            </span>
            <label className="switch switch-lg" title="Available today">
              <input
                type="checkbox"
                checked={!unavailableToday}
                disabled={busy}
                aria-label={`${detail.displayName} available today`}
                onChange={(e) => setAvailableToday(e.target.checked)}
              />
              <span className="switch-track">
                <span className="switch-thumb" />
              </span>
            </label>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => router.push('/providers')} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={save} disabled={busy || !dirty}>
            {busy ? 'Saving…' : saved && !dirty ? 'Saved' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="page-body">
        {error && <div className="field-error edit-banner">{error}</div>}

        <div className="edit-layout">
          <div className="edit-main">
            <section className="card edit-card">
              <div className="edit-card-title">Details</div>
              <div className="edit-grid">
                <label className="field">
                  <span className="field-label">Full name</span>
                  <input
                    type="text"
                    value={displayName}
                    className={fieldErrors.name ? 'field-invalid' : undefined}
                    aria-invalid={!!fieldErrors.name}
                    onChange={(e) => {
                      setDisplayName(e.target.value);
                      setSaved(false);
                      // Clear as soon as it's plausible; re-checked on blur and
                      // on save, so nothing slips through — but the field stops
                      // shouting the moment the user starts fixing it.
                      if (fieldErrors.name) setFieldErrors((f) => ({ ...f, name: undefined }));
                    }}
                    onBlur={() => setFieldErrors((f) => ({ ...f, name: validateRequired(displayName, 'Name') ?? undefined }))}
                  />
                  {fieldErrors.name && <div className="field-error">{fieldErrors.name}</div>}
                </label>
                <label className="field">
                  <span className="field-label">Role</span>
                  <input type="text" value={title} placeholder={providerWord} onChange={(e) => (setTitle(e.target.value), setSaved(false))} />
                </label>
                {/* GRW-199 — the shared field. The validate-on-blur dance is
                    gone: an invalid character can no longer be typed, so only
                    the length can be wrong and that is checked on save. */}
                <PhoneField
                  id="staff-edit-phone"
                  label="Mobile"
                  required
                  value={phone}
                  error={fieldErrors.phone ?? null}
                  onChange={(v) => {
                    setPhone(v);
                    setSaved(false);
                    if (fieldErrors.phone) setFieldErrors((f) => ({ ...f, phone: undefined }));
                  }}
                />
              </div>
            </section>

            <section className="card edit-card">
              <div className="edit-card-head">
                <div className="edit-card-title">Working hours</div>
                <label className="switch">
                  <input type="checkbox" checked={usesOrgHours} disabled={busy} onChange={(e) => toggleOrgHours(e.target.checked)} />
                  <span className="switch-track">
                    <span className="switch-thumb" />
                  </span>
                  <span className={usesOrgHours ? 'switch-label-on' : 'switch-label-off'}>Same as the business</span>
                </label>
              </div>
              {usesOrgHours && (
                <div className="field-hint">
                  Following the business&apos;s default hours (Settings → Working hours). Turn this off to set custom hours.
                </div>
              )}
              <div className="edit-hours">
                <WeekdayHoursEditor rows={visibleDays} onChange={updateHourRow} disabled={usesOrgHours} />
              </div>
              {hiddenDayCount > 0 && (
                <button type="button" className="link-btn" onClick={() => setShowAllDays(true)}>
                  Show all 7 days ({hiddenDayCount} day{hiddenDayCount === 1 ? '' : 's'} off)
                </button>
              )}
            </section>

            <section className="card edit-card">
              <div className="edit-card-head">
                <div className="edit-card-title">Services this person can take</div>
                <span className="muted edit-count">
                  {selectedServiceIds.size} of {services.length} selected
                </span>
              </div>
              <div className="edit-chips">
                {services.map((s) => {
                  const on = selectedServiceIds.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`edit-chip ${on ? 'is-on' : ''}`}
                      aria-pressed={on}
                      onClick={() => toggleService(s.id)}
                    >
                      {s.name} {on && <IconCheck />}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="edit-side">
            <section className="card edit-card">
              <div className="edit-side-title">Last 30 days</div>
              {stats ? (
                <div className="edit-stats">
                  <div className="edit-stat">
                    <span>Bookings</span>
                    <strong>{stats.bookings}</strong>
                  </div>
                  <div className="edit-stat">
                    <span>Repeat clients</span>
                    <strong>{stats.repeatPct === null ? '—' : `${stats.repeatPct}%`}</strong>
                  </div>
                  <div className="edit-stat">
                    <span>{copy.status.didNotCome}</span>
                    <strong>{stats.noShows}</strong>
                  </div>
                  <div className="edit-stat">
                    <span>Hours booked</span>
                    <strong>
                      {hours(stats.bookedMinutes)} / {hours(stats.scheduledMinutes)}
                    </strong>
                  </div>
                </div>
              ) : (
                <div className="field-hint">Not available.</div>
              )}
            </section>

            <section className="card edit-card">
              <div className="edit-side-title">Upcoming today</div>
              {upcoming.length === 0 ? (
                <div className="field-hint">Nothing left on the books today.</div>
              ) : (
                <div className="edit-upcoming">
                  {upcoming.map((e, i) => (
                    <div className="edit-upcoming-row" key={i}>
                      <span className="edit-upcoming-time">
                        {DateTime.fromISO(e.startAt).setZone(day?.timezone).toFormat('h:mm a')}
                      </span>
                      <span className="edit-upcoming-label">{e.label}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="field-hint">Changing hours will not move existing bookings.</div>
            </section>

            <section className="card edit-card edit-danger">
              <div className="edit-side-title">Danger zone</div>
              <button type="button" className="btn btn-ghost edit-danger-btn" disabled={busy} onClick={() => setActiveAndSave(!active)}>
                {active ? 'Mark inactive' : 'Restore to team'}
              </button>
              <div className="field-hint">Inactive staff keep their history and stop appearing in booking slots.</div>
            </section>
          </aside>
        </div>
      </div>

      {confirmRemove && (
        <ConfirmDialog
          title={`Remove ${detail.displayName} from the team?`}
          body="They stop appearing in booking flows and on the roster."
          detail="Their booking history is kept, and you can restore them any time from the Inactive tab."
          confirmLabel="Remove"
          tone="danger"
          busy={busy}
          onConfirm={() => applyActive(false)}
          onCancel={() => setConfirmRemove(false)}
        />
      )}

      {/* Mobile only: Save can never scroll out of reach. */}
      <div className="edit-savebar">
        <button type="button" className="btn edit-savebar-btn" onClick={save} disabled={busy || !dirty}>
          {busy ? 'Saving…' : saved && !dirty ? 'Saved' : 'Save changes'}
        </button>
      </div>
    </>
  );
}
