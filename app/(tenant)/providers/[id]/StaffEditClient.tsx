'use client';

import { useLocale, useTranslations } from 'next-intl';
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
import { pickNoun } from '../../lib/nouns';
import { fromStoredPhone, toStoredPhone } from '../../lib/phone';
import { usePhoneProblem } from '../../lib/use-phone-problem';
import { avatarTone, initials } from '../StaffRoster';
import { useLabel } from '../../components/LabelsProvider';

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
  branches = [],
}: {
  detail: ProviderDetail;
  services: Service[];
  day: ProviderDay | null;
  stats: ProviderStats | null;
  staffWord: string;
  /** The business's default week — previewed in the editor when "Same as the business" is on, so that switch can defer to Save like every other field. */
  orgWorkingHours: ProviderWorkingHourRow[];
  /** Jira GRW-234 — a multi-branch business's branches, main first. Empty: no field. */
  branches?: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations('staffEdit');
  const ts = useTranslations('staff');
  const tStatus = useTranslations('status');
  const tCommon = useTranslations('common');
  const tw = useTranslations('staffWizard');
  const tn = useTranslations('nouns');
  const locale = useLocale();
  const checkPhone = usePhoneProblem();
  // The vertical's word in English; the generic one in other languages until vertical labels are translated (GRW-315 Story 5).
  const providerWord = pickNoun(locale, useLabel('provider', t('staffMember')), t('staffMember'));
  const staffTitle = pickNoun(locale, staffWord, tn('staffTitle'));
  const router = useRouter();
  const [detail, setDetail] = useState(initialDetail);

  const [displayName, setDisplayName] = useState(detail.displayName);
  const [title, setTitle] = useState(detail.title ?? '');
  // GRW-199 — the field holds ten NATIONAL digits; the stored value is E.164. Loading the stored value as it
  // is put "+91…" beside the "+91" prefix, and no save got past "A mobile number is 10 digits" (GRW-395 QA).
  const [phone, setPhone] = useState(() => fromStoredPhone(detail.phone));
  const [locationId, setLocationId] = useState(detail.locationId ?? '');
  const [active, setActive] = useState(detail.active);
  const [unavailableToday, setUnavailableToday] = useState(detail.unavailableToday);
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set(detail.serviceIds));
  const [hourRows, setHourRows] = useState<WeekdayRow[]>(() => toWeekdayRows(detail.workingHours));
  const [usesOrgHours, setUsesOrgHours] = useState(detail.usesOrgHours);
  /*
   * Jira GRW-216 — whether THIS person is shown the takings from their own
   * chair. Per stylist because one salon runs revenue-share and salaried staff
   * side by side, often at once: a senior on a percentage beside a junior on a
   * wage. A setting keyed on the role would have to be right for both.
   */
  const [seesOwnRevenue, setSeesOwnRevenue] = useState(detail.seesOwnRevenue);
  /*
   * Jira GRW-386 — a move to another branch: their services there are matched by name (Haircut → that branch's
   * Haircut) or start empty, and after the save the ones with no match are listed, to be set by hand.
   */
  const [skillsOnMove, setSkillsOnMove] = useState<'match' | 'none'>('match');
  const [unmatchedSkills, setUnmatchedSkills] = useState<{ branch: string; names: string[] } | null>(null);

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
    setLocationId(d.locationId ?? '');
    setActive(d.active);
    setUnavailableToday(d.unavailableToday);
    setSelectedServiceIds(new Set(d.serviceIds));
    setHourRows(toWeekdayRows(d.workingHours));
    setUsesOrgHours(d.usesOrgHours);
    setSeesOwnRevenue(d.seesOwnRevenue);
  };

  const aboutDirty =
    displayName !== detail.displayName ||
    title !== (detail.title ?? '') ||
    phone !== fromStoredPhone(detail.phone) ||
    locationId !== (detail.locationId ?? '') ||
    active !== detail.active;
  const skillsDirty = !setsEqual(selectedServiceIds, new Set(detail.serviceIds));
  const moving = branches.length > 1 && Boolean(locationId) && locationId !== detail.locationId;
  const movingTo = branches.find((b) => b.id === locationId)?.name ?? '';
  /*
   * Jira GRW-393 (FR-06) · GRW-388 — their saved branch's menu, and only it: every skill is a service of the
   * stylist's own branch (the release's migration 0087 moved the older ones there, and a move carries them). The
   * SAVED branch, not the field: while a move is pending the chips are locked, and the new branch's menu is
   * offered once the move is saved.
   */
  const menu = services.filter((s) => !detail.locationId || s.locationId === detail.locationId);
  const orgHoursDirty = usesOrgHours !== detail.usesOrgHours;
  const revenueDirty = seesOwnRevenue !== detail.seesOwnRevenue;
  const availabilityDirty = unavailableToday !== detail.unavailableToday;
  // While "Same as the business" is on the rows are a read-only preview of the org
  // week, so there is nothing of the user's own in them to be dirty about.
  const hoursDirty = !usesOrgHours && !rowsEqual(hourRows, toWeekdayRows(detail.workingHours));
  const dirty = aboutDirty || skillsDirty || hoursDirty || orgHoursDirty || revenueDirty || availabilityDirty;

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
      name: displayName.trim() ? undefined : t('errors.nameRequired'),
      phone: checkPhone(phone) ?? undefined,
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
      return setError(t('errors.startBeforeEnd'));
    }

    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const calls: Array<Promise<unknown>> = [];
      let profile: Promise<{ unmatchedSkills?: string[] }> | null = null;
      // Jira GRW-216 — `revenueDirty` belongs here too. Without it, flipping
      // only the earnings switch marked the form dirty, enabled Save, sent
      // nothing, and silently reverted on reload.
      if (aboutDirty || orgHoursDirty || revenueDirty) {
        calls.push(
          (profile = api.updateProviderProfile(detail.id, {
            displayName: displayName.trim(),
            // Stored E.164, so the separators a human typed are stripped once
            // here rather than leaving "+91 98765 43210" in the column.
            phone: toStoredPhone(phone) ?? '',
            title: title.trim() || null,
                  active,
            usesOrgHours,
            seesOwnRevenue,
            ...(moving ? { locationId, skillsOnMove } : {}),
          })),
        );
      }
      /*
       * Jira GRW-386 — never alongside a move. The two used to race: the move could land first and the skills,
       * picked from the old branch's menu, were then refused, leaving a half-saved card. A move sets their
       * services itself (matched or none); they are changed after it, from the new branch's menu.
       */
      if (skillsDirty && !moving) calls.push(api.updateProviderServices(detail.id, [...selectedServiceIds]));
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
      const moved = moving ? await profile : null;
      setUnmatchedSkills(moved?.unmatchedSkills?.length ? { branch: movingTo, names: moved.unmatchedSkills } : null);
      setSkillsOnMove('match');
      resetFrom(await api.providerDetail(detail.id));
      setSaved(true);
      router.refresh();
    } catch {
      setError(t('errors.saveFailed'));
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
      setError(e instanceof ApiError && e.status === 403 ? e.message : t('errors.saveFailed'));
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
          <Link href="/providers" className="staff-icon-btn" aria-label={t('backTo', { label: staffTitle })}>
            <IconArrowLeft />
          </Link>
          <div className={`staff-avatar ${avatarTone(detail.displayName)} edit-header-avatar`}>{initials(detail.displayName)}</div>
          <div>
            <div className="edit-crumb">
              <Link href="/providers">{staffTitle}</Link> · {t('crumbEdit')}
            </div>
            <h1 className="edit-title">{detail.displayName}</h1>
          </div>
        </div>
        <div className="edit-header-actions">
          <div className="edit-header-toggle">
            <span className="staff-toggle-label">
              {unavailableToday ? ts('row.offToday') : ts('row.available')}
            </span>
            <label className="switch switch-lg" title={t('availableTodayTitle')}>
              <input
                type="checkbox"
                checked={!unavailableToday}
                disabled={busy}
                aria-label={ts('row.availableToday', { name: detail.displayName })}
                onChange={(e) => setAvailableToday(e.target.checked)}
              />
              <span className="switch-track">
                <span className="switch-thumb" />
              </span>
            </label>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => router.push('/providers')} disabled={busy}>
            {t('cancel')}
          </button>
          <button type="button" className="btn" onClick={save} disabled={busy || !dirty}>
            {busy ? t('saving') : saved && !dirty ? t('saved') : t('saveChanges')}
          </button>
        </div>
      </div>

      <div className="page-body">
        {error && <div role="alert" className="field-error edit-banner">{error}</div>}

        <div className="edit-layout">
          <div className="edit-main">
            <section className="card edit-card">
              <div className="edit-card-title">{t('details')}</div>
              <div className="edit-grid">
                <label className="field">
                  <span className="field-label">{t('fullName')}</span>
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
                    onBlur={() => setFieldErrors((f) => ({ ...f, name: displayName.trim() ? undefined : t('errors.nameRequired') }))}
                  />
                  {fieldErrors.name && <div role="alert" className="field-error">{fieldErrors.name}</div>}
                </label>
                {branches.length > 1 ? (
                  <label className="field">
                    <span className="field-label">{t('branch')}</span>
                    <select value={locationId} onChange={(e) => (setLocationId(e.target.value), setSaved(false))}>
                      {branches.map((b, i) => (
                        <option key={b.id} value={b.id}>
                          {i === 0 ? tw('mainSuffix', { name: b.name }) : b.name}
                        </option>
                      ))}
                    </select>
                    {usesOrgHours && locationId !== detail.locationId ? (
                      <span className="field-hint">{t('branchHoursHint')}</span>
                    ) : null}
                  </label>
                ) : null}
                {moving ? (
                  <div className="field edit-move-skills" role="radiogroup" aria-label={t('moveSkillsTitle', { branch: movingTo })}>
                    <span className="field-label">{t('moveSkillsTitle', { branch: movingTo })}</span>
                    <label className="rules-option">
                      <input type="radio" name="skills-on-move" checked={skillsOnMove === 'match'} onChange={() => setSkillsOnMove('match')} />
                      <div className="rules-option-body">
                        <div className="rules-option-title">{t('moveSkillsMatch')}</div>
                        <div className="rules-option-sub">{t('moveSkillsMatchSub', { branch: movingTo })}</div>
                      </div>
                    </label>
                    <label className="rules-option">
                      <input type="radio" name="skills-on-move" checked={skillsOnMove === 'none'} onChange={() => setSkillsOnMove('none')} />
                      <div className="rules-option-body">
                        <div className="rules-option-title">{t('moveSkillsNone')}</div>
                        <div className="rules-option-sub">{t('moveSkillsNoneSub')}</div>
                      </div>
                    </label>
                  </div>
                ) : null}
                <label className="field">
                  <span className="field-label">{t('role')}</span>
                  <input type="text" value={title} placeholder={providerWord} onChange={(e) => (setTitle(e.target.value), setSaved(false))} />
                </label>
                {/* GRW-199 — the shared field. The validate-on-blur dance is
                    gone: an invalid character can no longer be typed, so only
                    the length can be wrong and that is checked on save. */}
                <PhoneField
                  id="staff-edit-phone"
                  label={t('mobile')}
                  optionalLabel={tCommon('optional')}
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
                <div className="edit-card-title">{t('earnings')}</div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={seesOwnRevenue}
                    disabled={busy}
                    onChange={(e) => { setSeesOwnRevenue(e.target.checked); setSaved(false); }}
                  />
                  <span className="switch-track">
                    <span className="switch-thumb" />
                  </span>
                  <span className={seesOwnRevenue ? 'switch-label-on' : 'switch-label-off'}>
                    {t('seesOwnRevenue')}
                  </span>
                </label>
              </div>
              <div className="field-hint">
                {seesOwnRevenue ? t('revenueOnHint') : t('revenueOffHint')}
              </div>
            </section>

            <section className="card edit-card">
              <div className="edit-card-head">
                <div className="edit-card-title">{t('workingHours')}</div>
                <label className="switch">
                  <input type="checkbox" checked={usesOrgHours} disabled={busy} onChange={(e) => toggleOrgHours(e.target.checked)} />
                  <span className="switch-track">
                    <span className="switch-thumb" />
                  </span>
                  <span className={usesOrgHours ? 'switch-label-on' : 'switch-label-off'}>{t('sameAsBusiness')}</span>
                </label>
              </div>
              {usesOrgHours && (
                <div className="field-hint">
                  {t('followingHint')}
                </div>
              )}
              <div className="edit-hours">
                <WeekdayHoursEditor rows={visibleDays} onChange={updateHourRow} disabled={usesOrgHours} />
              </div>
              {hiddenDayCount > 0 && (
                <button type="button" className="link-btn" onClick={() => setShowAllDays(true)}>
                  {t('showAllDays', { count: hiddenDayCount })}
                </button>
              )}
            </section>

            <section className="card edit-card">
              <div className="edit-card-head">
                <div className="edit-card-title">{t('servicesTitle')}</div>
                <span className="muted edit-count">
                  {t('selectedOf', { selected: selectedServiceIds.size, total: menu.length })}
                </span>
              </div>
              {moving ? <div className="field-hint">{t('moveSkillsLater', { branch: movingTo })}</div> : null}
              {unmatchedSkills ? (
                <div className="field-hint" role="status">
                  {t('moveUnmatched', { branch: unmatchedSkills.branch, names: unmatchedSkills.names.join(', ') })}
                </div>
              ) : null}
              <div className="edit-chips">
                {menu.map((s) => {
                  const on = selectedServiceIds.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`edit-chip ${on ? 'is-on' : ''}`}
                      aria-pressed={on}
                      disabled={moving}
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
              <div className="edit-side-title">{t('last30')}</div>
              {stats ? (
                <div className="edit-stats">
                  <div className="edit-stat">
                    <span>{t('bookings')}</span>
                    <strong>{stats.bookings}</strong>
                  </div>
                  <div className="edit-stat">
                    <span>{t('repeatClients')}</span>
                    <strong>{stats.repeatPct === null ? '—' : `${stats.repeatPct}%`}</strong>
                  </div>
                  <div className="edit-stat">
                    <span>{tStatus('didNotCome')}</span>
                    <strong>{stats.noShows}</strong>
                  </div>
                  <div className="edit-stat">
                    <span>{t('hoursBooked')}</span>
                    <strong>
                      {hours(stats.bookedMinutes)} / {hours(stats.scheduledMinutes)}
                    </strong>
                  </div>
                </div>
              ) : (
                <div className="field-hint">{t('notAvailable')}</div>
              )}
            </section>

            <section className="card edit-card">
              <div className="edit-side-title">{t('upcoming')}</div>
              {upcoming.length === 0 ? (
                <div className="field-hint">{t('nothingLeft')}</div>
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
              <div className="field-hint">{t('hoursNote')}</div>
            </section>

            <section className="card edit-card edit-danger">
              <div className="edit-side-title">{t('danger')}</div>
              <button type="button" className="btn btn-ghost edit-danger-btn" disabled={busy} onClick={() => setActiveAndSave(!active)}>
                {active ? t('markInactive') : ts('row.restoreToTeam')}
              </button>
              <div className="field-hint">{t('dangerHint')}</div>
            </section>
          </aside>
        </div>
      </div>

      {confirmRemove && (
        <ConfirmDialog
          title={ts('remove.title', { name: detail.displayName })}
          body={ts('remove.body')}
          detail={ts('remove.detail')}
          confirmLabel={ts('remove.confirm')}
          tone="danger"
          busy={busy}
          onConfirm={() => applyActive(false)}
          onCancel={() => setConfirmRemove(false)}
        />
      )}

      {/* Mobile only: Save can never scroll out of reach. */}
      <div className="edit-savebar">
        <button type="button" className="btn edit-savebar-btn" onClick={save} disabled={busy || !dirty}>
          {busy ? t('saving') : saved && !dirty ? t('saved') : t('saveChanges')}
        </button>
      </div>
    </>
  );
}
