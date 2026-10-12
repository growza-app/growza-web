'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useLabels } from '../components/LabelsProvider';
import { useBranch } from '../components/BranchProvider';
import { useEffect, useMemo, useState, useRef } from 'react';
import { api, ApiError, reasonOr, type CreatedInvite, type ProviderOverviewRow, type Service } from '../lib/api';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import { PhoneField } from '../components/PhoneField';
import { toStoredPhone } from '../lib/phone';
import { usePhoneProblem } from '../lib/use-phone-problem';
import { pickNoun } from '../lib/nouns';
import { IconCheck, IconClose, IconPlus, IconWhatsApp } from '../components/icons';
import { waDigits } from '../components/BookingSheet';
import { WeekdayHoursEditor, toWeekdayRows, type WeekdayRow } from '../components/WeekdayHoursEditor';
import { useDialog } from '../../shared/a11y/useDialog';
import { autoFocusField } from '../../shared/a11y/soft-keyboard';

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
 * The engine half of this ticket makes both defaults sane: a person saved with nothing but a name and a number
 * works the salon's hours and can be booked for anything. That used to mean **Save & close was live from step 1**;
 * since 2026-10-12 the owner wants the form walked instead, so the footer offers Next until the last step. The
 * defaults have not changed — what changed is that nobody passes the login question without seeing it.
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

type Step = 'who' | 'hours' | 'login';

/**
 * What this person does, which decides what the rest of the form asks.
 *
 * Adding somebody and giving them a password used to be two screens, so an owner hired a stylist on Staff and then
 * went looking for Settings to let them sign in — the second half nobody found. One flow, and the login is a step
 * in it: optional for a stylist (most never sign in), and the whole point for the front desk, who have no diary.
 */
type Kind = 'staff' | 'reception';

const STEPS_BY_KIND: Record<Kind, { key: Step }[]> = {
  /*
   * No services step (owner, 2026-10-12).
   *
   * It asked which of the branch's services this person can do, arrived with every one of them ticked, and
   * decided nothing: anyone may be booked for anything now. Two hundred pills to scroll past is not a decision.
   */
  staff: [{ key: 'who' }, { key: 'hours' }, { key: 'login' }],
  // No hours and no skills: a receptionist is never booked, so a week and a service list would be two screens of
  // questions with nothing behind them.
  reception: [{ key: 'who' }, { key: 'login' }],
};

export function StaffWizard({
  staffWord,
  services,
  roster,
  orgHours,
  hoursByBranch = {},
  branches = [],
  fullBranches = [],
  startAs = 'staff',
  seatsLeft,
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
  /** Jira GRW-474 — each branch's own week (raw rows); the chosen branch's is what "same as the salon" copies. */
  hoursByBranch?: Record<string, Array<{ weekday: number; startTime: string; endTime: string }>>;
  /** Jira GRW-234 — a multi-branch business's branches, main first. Empty: no choice to make. */
  branches?: Array<{ id: string; name: string }>;
  /** Jira GRW-557 — branches with no place left: offered, but not choosable, and never the one it starts on. */
  fullBranches?: string[];
  /** Which kind the flow opens on. */
  startAs?: Kind;
  /**
   * Places left on the plan. A receptionist takes none, so at zero the Stylist chip is the only thing refused —
   * the owner can still give the front desk a login, which is why the button that opens this is never disabled.
   */
  seatsLeft?: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations('staffWizard');
  const tCommon = useTranslations('common');
  const tn = useTranslations('nouns');
  // The invite words, kept in the namespace they were written in rather than copied.
  const tTeam = useTranslations('settingsTeam');
  const checkPhone = usePhoneProblem();
  const locale = useLocale();
  const staffLower = pickNoun(locale, staffWord.toLowerCase(), tn('staff'));
  /*
   * The chip says what this business calls one of these people — "Stylist" at a salon, "Doctor" at a clinic,
   * "Mechanic" at a garage. `ctx.labels.provider` is the singular the vertical defines (the screen's own title uses
   * the plural); in another language the vertical labels are not translated yet, so the generic noun stands in,
   * exactly as every other vertical noun on this screen does.
   */
  const labels = useLabels();
  const providerLabel = pickNoun(locale, labels.provider ?? staffWord, tn('staffTitle'));
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, { onClose });
  const [step, setStep] = useState<Step>('who');
  const [kind, setKind] = useState<Kind>(seatsLeft === 0 ? 'reception' : startAs);
  const STEPS = STEPS_BY_KIND[kind];
  /*
   * On by default, for everyone (owner, 2026-10-12).
   *
   * It used to be off for a stylist, on the reasoning that most of them never sign in. What that produced is the
   * thing the owner reported: you walk the three steps, press the last button, the sheet closes — and no link was
   * ever made, because the question on the final screen had already answered itself No. The link is the one thing
   * this flow produces that cannot be got again later, so the default has to be the one that produces it; the
   * tick box is still there to turn it off for the stylist who will never sign in. The front desk's cannot be
   * turned off at all: without a login there is no person to create, only a name nothing would hold.
   */
  const [wantsLogin, setWantsLogin] = useState(true);
  /** The invite that was just created, shown once: no route returns its link again. */
  const [created, setCreated] = useState<(CreatedInvite & { phone: string }) | null>(null);
  /** The person was added but their login was not — said plainly rather than swallowed. */
  const [loginFailed, setLoginFailed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [newRole, setNewRole] = useState('');
  const [addingRole, setAddingRole] = useState(false);
  // Jira GRW-377 — a new stylist starts at the branch the dashboard is looking at, not always the main one.
  const branchContext = useBranch();
  const roomAt = branches.filter((b) => !fullBranches.includes(b.id));
  const [branchId, setBranchId] = useState<string | null>(
    branches.find((b) => b.id === branchContext.one)?.id ?? roomAt[0]?.id ?? branches[0]?.id ?? null,
  );
  // QA (Jira GRW-377) — the same guard as the walk-in sheet: if this ever renders before the shared branch is
  // `ready`, take it when it arrives, unless the owner already chose one here.
  const branchTouched = useRef(false);
  useEffect(() => {
    if (!branchContext.ready || branchTouched.current) return;
    const shared = branches.find((b) => b.id === branchContext.one);
    if (shared) setBranchId(shared.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchContext.ready, branchContext.one]);

  /*
   * Step 2 opens on the salon's hours, and `followsSalon` says whether the
   * owner has touched them. Left true, the create sends no `workingHours` at
   * all — which is not the same as sending a copy of today's salon hours: the
   * flag is a standing intent, and a stylist carrying it picks up next month's
   * change to the salon's week without anybody revisiting them.
   */
  const [followsSalon, setFollowsSalon] = useState(true);
  // Jira GRW-474 — the hours of the branch they will work at, which is what the server copies.
  const branchHours = useMemo(
    () => (branchId && hoursByBranch[branchId] ? toWeekdayRows(hoursByBranch[branchId]!) : orgHours),
    [branchId, hoursByBranch, orgHours],
  );
  const [hourRows, setHourRows] = useState<WeekdayRow[]>(branchHours);
  useEffect(() => {
    if (followsSalon) setHourRows(branchHours);
  }, [branchHours, followsSalon]);

  /*
   * Everything, to match what the API does in silence. Showing the box already
   * ticked is the only honest way to render a default that generous — an empty
   * picker beside "Save & close" would say the opposite of what happens.
   */
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameInvalid, setNameInvalid] = useState(false);
  const [phoneInvalid, setPhoneInvalid] = useState(false);

  /** The titles this salon already uses, in the order they first appear. */
  const roles = useMemo(() => {
    const seen = new Set<string>();
    for (const p of roster) {
      const role = p.title?.trim();
      if (role && !seen.has(role)) seen.add(role);
    }
    return [...seen];
  }, [roster]);

  const linkFor = (token: string) => `${typeof window === 'undefined' ? '' : window.location.origin}/join/${token}`;

  const phoneProblem = checkPhone(phone);
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
      /*
       * The front desk has no provider row to make: a receptionist is a LOGIN and nothing else, which is why the
       * login cannot be turned off for them. Everything below this branch is the stylist's half.
       */
      if (kind === 'reception') {
        const invite = await api.createTeamInvite({
          phone: stored,
          role: 'receptionist',
          locationId: branches.length > 1 && branchId ? branchId : null,
          name: displayName.trim(),
        });
        setCreated({ ...invite, phone: stored });
        setBusy(false);
        setStep('login');
        onCreated();
        return;
      }
      const person = await api.createProvider({
        displayName: displayName.trim(),
        phone: stored,
        title: title.trim() || null,
        ...(branches.length > 1 && branchId ? { locationId: branchId } : {}),
        /*
         * Omitted, not copied, when the owner has not touched the week — see
         * `followsSalon` above. Nothing about services is sent at all: the server gives a new person their
         * branch's whole menu, which since 2026-10-12 is simply what everyone can be booked for.
         */
        ...(followsSalon
          ? {}
          : { workingHours: hourRows.filter((r) => r.open).map((r) => ({ weekday: r.weekday, startTime: r.startTime, endTime: r.endTime })) }),
      });
      onCreated();
      if (!wantsLogin) return onClose();
      /*
       * The person exists either way. A login that fails is said on this screen rather than thrown, because the
       * create it followed is NOT undone — telling the owner "it failed" about a stylist who is now on the roster
       * is how you get the same person added twice.
       */
      try {
        const invite = await api.createTeamInvite({ phone: stored, role: 'staff', providerId: person.id, name: displayName.trim() });
        setCreated({ ...invite, phone: stored });
      } catch (err) {
        setLoginFailed(err instanceof ApiError ? err.message : t('loginFailed'));
      }
      setBusy(false);
      setStep('login');
    } catch (err) {
      // A plan seat cap is not something retrying fixes, and "check the server
      // is running" sends the owner to look in the wrong place. The API says
      // which plan and how many people; pass it straight through.
      setError(reasonOr(err, t('saveFailed')));
      setBusy(false);
    }
  };

  const index = STEPS.findIndex((s) => s.key === step);
  const openDays = hourRows.filter((r) => r.open).length;
  /** The salon itself has no week — following it is an intent, not hours. */
  const salonHasNoHours = branchHours.every((r) => !r.open);

  return (
    <>
      {/* Jira GRW-478 (U-4) — once something is typed, a stray tap beside the panel does not throw it away; Close does. */}
      <div className="drawer-scrim" onClick={displayName.trim() || phone.trim() || title.trim() || step !== 'who' ? undefined : onClose} />
      <div className="wiz" role="dialog" aria-modal="true" aria-label={t('title', { label: staffLower })} ref={dialogRef}>
        <div className="wiz-head">
          <div>
            <h2>{t('title', { label: staffLower })}</h2>
            {/*
              The reassurance the design puts here, in words rather than as a
              disabled button somebody has to discover is enabled. Two steps of
              a three-step form being optional is not guessable.
            */}
            <p className="wiz-sub">{t('sub')}</p>
          </div>
          <button type="button" className="wiz-close" onClick={onClose} aria-label={t('close')}>
            <IconClose />
          </button>
        </div>

        {/* Segments rather than dots: a dot says "three of something", a
            labelled segment says which one you are on and what the others are. */}
        <ol className="wiz-steps">
          {STEPS.map((s, i) => (
            <li key={s.key} className={`wiz-step ${i === index ? 'is-on' : ''} ${i < index ? 'is-done' : ''}`}>
              {/*
                Once the person has been created the steps stop being a way back (owner, 2026-10-12).
                
                Everything above has already been saved, so tapping "Who" from the finished screen showed the
                filled-in form with a Done button under it — a form that looks editable and saves nothing, and
                the one thing on that last screen that matters (the invite link, shown once) hidden behind it.
              */}
              <button type="button" disabled={Boolean(created)} onClick={() => setStep(s.key)} aria-current={i === index ? 'step' : undefined}>
                <span className="wiz-step-num">{i < index ? <IconCheck /> : i + 1}</span>
                <span className="wiz-step-label">{t(`steps.${s.key}`)}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="wiz-body">
          {step === 'who' && (
            <>
              {/* First, because it decides what the rest of the form asks — and the roster is mostly stylists, so
                  it opens on the common answer. */}
              <div className="wiz-section-label">{t('does')}</div>
              <div className="wiz-chips" role="radiogroup" aria-label={t('does')}>
                {(['staff', 'reception'] as const).map((k) => {
                  const noRoom = k === 'staff' && seatsLeft === 0;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={kind === k}
                      className={`wiz-chip ${kind === k ? 'is-on' : ''}`}
                      disabled={noRoom}
                      onClick={() => {
                        setKind(k);
                        /*
                         * Turned ON for the front desk, and otherwise left ALONE.
                         *
                         * This used to be `setWantsLogin(k === 'reception')`, which quietly undid the default the
                         * moment an owner tapped the chip that was already selected: Stylist is where the form
                         * opens, so tapping it is a no-op everywhere except here, where it switched the login —
                         * and the link — back off.
                         */
                        if (k === 'reception') setWantsLogin(true);
                      }}
                    >
                      {k === 'staff' ? providerLabel : tTeam('receptionist')}
                    </button>
                  );
                })}
              </div>
              <p className="field-hint wiz-kind-sub">
                {seatsLeft === 0 && kind === 'staff' ? t('noSeats', { label: staffLower }) : kind === 'staff' ? t('kindStaffSub') : t('kindReceptionSub')}
              </p>

              <div className="field">
                <label htmlFor="wiz-name">
                  {t('fullName')}
                  <span className="field-required" aria-hidden="true"> *</span>
                </label>
                <input
                  id="wiz-name"
                  type="text"
                  required
                  autoFocus={autoFocusField()}
                  value={displayName}
                  placeholder={t('namePlaceholder')}
                  aria-invalid={nameInvalid ? true : undefined}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    if (nameInvalid) setNameInvalid(false);
                  }}
                />
                {nameInvalid && <div role="alert" className="field-error">{t('nameRequired')}</div>}
              </div>

              <PhoneField
                id="wiz-phone"
                label={t('mobile')}
                optionalLabel={tCommon('optional')}
                required
                value={phone}
                error={phoneInvalid ? phoneProblem : null}
                onChange={(v) => {
                  setPhone(v);
                  if (phoneInvalid) setPhoneInvalid(false);
                }}
              />

              {kind === 'staff' && (
              <>
              <div className="wiz-section-label">{t('role')}</div>
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
                    autoFocus={autoFocusField()}
                    value={newRole}
                    placeholder={t('rolePlaceholder')}
                    onChange={(e) => setNewRole(e.target.value)}
                    onBlur={() => {
                      const role = newRole.trim();
                      if (role) setTitle(role);
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
                    <IconPlus /> {t('newRole')}
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

              {/* Jira GRW-234 — where this person works. Their bookings, hours and figures follow it.
                  Jira GRW-395 — asked only on "All": with a branch in the header, they are added to it. */}
              {branches.length > 1 && branchContext.choice === null ? (
                <>
                  <div className="wiz-section-label">{t('branch')}</div>
                  <div className="wiz-chips" role="radiogroup" aria-label={t('branch')}>
                    {branches.map((b, i) => {
                      const label = i === 0 ? t('mainSuffix', { name: b.name }) : b.name;
                      const full = fullBranches.includes(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          role="radio"
                          aria-checked={branchId === b.id}
                          className={`wiz-chip ${branchId === b.id ? 'is-on' : ''}`}
                          disabled={full}
                          onClick={() => {
                            branchTouched.current = true;
                            setBranchId(b.id);
                          }}
                        >
                          {full ? t('branchFull', { name: label }) : label}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
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
                    if (e.target.checked) setHourRows(branchHours);
                  }}
                />
                <span>
                  <strong>{t('sameHours')}</strong>
                  <span className="wiz-toggle-sub">
                    {/* Why this is a standing intent and not a copy, in one
                        sentence an owner can act on. */}
                    {t('sameHoursSub')}
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
                  {t('warnNoDays', { name: displayName.trim() || t('them') })}
                </div>
              )}

              {followsSalon && salonHasNoHours && (
                <div className="field-hint wiz-warn">
                  {t.rich('warnNoSalonHours', { name: displayName.trim() || t('them'), b: (chunks) => <strong>{chunks}</strong> })}
                </div>
              )}
            </>
          )}

          {step === 'login' &&
            (created ? (
              /* Shown once and never again: no route returns an invite's link a second time, only its hash is
                 stored. So this replaces the step rather than passing as a toast. */
              <div className="banner banner-info">
                <strong>{t('addedTitle', { name: displayName.trim() })}</strong>
                <div style={{ marginTop: 4 }}>{tTeam('sendTo', { phone: created.phone })}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input readOnly value={linkFor(created.token)} style={{ flex: '1 1 240px', minWidth: 0 }} onFocus={(e) => e.target.select()} />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      void copyToClipboard(linkFor(created.token)).then((ok) => {
                        setCopied(ok);
                        setCopyFailed(!ok);
                      });
                    }}
                  >
                    {copied ? tTeam('copied') : tTeam('copyLink')}
                  </button>
                  {/*
                    Jira GRW-? — handing the link over, in the app the salon already uses.
                    
                    A `wa.me` link in a new tab: the owner's own WhatsApp, their own send button. Nothing is sent
                    by Growza, so this needs no template, no opt-in and no WhatsApp account of the business's —
                    the same manual share the client list and the bill already offer. Optional beside Copy,
                    because a salon that does it another way still has the link in front of them.
                  */}
                  <a
                    className="btn btn-ghost"
                    href={`https://wa.me/${waDigits(created.phone)}?text=${encodeURIComponent(tTeam('shareText', { link: linkFor(created.token) }))}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <IconWhatsApp /> {tTeam('shareOnWhatsApp')}
                  </a>
                </div>
                {copyFailed && (
                  <div role="alert" className="field-hint" style={{ marginTop: 8 }}>
                    {tTeam('copyFailed')}
                  </div>
                )}
              </div>
            ) : loginFailed ? (
              <div role="alert" className="banner">
                {loginFailed}
              </div>
            ) : (
              <>
                <label className="wiz-toggle">
                  <input
                    type="checkbox"
                    checked={wantsLogin}
                    // The front desk's is not a choice: without a login there is nobody to create.
                    disabled={kind === 'reception'}
                    onChange={(e) => setWantsLogin(e.target.checked)}
                  />
                  <span>
                    {t('loginToggle')}
                    <span className="wiz-toggle-sub">{kind === 'reception' ? t('loginNeeded') : t('loginToggleSub')}</span>
                  </span>
                </label>
                {!wantsLogin && <p className="field-hint">{t('loginNone')}</p>}
              </>
            ))}
        </div>

        <div className="wiz-actions">
          {error && <div role="alert" className="field-error wiz-error">{error}</div>}
          {created || loginFailed ? (
            <div className="wiz-actions-row">
              <span className="wiz-spacer" />
              <button type="button" className="btn" onClick={onClose}>
                {t('done')}
              </button>
            </div>
          ) : (
          <div className="wiz-actions-row">
            {index > 0 && (
              <button type="button" className="btn btn-ghost" onClick={() => setStep(STEPS[index - 1]!.key)}>
                {t('back')}
              </button>
            )}
            <span className="wiz-spacer" />
            {/*
              One button at a time: Next until the last step, then Save (owner, 2026-10-12).
              
              Save used to be live from step 1, because every later step has a sensible default — the salon's
              hours, and no login. It still has those defaults; what changed is that the owner wants the whole
              form walked, so that the login question is seen rather than skipped past. Next carries the same
              guard Save did, so an empty name or a bad number stops here rather than three screens later.
            */}
            {index < STEPS.length - 1 ? (
              <button type="button" className="btn" disabled={!canSave} onClick={() => setStep(STEPS[index + 1]!.key)}>
                {t('next')}
              </button>
            ) : (
              <button type="button" className="btn" disabled={busy || !canSave} onClick={save}>
                {/* The button says which of the two endings it leads to: the link screen, or a closed sheet. */}
                {busy ? t('saving') : wantsLogin ? t('saveLink') : t('saveClose')}
              </button>
            )}
          </div>
          )}
        </div>
      </div>
    </>
  );
}
