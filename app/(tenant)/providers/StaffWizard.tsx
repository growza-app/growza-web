'use client';

import { useMemo, useState } from 'react';
import { api, ApiError, type ProviderOverviewRow, type Service } from '../lib/api';
import { PhoneField } from '../components/PhoneField';
import { toStoredPhone, validateNationalPhone } from '../lib/phone';
import { IconCheck, IconClose, IconPlus } from '../components/icons';
import { WeekdayHoursEditor, type WeekdayRow } from '../components/WeekdayHoursEditor';

/**
 * Jira GRW-22 — adding somebody, in three steps, with the first one enough.
 *
 * ## What it replaces, and why a second component rather than a flag
 *
 * `StaffDetailPanel` gated its Skills and Working-hours sections behind
 * `detail &&` — behind having already been saved. So adding a stylist was one
 * step, and their hours and their skills were a second visit to a different
 * screen, if anybody remembered.
 *
 * That is not a missing feature so much as a record that starts wrong. Before
 * GRW-183 a new person had no hours; until this ticket they had no services, so
 * `listProvidersForService` — an INNER JOIN on `provider_service` — left them
 * out of every "who can do this?" in the product while the roster showed them
 * like everybody else.
 *
 * The engine half of this ticket makes both defaults sane, which is what lets
 * the design's load-bearing sentence be true: **Save & close is live from step
 * 1.** Name and number are enough, because skipping ahead now leaves a stylist
 * who works the salon's hours and can do the salon's services, not a decorative
 * one.
 *
 * `StaffDetailPanel` is deleted with this change, not kept as a fallback. Its
 * own comment already read *"the drawer now only serves Add staff — editing an
 * existing person goes to /providers/[id]"*, so replacing the create path left
 * 550 lines with no caller. Dead code that still looks live is how the next
 * person ends up fixing a bug in the screen nobody opens.
 *
 * ## Roles are the titles this salon already uses
 *
 * The ticket left a decision open: derive the role chips from existing distinct
 * `provider.title` values, or add a real role table. Derived, and no migration.
 *
 * A salon's roles are not a taxonomy somebody configures up front; they are
 * whatever the last few people were called. Deriving means the chips are right
 * on day one for an existing salon and empty for a new one, which is honest in
 * both cases — and "+ New role" is just a title, so nothing has to be created
 * before somebody can be hired into it. A table would add a screen to manage a
 * list that two people ever look at.
 *
 * ## No photo
 *
 * Board `5a` has an optional photo on step 1. There is no provider-photo
 * storage — `service.image_url` exists, providers render initials everywhere —
 * so a control here would be a field with nowhere to put its value. Left out
 * deliberately rather than stubbed; it belongs with GRW-40's file-storage work.
 */

type Step = 'who' | 'hours' | 'services';

const STEPS: { key: Step; label: string }[] = [
  { key: 'who', label: 'Who' },
  { key: 'hours', label: 'Hours' },
  { key: 'services', label: 'Services' },
];

const SAVE_ERROR = 'Could not save — check the server is running.';

export function StaffWizard({
  staffWord,
  services,
  roster,
  orgHours,
  onClose,
  onCreated,
}: {
  /** ctx.labels — "Stylists" for a salon, "Doctors" for a clinic. */
  staffWord: string;
  services: Service[];
  /** The current roster, only ever read for the roles it already uses. */
  roster: ProviderOverviewRow[];
  /** The salon's own week, so step 2 opens on what this person will actually work. */
  orgHours: WeekdayRow[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<Step>('who');

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [newRole, setNewRole] = useState('');
  const [addingRole, setAddingRole] = useState(false);

  /*
   * Step 2 opens on the salon's hours, and `followsSalon` says whether the
   * owner has touched them. Left true, the create sends no `workingHours` at
   * all — which is not the same as sending a copy of today's salon hours: the
   * flag is a standing intent, and a stylist carrying it picks up next month's
   * change to the salon's week without anybody revisiting them.
   */
  const [followsSalon, setFollowsSalon] = useState(true);
  const [hourRows, setHourRows] = useState<WeekdayRow[]>(orgHours);

  /*
   * Everything, to match what the API does in silence. Showing the box already
   * ticked is the only honest way to render a default that generous — an empty
   * picker beside "Save & close" would say the opposite of what happens.
   */
  const [skills, setSkills] = useState<Set<string>>(() => new Set(services.map((s) => s.id)));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameInvalid, setNameInvalid] = useState(false);
  const [phoneInvalid, setPhoneInvalid] = useState(false);

  /** The titles this salon already uses, in the order they first appear. */
  const roles = useMemo(() => {
    const seen = new Set<string>();
    for (const p of roster) {
      const t = p.title?.trim();
      if (t && !seen.has(t)) seen.add(t);
    }
    return [...seen];
  }, [roster]);

  const phoneProblem = validateNationalPhone(phone);
  const canSave = displayName.trim().length > 0 && phoneProblem === null;

  const updateHourRow = (weekday: number, patch: Partial<WeekdayRow>) => {
    setFollowsSalon(false);
    setHourRows((prev) => prev.map((r) => (r.weekday === weekday ? { ...r, ...patch } : r)));
  };

  const save = async () => {
    if (!displayName.trim()) {
      setNameInvalid(true);
      setStep('who');
      return;
    }
    if (phoneProblem) {
      setPhoneInvalid(true);
      setStep('who');
      return;
    }

    /*
     * Checked, not asserted with `!`.
     *
     * `validateNationalPhone` and `toStoredPhone` apply the same two rules —
     * ten digits, first one 6-9 — from two functions, and a `!` here would
     * turn any future disagreement between them into `phone: null` reaching
     * an endpoint that requires a string. This way it stays on the step that
     * owns the field.
     */
    const stored = toStoredPhone(phone);
    if (!stored) {
      setPhoneInvalid(true);
      setStep('who');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.createProvider({
        displayName: displayName.trim(),
        phone: stored,
        title: title.trim() || null,
        /*
         * Omitted, not copied, when the owner has not touched the week — see
         * `followsSalon` above. And `serviceIds` is only sent when it is not
         * simply everything, so the common case travels as silence and lands on
         * the server's own default.
         */
        ...(followsSalon
          ? {}
          : { workingHours: hourRows.filter((r) => r.open).map((r) => ({ weekday: r.weekday, startTime: r.startTime, endTime: r.endTime })) }),
        ...(skills.size === services.length ? {} : { serviceIds: [...skills] }),
      });
      onCreated();
      onClose();
    } catch (err) {
      // A plan seat cap is not something retrying fixes, and "check the server
      // is running" sends the owner to look in the wrong place. The API says
      // which plan and how many people; pass it straight through.
      setError(err instanceof ApiError && err.status === 403 ? err.message : SAVE_ERROR);
      setBusy(false);
    }
  };

  const index = STEPS.findIndex((s) => s.key === step);
  const openDays = hourRows.filter((r) => r.open).length;
  /** The salon itself has no week — following it is an intent, not hours. */
  const salonHasNoHours = orgHours.every((r) => !r.open);

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="wiz" role="dialog" aria-label={`Add ${staffWord.toLowerCase()}`}>
        <div className="wiz-head">
          <div>
            <h2>Add {staffWord.toLowerCase()}</h2>
            {/*
              The reassurance the design puts here, in words rather than as a
              disabled button somebody has to discover is enabled. Two steps of
              a three-step form being optional is not guessable.
            */}
            <p className="wiz-sub">Name and number are enough — the rest has sensible defaults.</p>
          </div>
          <button type="button" className="wiz-close" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>

        {/* Segments rather than dots: a dot says "three of something", a
            labelled segment says which one you are on and what the others are. */}
        <ol className="wiz-steps">
          {STEPS.map((s, i) => (
            <li key={s.key} className={`wiz-step ${i === index ? 'is-on' : ''} ${i < index ? 'is-done' : ''}`}>
              <button type="button" onClick={() => setStep(s.key)} aria-current={i === index ? 'step' : undefined}>
                <span className="wiz-step-num">{i < index ? <IconCheck /> : i + 1}</span>
                <span className="wiz-step-label">{s.label}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="wiz-body">
          {step === 'who' && (
            <>
              <div className="field">
                <label htmlFor="wiz-name">Full name</label>
                <input
                  id="wiz-name"
                  type="text"
                  autoFocus
                  value={displayName}
                  placeholder="Priya Sharma"
                  aria-invalid={nameInvalid ? true : undefined}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    if (nameInvalid) setNameInvalid(false);
                  }}
                />
                {nameInvalid && <div className="field-error">A name is required.</div>}
              </div>

              <PhoneField
                id="wiz-phone"
                label="Mobile"
                required
                value={phone}
                error={phoneInvalid ? phoneProblem : null}
                onChange={(v) => {
                  setPhone(v);
                  if (phoneInvalid) setPhoneInvalid(false);
                }}
              />

              <div className="wiz-section-label">Role</div>
              <div className="wiz-chips">
                {roles.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`wiz-chip ${title === r ? 'is-on' : ''}`}
                    onClick={() => setTitle(title === r ? '' : r)}
                  >
                    {r}
                  </button>
                ))}
                {addingRole ? (
                  <input
                    type="text"
                    className="wiz-new-role"
                    autoFocus
                    value={newRole}
                    placeholder="Colourist"
                    onChange={(e) => setNewRole(e.target.value)}
                    onBlur={() => {
                      const t = newRole.trim();
                      if (t) setTitle(t);
                      setNewRole('');
                      setAddingRole(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') {
                        setNewRole('');
                        setAddingRole(false);
                      }
                    }}
                  />
                ) : (
                  <button type="button" className="wiz-chip wiz-chip-new" onClick={() => setAddingRole(true)}>
                    <IconPlus /> New role
                  </button>
                )}
                {/* A role typed here exists only as this person's title, so it
                    would otherwise vanish from the chip row it was just added
                    to. Shown selected until it is one of `roles` on the next
                    load. */}
                {title && !roles.includes(title) && (
                  <button type="button" className="wiz-chip is-on" onClick={() => setTitle('')}>
                    {title}
                  </button>
                )}
              </div>
            </>
          )}

          {step === 'hours' && (
            <>
              <label className="wiz-toggle">
                <input
                  type="checkbox"
                  checked={followsSalon}
                  onChange={(e) => {
                    setFollowsSalon(e.target.checked);
                    if (e.target.checked) setHourRows(orgHours);
                  }}
                />
                <span>
                  <strong>Same hours as the salon</strong>
                  <span className="wiz-toggle-sub">
                    {/* Why this is a standing intent and not a copy, in one
                        sentence an owner can act on. */}
                    They follow the salon automatically, including when you change it later.
                  </span>
                </span>
              </label>

              <div className={followsSalon ? 'wiz-hours is-locked' : 'wiz-hours'}>
                <WeekdayHoursEditor rows={hourRows} onChange={updateHourRow} disabled={followsSalon} />
              </div>

              {/*
                Two ways to end up with nobody bookable, and they need different
                sentences because they have different fixes.

                The second one is not hypothetical: the dev salon has no
                `settings.working_hours` at all, so ticking "Same hours as the
                salon" — the default — produced a stylist the roster
                immediately marked "Not bookable", with the wizard having said
                nothing. Following a salon that has not set its hours is a
                perfectly good ANSWER (GRW-183 makes it a standing intent, and
                they get picked up the day the salon does set them); it is just
                not a good SILENCE.
              */}
              {!followsSalon && openDays === 0 && (
                <div className="field-hint wiz-warn">
                  Nobody can book {displayName.trim() || 'them'} with no working days. Turn a day on, or switch the salon
                  hours back on above.
                </div>
              )}

              {followsSalon && salonHasNoHours && (
                <div className="field-hint wiz-warn">
                  This business has no opening hours set yet, so nobody can book{' '}
                  {displayName.trim() || 'them'} until it does. Saving is fine — they will pick the hours up
                  automatically. Set them in <strong>Settings → Working hours</strong>, or turn the switch off above and
                  give {displayName.trim() || 'them'} their own days.
                </div>
              )}
            </>
          )}

          {step === 'services' && (
            <>
              <div className="wiz-section-label">
                What they can do
                <button
                  type="button"
                  className="wiz-link"
                  onClick={() =>
                    setSkills(skills.size === services.length ? new Set() : new Set(services.map((s) => s.id)))
                  }
                >
                  {skills.size === services.length ? 'Clear all' : 'Select all'}
                </button>
              </div>
              {services.length === 0 ? (
                <div className="field-hint">No services set up yet — add some first and they will pick them all up.</div>
              ) : (
                <div className="skill-picker">
                  {services.map((s) => {
                    const on = skills.has(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className={`skill-pill ${on ? 'active' : ''}`}
                        onClick={() =>
                          setSkills((prev) => {
                            const next = new Set(prev);
                            if (next.has(s.id)) next.delete(s.id);
                            else next.add(s.id);
                            return next;
                          })
                        }
                      >
                        {on && <IconCheck />}
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              )}
              {skills.size === 0 && (
                <div className="field-hint wiz-warn">
                  With nothing ticked they will not appear in any booking flow. That is allowed — you can set it later.
                </div>
              )}
            </>
          )}
        </div>

        <div className="wiz-actions">
          {error && <div className="field-error wiz-error">{error}</div>}
          <div className="wiz-actions-row">
            {index > 0 && (
              <button type="button" className="btn btn-ghost" onClick={() => setStep(STEPS[index - 1]!.key)}>
                Back
              </button>
            )}
            <span className="wiz-spacer" />
            {index < STEPS.length - 1 && (
              <button type="button" className="btn btn-ghost" onClick={() => setStep(STEPS[index + 1]!.key)}>
                Next
              </button>
            )}
            {/*
              Live from step 1, on every step, and never hidden behind Next.
              The whole point of the defaults is that stopping here is a
              complete answer.
            */}
            <button type="button" className="btn" disabled={busy || !canSave} onClick={save}>
              {busy ? 'Saving…' : 'Save & close'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
