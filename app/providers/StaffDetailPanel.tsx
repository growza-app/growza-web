'use client';

import { useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { api, type ProviderDay, type ProviderDetail, type Service } from '../lib/api';
import { IconCheck, IconClose, IconWhatsApp } from '../components/icons';
import { toWeekdayRows, WeekdayHoursEditor, type WeekdayRow } from '../components/WeekdayHoursEditor';

const SAVE_ERROR = 'Could not save — check the server is running.';

function toWaLink(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}`;
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

function rowsEqual(a: WeekdayRow[], b: WeekdayRow[]): boolean {
  return (
    a.length === b.length &&
    a.every((r, i) => r.weekday === b[i]!.weekday && r.open === b[i]!.open && (!r.open || (r.startTime === b[i]!.startTime && r.endTime === b[i]!.endTime)))
  );
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

function AboutFields({
  displayName,
  onDisplayNameChange,
  title,
  onTitleChange,
  phone,
  onPhoneChange,
  email,
  onEmailChange,
  languages,
  onLanguagesChange,
  bio,
  onBioChange,
  active,
  onActiveChange,
  creating,
  nameInvalid,
  phoneInvalid,
}: {
  displayName: string;
  onDisplayNameChange: (v: string) => void;
  title: string;
  onTitleChange: (v: string) => void;
  phone: string;
  onPhoneChange: (v: string) => void;
  email: string;
  onEmailChange: (v: string) => void;
  languages: string;
  onLanguagesChange: (v: string) => void;
  bio: string;
  onBioChange: (v: string) => void;
  active: boolean;
  onActiveChange: (v: boolean) => void;
  creating: boolean;
  nameInvalid: boolean;
  phoneInvalid: boolean;
}) {
  return (
    <div className="drawer-section">
      <div className="drawer-section-title">About</div>
      <div className="field">
        <label>
          <span>
            Name <span style={{ color: 'var(--amber)' }}>*</span>
          </span>
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => onDisplayNameChange(e.target.value)}
          className={nameInvalid ? 'field-invalid' : ''}
        />
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label>
          <span>Role</span>
        </label>
        <input type="text" value={title} onChange={(e) => onTitleChange(e.target.value)} placeholder="e.g. Senior Stylist" />
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label>
          <span>
            Phone <span style={{ color: 'var(--amber)' }}>*</span>
          </span>
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          placeholder="+91 98765 12345"
          className={phoneInvalid ? 'field-invalid' : ''}
        />
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label>
          <span>Email</span>
        </label>
        <input type="text" value={email} onChange={(e) => onEmailChange(e.target.value)} placeholder="name@example.com" />
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label>
          <span>Languages</span>
        </label>
        <input type="text" value={languages} onChange={(e) => onLanguagesChange(e.target.value)} placeholder="English, Hindi" />
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label>
          <span>About (optional)</span>
        </label>
        <textarea value={bio} onChange={(e) => onBioChange(e.target.value)} rows={2} style={{ width: '100%', resize: 'vertical' }} />
      </div>

      {!creating && (
        <label className="switch" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="checkbox" checked={active} onChange={() => onActiveChange(!active)} />
          <span className="switch-track">
            <span className="switch-thumb" />
          </span>
          <span className={active ? 'switch-label-on' : 'switch-label-off'}>{active ? 'Active' : 'Inactive'}</span>
        </label>
      )}
    </div>
  );
}

function SkillsPicker({ selected, onToggle, services }: { selected: Set<string>; onToggle: (id: string) => void; services: Service[] }) {
  return (
    <div className="drawer-section">
      <div className="drawer-section-title">Skills</div>
      {services.length === 0 ? (
        <div className="field-hint">No services set up yet.</div>
      ) : (
        <div className="skill-picker">
          {services.map((s) => {
            const on = selected.has(s.id);
            return (
              <button key={s.id} type="button" className={`skill-pill ${on ? 'active' : ''}`} onClick={() => onToggle(s.id)}>
                {on && <IconCheck />}
                {s.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WorkingHoursFields({
  providerId,
  rows,
  onRowsChange,
  usesOrgHours,
  onOrgHoursSynced,
}: {
  providerId: string;
  rows: WeekdayRow[];
  onRowsChange: (weekday: number, patch: Partial<WeekdayRow>) => void;
  usesOrgHours: boolean;
  /** The toggle needs an immediate round trip (it copies the org's current hours server-side) — everything else in the drawer defers to the single Save button, but this switches mode rather than editing a field. */
  onOrgHoursSynced: (detail: ProviderDetail) => void;
}) {
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const toggleOrgHours = async () => {
    setToggling(true);
    setToggleError(null);
    try {
      const updated = await api.updateProviderProfile(providerId, { usesOrgHours: !usesOrgHours });
      onOrgHoursSynced(updated);
    } catch {
      setToggleError(SAVE_ERROR);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="drawer-section">
      <div className="drawer-section-title-row">
        <div className="drawer-section-title">Working hours</div>
        <label className="switch" style={{ opacity: toggling ? 0.6 : 1 }}>
          <input type="checkbox" checked={usesOrgHours} disabled={toggling} onChange={toggleOrgHours} />
          <span className="switch-track">
            <span className="switch-thumb" />
          </span>
          <span className={usesOrgHours ? 'switch-label-on' : 'switch-label-off'}>Match organization hours</span>
        </label>
      </div>
      {usesOrgHours && (
        <div className="field-hint" style={{ marginTop: 0, marginBottom: 10 }}>
          Following your business&apos;s default hours (set in Settings → Working hours). Turn this off to set custom hours for this staff member.
        </div>
      )}
      {toggleError && <div className="field-error">{toggleError}</div>}
      <WeekdayHoursEditor rows={rows} onChange={onRowsChange} disabled={usesOrgHours} />
    </div>
  );
}

function TodayScheduleSection({ day, timezone }: { day: ProviderDay; timezone: string }) {
  if (day.entries.length === 0) {
    return (
      <div className="drawer-section">
        <div className="drawer-section-title">Today&apos;s schedule</div>
        <div className="field-hint">Nothing on the books today.</div>
      </div>
    );
  }
  return (
    <div className="drawer-section">
      <div className="drawer-section-title">Today&apos;s schedule</div>
      {day.entries.map((e, i) => (
        <div className="schedule-row" key={i}>
          <div className="schedule-time">{DateTime.fromISO(e.startAt).setZone(timezone).toFormat('h:mm a')}</div>
          <div className="schedule-label">{e.label}</div>
          {e.status && (
            <span className={`chip chip-${e.status}`} style={{ fontSize: 11, padding: '3px 9px' }}>
              {e.status}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function StaffDetailPanel({
  providerId,
  services,
  onClose,
  onSaved,
}: {
  providerId: string | null;
  services: Service[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [detail, setDetail] = useState<ProviderDetail | null>(null);
  const [day, setDay] = useState<ProviderDay | null>(null);
  const [loading, setLoading] = useState(!!providerId);
  const creating = !providerId && !detail;

  const [displayName, setDisplayName] = useState('');
  const [title, setTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [languages, setLanguages] = useState('');
  const [active, setActive] = useState(true);
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());
  const [hourRows, setHourRows] = useState<WeekdayRow[]>(() => toWeekdayRows([]));
  const [usesOrgHours, setUsesOrgHours] = useState(false);

  const [nameInvalid, setNameInvalid] = useState(false);
  const [phoneInvalid, setPhoneInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const resetEditableStateFrom = (d: ProviderDetail) => {
    setDisplayName(d.displayName);
    setTitle(d.title ?? '');
    setPhone(d.phone ?? '');
    setEmail(d.email ?? '');
    setBio(d.bio ?? '');
    setLanguages(d.languages ?? '');
    setActive(d.active);
    setSelectedServiceIds(new Set(d.serviceIds));
    setHourRows(toWeekdayRows(d.workingHours));
    setUsesOrgHours(d.usesOrgHours);
  };

  useEffect(() => {
    if (!providerId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([api.providerDetail(providerId), api.providerDay(providerId)])
      .then(([d, dayRes]) => {
        if (cancelled) return;
        setDetail(d);
        resetEditableStateFrom(d);
        setDay(dayRes);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);

  const aboutDirty = creating
    ? displayName !== '' || title !== '' || phone !== '' || email !== '' || bio !== '' || languages !== ''
    : !!detail &&
      (displayName !== detail.displayName ||
        title !== (detail.title ?? '') ||
        phone !== (detail.phone ?? '') ||
        email !== (detail.email ?? '') ||
        bio !== (detail.bio ?? '') ||
        languages !== (detail.languages ?? '') ||
        active !== detail.active);
  const skillsDirty = !!detail && !setsEqual(selectedServiceIds, new Set(detail.serviceIds));
  const hoursDirty = !!detail && !usesOrgHours && !rowsEqual(hourRows, toWeekdayRows(detail.workingHours));
  const dirty = aboutDirty || skillsDirty || hoursDirty;

  const updateHourRow = (weekday: number, patch: Partial<WeekdayRow>) => {
    setHourRows((prev) => prev.map((r) => (r.weekday === weekday ? { ...r, ...patch } : r)));
  };

  const handleOrgHoursSynced = (updated: ProviderDetail) => {
    // Only the working-hours half of state resets here — an in-progress edit
    // to About or Skills must survive toggling this switch, so the rest of
    // detail/local state is left exactly as the user has it.
    setDetail((prev) => (prev ? { ...prev, usesOrgHours: updated.usesOrgHours, workingHours: updated.workingHours } : updated));
    setUsesOrgHours(updated.usesOrgHours);
    setHourRows(toWeekdayRows(updated.workingHours));
    onSaved();
  };

  const save = async () => {
    const nameMissing = !displayName.trim();
    const phoneMissing = !phone.trim();
    setNameInvalid(nameMissing);
    setPhoneInvalid(phoneMissing);
    if (nameMissing || phoneMissing) {
      setError(nameMissing && phoneMissing ? 'Name and phone are required' : nameMissing ? 'Name is required' : 'Phone is required');
      return;
    }
    const openRows = hourRows.filter((r) => r.open);
    if (!usesOrgHours && openRows.some((r) => r.startTime >= r.endTime)) {
      setError('Start time must be before end time');
      return;
    }

    setBusy(true);
    setError(null);
    setSaved(false);
    const aboutPayload = { displayName, phone, title: title || null, email: email || null, bio: bio || null, languages: languages || null };
    try {
      if (creating) {
        const created = await api.createProvider(aboutPayload);
        setDetail(created);
        resetEditableStateFrom(created);
      } else if (detail) {
        const calls: Array<Promise<unknown>> = [];
        if (aboutDirty) calls.push(api.updateProviderProfile(detail.id, { ...aboutPayload, active }));
        if (skillsDirty) calls.push(api.updateProviderServices(detail.id, [...selectedServiceIds]));
        if (hoursDirty) {
          calls.push(
            api.updateProviderWorkingHours(
              detail.id,
              openRows.map((r) => ({ weekday: r.weekday, startTime: r.startTime, endTime: r.endTime })),
            ),
          );
        }
        await Promise.all(calls);
        const fresh = await api.providerDetail(detail.id);
        setDetail(fresh);
        resetEditableStateFrom(fresh);
      }
      setSaved(true);
      onSaved();
    } catch {
      setError(SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    onSaved();
    onClose();
  };

  return (
    <>
      <div className="drawer-scrim" onClick={handleClose} />
      <div className="drawer" role="dialog" aria-label="Staff member">
        <div className="drawer-head">
          <h2>{creating ? 'Add staff' : (detail?.displayName ?? 'Staff member')}</h2>
          <button type="button" className="staff-icon-btn" onClick={handleClose} aria-label="Close">
            <IconClose />
          </button>
        </div>

        <div className="drawer-body">
          {loading ? (
            <div className="field-hint">Loading…</div>
          ) : (
            <>
              {detail && (
                <div className="staff-profile-head">
                  <div className="staff-profile-avatar">{initials(detail.displayName)}</div>
                  <div>
                    <div className="staff-profile-name-row">
                      <span className="staff-profile-name">{detail.displayName}</span>
                      {detail.title && <span className="chip chip-confirmed">{detail.title}</span>}
                    </div>
                    {detail.phone && (
                      <div className="staff-profile-phone">
                        {detail.phone}
                        <a href={toWaLink(detail.phone)} target="_blank" rel="noreferrer" aria-label="Message on WhatsApp">
                          <IconWhatsApp />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <AboutFields
                displayName={displayName}
                onDisplayNameChange={(v) => {
                  setDisplayName(v);
                  if (nameInvalid) setNameInvalid(false);
                }}
                title={title}
                onTitleChange={setTitle}
                phone={phone}
                onPhoneChange={(v) => {
                  setPhone(v);
                  if (phoneInvalid) setPhoneInvalid(false);
                }}
                email={email}
                onEmailChange={setEmail}
                languages={languages}
                onLanguagesChange={setLanguages}
                bio={bio}
                onBioChange={setBio}
                active={active}
                onActiveChange={setActive}
                creating={creating}
                nameInvalid={nameInvalid}
                phoneInvalid={phoneInvalid}
              />

              {detail && (
                <>
                  <SkillsPicker
                    selected={selectedServiceIds}
                    services={services}
                    onToggle={(id) =>
                      setSelectedServiceIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      })
                    }
                  />
                  <WorkingHoursFields
                    providerId={detail.id}
                    rows={hourRows}
                    onRowsChange={updateHourRow}
                    usesOrgHours={usesOrgHours}
                    onOrgHoursSynced={handleOrgHoursSynced}
                  />
                  {day && <TodayScheduleSection day={day} timezone={day.timezone} />}
                </>
              )}
            </>
          )}
        </div>

        {!loading && (
          <div className="drawer-actions">
            {(error || saved) && (
              <div className="drawer-actions-banner">
                {error ? (
                  <div className="field-error" style={{ margin: 0 }}>
                    {error}
                  </div>
                ) : (
                  !busy && (
                    <div className="field-hint" style={{ margin: 0, color: 'var(--accent-deep)' }}>
                      Saved
                    </div>
                  )
                )}
              </div>
            )}
            <button type="button" className="btn" disabled={busy || !dirty} onClick={save}>
              {busy ? 'Saving…' : creating ? 'Create staff' : 'Save changes'}
            </button>
            {detail?.phone && (
              <a className="btn btn-ghost" href={toWaLink(detail.phone)} target="_blank" rel="noreferrer">
                <IconWhatsApp /> Message
              </a>
            )}
          </div>
        )}
      </div>
    </>
  );
}
