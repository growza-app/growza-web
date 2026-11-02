'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState, type ReactNode } from 'react';
import { api, ApiError, type CreatedInvite, type PendingInvite, type ProviderOverviewRow, type ShopRole, type TeamMember } from '../lib/api';
import { PersonPhoto } from '../components/PersonPhoto';
import { PhoneField } from '../components/PhoneField';
import { useDialog } from '../../shared/a11y/useDialog';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import { toStoredPhone } from '../lib/phone';
import { usePhoneProblem } from '../lib/use-phone-problem';
import { IconClose, IconWhatsApp } from '../components/icons';
import { waDigits } from '../components/BookingSheet';

/**
 * Who can sign in, on the Staff screen.
 *
 * This was its own Settings tab ("Team access"), which is why an owner met the same stylist twice: once on Staff as
 * somebody the diary can book, and again under Settings as somebody with a password. The two lists never said how
 * they related, and a receptionist — who has a login and no diary — appeared only on the one nobody opened.
 *
 * So the screen is Staff, and a login is something a person HAS. A stylist's row carries the state ("Can sign in",
 * "Invited"); the front desk is a group of its own, because a receptionist is a person this business has and not a
 * person the diary can book. Nothing about the API changed: the same invite, revoke, branch and remove routes, in
 * the same order, with the same refusals.
 *
 * These are the presentational halves. The state and every request live in `StaffClient`, which already owns the
 * roster they sit under — one owner for one screen's data.
 */

/** What an invite is being created FOR: a stylist (whose calendar it is) or the front desk. */
export type InviteTarget = { role: 'staff' | 'receptionist' | 'manager'; providerId?: string };

/**
 * The picker's value for "a joint owner". Two underscores at each end because it shares a `<select>` with this
 * business's own role ids, and a role can be called anything — including "owner".
 */
const OWNER_OPTION = '__joint_owner__';

/**
 * The bottom sheet both the invite form and "Add a staff member" sit in: backdrop, grab handle, title, close button, Escape and focus kept in.
 * `dismiss` is what a tap outside or Escape does; absent while the sheet must not be dismissed (a request in flight, or a link shown once).
 */
export function InviteShell({
  title,
  sub,
  closeLabel,
  onClose,
  dismiss,
  children,
}: {
  title: string;
  sub: string;
  closeLabel: string;
  onClose: () => void;
  dismiss?: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, { onClose: dismiss });
  return (
    <>
      <div className="sheet-backdrop sheet-backdrop-fade" onClick={dismiss} />
      <div className="sheet sheet-rise invite-sheet" role="dialog" aria-modal="true" aria-label={title} ref={dialogRef}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sheet-title">{title}</div>
            <div className="sheet-sub">{sub}</div>
          </div>
          <button type="button" className="wiz-close" onClick={onClose} aria-label={closeLabel}>
            <IconClose />
          </button>
        </div>
        <div className="invite-body">{children}</div>
      </div>
    </>
  );
}

export function daysLeft(iso: string): number {
  return Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000);
}

/**
 * The invite form, as a sheet.
 *
 * **The link is shown once and no route ever returns it again** — only its hash is stored. So creating one does not
 * close the sheet: it replaces the form with the link and a Copy button, and the owner closes it when they have sent
 * it. A toast here would be a link lost by looking away.
 */
export function InviteSheet({
  target,
  providers,
  branches,
  roles,
  onClose,
  onCreated,
}: {
  target: InviteTarget;
  /**
   * Jira GRW-73 — a business that has roles invites INTO one: the role decides which kind of login this is, so the kind picker is
   * replaced by the roles that can be given. Absent for a diary business, which invites as it always did.
   */
  roles?: ShopRole[];
  /** Every stylist who could hold this login — the whole business's, not the branch being looked at. */
  providers: ProviderOverviewRow[];
  branches: Array<{ id: string; name: string }>;
  onClose: () => void;
  /** A fresh invite landed; the screen re-reads its lists. */
  onCreated: () => void;
}) {
  const t = useTranslations('settingsTeam');
  const checkPhone = usePhoneProblem();
  const multiBranch = branches.length > 1;
  const tRoles = useTranslations('settingsRoles');
  const [role, setRole] = useState<'staff' | 'receptionist' | 'manager'>(target.role);
  /**
   * A JOINT OWNER — a second person who owns this business, with an owner's login.
   *
   * Its own flag rather than a fourth `role`, because that is what it is on the server: owner lives outside the
   * role system (it holds no role and has no calendar and no branch), and the invite carries `jointOwner: true`
   * and a name and nothing else. Keeping it beside `role` rather than inside it means every rule below — whose
   * calendar, which branch, which role — stays written in the terms it was written in.
   */
  const [jointOwner, setJointOwner] = useState(false);
  /** The second press. Making an owner is the one choice on this sheet that cannot be undone by the person making it. */
  const [confirmOwner, setConfirmOwner] = useState(false);
  const [tenantRoleId, setTenantRoleId] = useState('');
  const [providerId, setProviderId] = useState(target.providerId ?? '');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [locationId, setLocationId] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<(CreatedInvite & { phone: string }) | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  // Only once the link is gone: closing on the backdrop while it is on screen would lose it for good.
  const dismiss = busy || created ? undefined : onClose;

  const linkFor = (token: string) => `${typeof window === 'undefined' ? '' : window.location.origin}/join/${token}`;

  const send = async () => {
    /**
     * Checked here, before the request, so a mistyped number is a message under the field rather than a round trip
     * that comes back a raw 400. The API stores E.164 (BR-04) and will not complete a bare number for us.
     */
    const complaint = checkPhone(phone);
    if (complaint) {
      setPhoneError(complaint);
      return;
    }
    /**
     * BR-01 — a stylist invite MUST name a stylist. Refusing here rather than defaulting to the first on the roster:
     * guessing whose calendar somebody gets is worse than asking, and the wrong guess is invisible until they sign
     * in to somebody else's day.
     */
    if (jointOwner && !name.trim()) {
      setError(t('errors.nameNeeded'));
      return;
    }
    if (!jointOwner && role === 'staff' && !providerId) {
      setError(t('errors.chooseStylistFirst'));
      return;
    }
    if (!jointOwner && role === 'receptionist' && multiBranch && !locationId) {
      setError(t('errors.chooseBranchFirst'));
      return;
    }
    if (roles && !jointOwner && !tenantRoleId) {
      setError(tRoles('chooseRoleFirst'));
      return;
    }
    const e164 = toStoredPhone(phone)!;

    setBusy(true);
    setError(null);
    setPhoneError(null);
    setCreated(null);
    setCopied(false);
    setCopyFailed(false);
    try {
      // An owner's invite carries a phone and a name and nothing else: no role (they hold none), no stylist
      // (no calendar) and no branch (every one of them). The server refuses the extras rather than ignoring them.
      const invite = await api.createTeamInvite(
        jointOwner
          ? { phone: e164, name: name.trim(), jointOwner: true }
          : {
              phone: e164,
              role,
              providerId: role === 'staff' ? providerId : null,
              locationId: role === 'receptionist' && multiBranch ? locationId : null,
              name: (role === 'receptionist' || role === 'manager') && name.trim() ? name.trim() : null,
              ...(roles ? { tenantRoleId } : {}),
            },
      );
      // The normalised number, not what was typed — it is the one the invite is actually for, and the one they
      // will sign in with.
      setCreated({ ...invite, phone: e164 });
      onCreated();
    } catch (e) {
      // The server's own words when it has any — "That number is already on this team" tells an owner what to do;
      // a generic failure does not.
      setError(e instanceof ApiError ? e.message : t('errors.loadError'));
    } finally {
      setBusy(false);
    }
  };

  const stylistName = providers.find((p) => p.id === providerId)?.displayName ?? null;

  return (
    <InviteShell
      title={t('inviteTitle')}
      sub={stylistName && role === 'staff' && !jointOwner ? t('inviteSubFor', { name: stylistName }) : t('intro')}
      closeLabel={t('closeInvite')}
      onClose={onClose}
      dismiss={dismiss}
    >
          {created ? (
            <div className="banner banner-info">
              <strong>{created.resent ? t('newLink') : t('ready')}</strong>
              <div style={{ marginTop: 4 }}>
                {/* Said plainly, because it is the one thing that cannot be undone by coming back later. */}
                {t('sendTo', { phone: created.phone })}
                {created.resent && ` ${t('resentNote')}`}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <input readOnly value={linkFor(created.token)} style={{ flex: '1 1 240px', minWidth: 0 }} onFocus={(e) => e.target.select()} />
                {/* The primary button, not a ghost one: copying the link is the single thing this banner exists to
                    make happen, and the link is shown once. A quiet control here is a link not copied. */}
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
                  {copied ? t('copied') : t('copyLink')}
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
                  href={`https://wa.me/${waDigits(created.phone)}?text=${encodeURIComponent(t('shareText', { link: linkFor(created.token) }))}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <IconWhatsApp /> {t('shareOnWhatsApp')}
                </a>
              </div>
              {/* Said instead of "Copied", never alongside it: the link is shown once, so a refused copy has to be
                  visible while the field is still on screen to copy from by hand. */}
              {copyFailed && (
                <div role="alert" className="field-hint" style={{ marginTop: 8 }}>
                  {t('copyFailed')}
                </div>
              )}
              <button type="button" className="btn btn-ghost" style={{ marginTop: 12 }} onClick={onClose}>
                {t('done')}
              </button>
            </div>
          ) : (
            <>
              {roles ? (
                <div className="field">
                  <label htmlFor="invite-role">{t('role')}</label>
                  {roles.length === 0 ? (
                    <p className="field-hint" style={{ margin: 0 }}>
                      {tRoles('makeRoleFirst')}
                    </p>
                  ) : (
                    <select
                      id="invite-role"
                      value={jointOwner ? OWNER_OPTION : tenantRoleId}
                      disabled={busy}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Owner is not one of this business's roles and never will be: it is hardcoded outside
                        // them. It sits at the end of the same list because "what will they be?" is the question
                        // the owner is answering here, and owner is one of the answers.
                        setJointOwner(value === OWNER_OPTION);
                        setConfirmOwner(false);
                        setTenantRoleId(value === OWNER_OPTION ? '' : value);
                        const picked = roles.find((r) => r.id === value);
                        if (picked?.worksLike === 'receptionist' || picked?.worksLike === 'staff' || picked?.worksLike === 'manager') setRole(picked.worksLike);
                        setError(null);
                      }}
                    >
                      <option value="">{tRoles('chooseRole')}</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                      <option value={OWNER_OPTION}>{t('roleOwner')}</option>
                    </select>
                  )}
                </div>
              ) : (
                <div className="field">
                  <label htmlFor="invite-role">{t('role')}</label>
                  <select
                    id="invite-role"
                    value={jointOwner ? OWNER_OPTION : role}
                    disabled={busy}
                    onChange={(e) => {
                      const picked = e.target.value;
                      setJointOwner(picked === OWNER_OPTION);
                      setConfirmOwner(false);
                      if (picked !== OWNER_OPTION) setRole(picked as typeof role);
                      setError(null);
                    }}
                  >
                    <option value="staff">{t('roleStaff')}</option>
                    <option value="receptionist">{t('roleReceptionist')}</option>
                    <option value={OWNER_OPTION}>{t('roleOwner')}</option>
                  </select>
                </div>
              )}

              {/* Only for a stylist. A receptionist runs the whole diary, so a "whose calendar?" question has no
                  answer for them and the API drops the field anyway. */}
              {role === 'staff' && !jointOwner && (
                <div className="field">
                  <label htmlFor="invite-provider">
                    {roles ? tRoles('whichPerson') : t('whoseCalendar')}
                    <span className="field-required" aria-hidden="true"> *</span>
                  </label>
                  {providers.length === 0 ? (
                    <p className="field-hint" style={{ margin: 0 }}>
                      {t('noStaff')}
                    </p>
                  ) : (
                    <select
                      id="invite-provider"
                      value={providerId}
                      disabled={busy}
                      onChange={(e) => {
                        setProviderId(e.target.value);
                        setError(null);
                      }}
                    >
                      <option value="">{t('chooseStylist')}</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.displayName}
                          {p.title ? ` · ${p.title}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {(jointOwner || role === 'receptionist' || role === 'manager') && (
                <div className="field">
                  <label htmlFor="invite-name">
                    {t('theirName')}
                    <span className="field-required" aria-hidden="true"> *</span>
                  </label>
                  <input id="invite-name" type="text" required autoComplete="off" maxLength={60} value={name} disabled={busy} onChange={(e) => setName(e.target.value)} />
                </div>
              )}

              {role === 'receptionist' && !jointOwner && multiBranch && (
                <div className="field">
                  <label htmlFor="invite-branch">
                    {t('whichBranch')}
                    <span className="field-required" aria-hidden="true"> *</span>
                  </label>
                  <select
                    id="invite-branch"
                    value={locationId}
                    disabled={busy}
                    onChange={(e) => {
                      setLocationId(e.target.value);
                      setError(null);
                    }}
                  >
                    <option value="">{t('chooseBranch')}</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* GRW-199 — the shared field: a greyed +91 and ten digits. It cannot hold an invalid character, so
                  the old validate-on-blur dance is gone; what remains is the length check on submit. */}
              <PhoneField
                id="invite-phone"
                label={t('mobile')}
                required
                value={phone}
                disabled={busy}
                error={phoneError}
                onChange={(v) => {
                  setPhone(v);
                  if (phoneError) setPhoneError(null);
                }}
              />

              {error && (
                <div role="alert" className="field-error">
                  {error}
                </div>
              )}

              {/*
                The one thing on this sheet that the person doing it cannot undo on their own: another owner can
                remove them, they cannot. So it is said plainly, in the words of what the other person will be able
                to do, and it takes a second press — not a dialog, which is one more thing to dismiss on a phone.
              */}
              {jointOwner && !busy && (
                <div role="alert" className="banner">
                  {t('ownerWarning')}
                </div>
              )}
              <button
                className="btn invite-submit"
                disabled={
                  busy ||
                  !phone.trim() ||
                  ((jointOwner || role === 'receptionist' || role === 'manager') && !name.trim()) ||
                  (!!roles && !jointOwner && !tenantRoleId)
                }
                onClick={() => {
                  if (jointOwner && !confirmOwner) {
                    setConfirmOwner(true);
                    return;
                  }
                  void send();
                }}
              >
                {busy ? t('creating') : jointOwner && confirmOwner ? t('ownerConfirm') : t('createInvite')}
              </button>
              {jointOwner && confirmOwner && !busy && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setConfirmOwner(false);
                    setJointOwner(false);
                  }}
                >
                  {t('ownerCancel')}
                </button>
              )}
              {/* Why the button would refuse, said before it is pressed rather than after. */}
              {!busy && phone.trim() && (jointOwner || role === 'receptionist' || role === 'manager') && !name.trim() && <p className="field-hint">{t('errors.nameNeeded')}</p>}
              {!busy && phone.trim() && !jointOwner && role === 'staff' && !providerId && <p className="field-hint">{t('errors.chooseStylistFirst')}</p>}
              {!busy && phone.trim() && !jointOwner && role === 'receptionist' && multiBranch && !locationId && <p className="field-hint">{t('errors.chooseBranchFirst')}</p>}
            </>
          )}
    </InviteShell>
  );
}

/**
 * The front desk — everybody with a login and no diary.
 *
 * Its own group rather than a row in the roster: a receptionist has no shift bar, no bookings today and no
 * availability switch, and giving them an empty one of each would read as a fault.
 */
export function LoginGroup({
  title,
  /** The sentence shown when nobody is in this group. Absent means the group simply does not draw. */
  empty,
  members,
  branches,
  savingId,
  roleLabel,
  onMove,
  onRemove,
  removable,
  writable,
}: {
  title: string;
  empty?: string;
  members: TeamMember[];
  branches: Array<{ id: string; name: string }>;
  /** The row whose branch is being saved, so its select cannot be fired twice. */
  savingId: string | null;
  roleLabel: (m: TeamMember) => string;
  onMove: (userId: string, locationId: string) => void;
  onRemove: (m: TeamMember) => void;
  /**
   * Whether THIS row may be taken away. Absent means every row may, which is how the front desk and the stray
   * logins have always behaved. The owners group passes one: the last owner has no Remove at all, because a
   * button that is always refused teaches an owner that the screen is broken rather than that the rule exists.
   */
  removable?: (m: TeamMember) => boolean;
  writable: boolean;
}) {
  const t = useTranslations('settingsTeam');
  const multiBranch = branches.length > 1;
  // The empty front desk still draws, because its one line is how an owner learns the role exists; every other
  // login group is drawn only when it has somebody in it.
  if (members.length === 0 && !empty) return null;
  return (
    <>
      <div className="staff-group-head">
        <span className="staff-group-dot" />
        <span className="staff-group-title">
          {title}
          {members.length > 0 ? ` · ${members.length}` : ''}
        </span>
      </div>
      {members.length === 0 ? (
        <p className="field-hint staff-group-empty">{empty}</p>
      ) : (
        <div className="login-rows">
          {members.map((m) => {
            const name = m.name ?? m.providerName ?? m.phone ?? roleLabel(m);
            return (
              <div key={m.userId} className="login-row">
                {/* The tile letters come from a NAME, never the number: `initials('+919822200011')` is "+". */}
                <PersonPhoto name={m.name ?? m.providerName ?? roleLabel(m)} />
                <div className="login-identity">
                  <div className="login-name">{name}</div>
                  <div className="login-sub">
                    <span>
                      {roleLabel(m)}
                      {m.phone && (m.name || m.providerName) ? ` · ${m.phone}` : ''}
                    </span>
                    <span className="staff-badge staff-badge-in">{t('chipIn')}</span>
                  </div>
                </div>
                {/*
                  Jira GRW-237 — each branch has its own front desk, so a receptionist's branch is chosen on their
                  own row. Only with more than one branch: one branch has nothing to choose.
                */}
                {multiBranch && m.role === 'receptionist' ? (
                  <select
                    className="login-branch"
                    aria-label={m.phone ? t('branchFor', { phone: m.phone }) : t('branchForUnnamed')}
                    value={m.locationId ?? ''}
                    disabled={savingId === m.userId || !writable}
                    onChange={(e) => void onMove(m.userId, e.target.value)}
                  >
                    {/* No branch means every branch — say so, rather than a blank that reads as missing (and
                        invites pinning them to one without knowing that's a change). */}
                    {!m.locationId && <option value="">{t('everyBranch')}</option>}
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                {writable && (removable?.(m) ?? true) && (
                  <button type="button" className="btn btn-ghost btn-danger" aria-label={t('removeFor', { name })} onClick={() => onRemove(m)}>
                    {t('remove')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/** Invites sent and not yet accepted. Shown only when there are any — an empty block here is a block about nothing. */
export function WaitingGroup({
  invites,
  branchName,
  onRevoke,
  writable,
}: {
  invites: PendingInvite[];
  branchName: (id: string | null | undefined) => string | null;
  onRevoke: (id: string) => void;
  writable: boolean;
}) {
  const t = useTranslations('settingsTeam');
  if (invites.length === 0) return null;
  const expiryLabel = (iso: string) => (daysLeft(iso) <= 0 ? t('expiresToday') : t('expiresIn', { days: daysLeft(iso) }));
  return (
    <>
      <div className="staff-group-head">
        <span className="staff-group-dot" />
        <span className="staff-group-title">
          {t('waiting')} · {invites.length}
        </span>
      </div>
      <div className="login-rows">
        {invites.map((invite) => (
          <div key={invite.id} className="login-row">
            <PersonPhoto name={invite.name ?? t('chipInvited')} />
            <div className="login-identity">
              <div className="login-name">{invite.name ?? invite.phone}</div>
              <div className="login-sub">
                <span>
                  {invite.roleName ? `${invite.roleName} · ` : ''}
                  {expiryLabel(invite.expiresAt)}
                  {branchName(invite.locationId) ? ` · ${branchName(invite.locationId)}` : ''}
                </span>
                <span className="staff-badge staff-badge-invited">{t('chipInvited')}</span>
              </div>
            </div>
            {/* `btn-ghost btn-danger`, the pattern the services table already uses for a destructive row action —
                cancelling kills the link the invitee is holding. */}
            {writable && (
              <button type="button" className="btn btn-ghost btn-danger" onClick={() => onRevoke(invite.id)}>
                {t('cancel')}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
