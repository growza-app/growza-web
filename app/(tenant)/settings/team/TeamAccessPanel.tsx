'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, ApiError, type CreatedInvite, type PendingInvite, type Provider, type TeamMember } from '../../lib/api';
/*
 * GRW-199 — the shared phone rule, replacing this panel's own.
 *
 * `toE164`/`validateInvitePhone` existed because an owner typing ten digits for
 * a stylist was doing the normal thing while the invite route demanded a
 * leading `+`. With the dial code rendered as chrome the two can no longer
 * disagree: what the field holds is ten digits, and what is sent is always
 * `+91` and those ten.
 */
import { PhoneField } from '../../components/PhoneField';
import { copyToClipboard } from '../../lib/copy-to-clipboard';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { toStoredPhone } from '../../lib/phone';
import { usePhoneProblem } from '../../lib/use-phone-problem';

/**
 * Jira GRW-63 · GRW-67 — send an invite, see what is outstanding, take one back.
 *
 * The screen's one unusual job: **the link is shown once and never again.** No
 * route returns a token a second time, because only its hash is stored. So the
 * new link gets its own block that stays put until the owner dismisses it,
 * rather than a toast that can be missed by looking away.
 */
function daysLeft(iso: string): number {
  return Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000);
}

export function TeamAccessPanel({
  initial,
  providers,
  initialMembers = [],
  branches = [],
}: {
  initial: PendingInvite[];
  providers: Provider[];
  initialMembers?: TeamMember[];
  branches?: Array<{ id: string; name: string }>;
}) {
  const checkPhone = usePhoneProblem();
  const t = useTranslations('settingsTeam');
  const expiryLabel = (iso: string) => (daysLeft(iso) <= 0 ? t('expiresToday') : t('expiresIn', { days: daysLeft(iso) }));
  const [invites, setInvites] = useState<PendingInvite[]>(initial);
  /**
   * Jira GRW-237 — each branch has its own receptionist. Asked only when there
   * is more than one branch; with one, there is nothing to choose.
   */
  const multiBranch = branches.length > 1;
  const [locationId, setLocationId] = useState('');
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [savingMember, setSavingMember] = useState<string | null>(null);
  const branchName = (id: string | null | undefined) => branches.find((b) => b.id === id)?.name ?? null;
  const [phone, setPhone] = useState('');
  /**
   * GRW-169 — what this person will be able to do.
   *
   * `staff` stays the default because it is the smaller permission and it is
   * what every invite meant before this control existed. `owner` and `manager`
   * are not offered: manager is documented as headroom TREATED AS OWNER, so
   * putting it in this list would be handing over the business behind a
   * gentler word.
   */
  const [role, setRole] = useState<'staff' | 'receptionist'>('staff');
  /**
   * Jira GRW-63 · GRW-171 — WHICH stylist this login belongs to.
   *
   * QA found the gap this closes: the form sent only a phone and a role, so
   * every stylist invite created a member with a null `provider_id`. That
   * resolves to `NO_PROVIDER` — a scope that matches nothing, correctly — and
   * the person signed in to an **empty diary**. The permission worked, the
   * account worked, and the product had nothing to show them.
   *
   * Required for `staff` (BR-01 below) and meaningless for a receptionist, who
   * runs everybody's day; the API drops it for them either way.
   */
  const [providerId, setProviderId] = useState('');
  /** Field-level, shown under the input. Distinct from `error`, which is the server's answer. */
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<(CreatedInvite & { phone: string }) | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const refresh = async () => {
    const { invites: next } = await api.teamInvites();
    setInvites(next);
  };

  const send = async () => {
    /**
     * Checked here, before the request, so a mistyped number is a message
     * under the field rather than a round trip that comes back a raw 400.
     * The API stores E.164 (BR-04) and will not complete a bare number for us;
     * `toStoredPhone` below is what always prepends the dial code.
     */
    const complaint = checkPhone(phone);
    if (complaint) {
      setPhoneError(complaint);
      return;
    }
    /**
     * BR-01 — a stylist invite MUST name a stylist. Refusing here rather than
     * defaulting to the first on the roster: guessing whose calendar somebody
     * gets is worse than asking, and the wrong guess is invisible until they
     * sign in to somebody else's day.
     */
    if (role === 'staff' && !providerId) {
      setError(t('errors.chooseStylistFirst'));
      return;
    }
    if (role === 'receptionist' && multiBranch && !locationId) {
      setError(t('errors.chooseBranchFirst'));
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
      const invite = await api.createTeamInvite({
        phone: e164,
        role,
        providerId: role === 'staff' ? providerId : null,
        locationId: role === 'receptionist' && multiBranch ? locationId : null,
      });
      // The normalised number, not what was typed — it is the one the invite
      // is actually for, and the one they will sign in with.
      setCreated({ ...invite, phone: e164 });
      setPhone('');
      // The next invite is for somebody else: nothing from this one is carried into it (GRW-253 QA).
      setLocationId('');
      setProviderId('');
      await refresh();
    } catch (e) {
      // The server's own words when it has any — "That number is already on
      // this team" tells an owner what to do; a generic failure does not.
      setError(e instanceof ApiError ? e.message : t('errors.loadError'));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setError(null);
    try {
      await api.revokeTeamInvite(id);
      if (created?.id === id) setCreated(null);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('errors.loadError'));
    }
  };

  /** Jira GRW-237 — move a receptionist to a branch. Saved on choosing; there is nothing else on the row to save. */
  const moveMember = async (userId: string, next: string) => {
    if (!next) return;
    setError(null);
    setSavingMember(userId);
    try {
      await api.setTeamMemberBranch(userId, next);
      setMembers((all) => all.map((m) => (m.userId === userId ? { ...m, locationId: next, locationName: branchName(next) } : m)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('errors.loadError'));
    } finally {
      setSavingMember(null);
    }
  };

  /**
   * Jira GRW-470 — take a login away. There was no way to: somebody who left kept every client number at their
   * branch for as long as their password worked. Asked first, because it is immediate — their next tap is refused.
   */
  const [confirmRemove, setConfirmRemove] = useState<TeamMember | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const doRemove = async (member: TeamMember) => {
    setRemoving(true);
    setRemoveError(null);
    try {
      await api.removeTeamMember(member.userId);
      setMembers((all) => all.filter((m) => m.userId !== member.userId));
      setConfirmRemove(null);
    } catch (e) {
      setRemoveError(e instanceof ApiError ? e.message : t('errors.loadError'));
    } finally {
      setRemoving(false);
    }
  };
  const roleLabel = (m: TeamMember) => (m.role === 'receptionist' ? t('receptionist') : t('stylist'));
  const memberName = (m: TeamMember) => m.providerName ?? m.phone ?? roleLabel(m);
  const loginHolders = members.filter((m) => m.role === 'receptionist' || m.role === 'staff');

  const linkFor = (token: string) =>
    `${typeof window === 'undefined' ? '' : window.location.origin}/join/${token}`;

  return (
    <div className="card">
      <div className="card-head">{t('title')}</div>
      <div className="card-body">
        <p className="field-hint" style={{ marginTop: 0, marginBottom: 14 }}>
          {t('intro')}
        </p>

        <div className="team-invite-grid">
          {/* GRW-199 — the shared field: a greyed +91 and ten digits. It
              cannot hold an invalid character, so the old validate-on-blur
              dance is gone; what remains is the length check on submit. */}
          <div className="team-invite-phone">
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
          </div>
          <div className="team-role-field">
            <label htmlFor="invite-role">{t('role')}</label>
            <select
              id="invite-role"
              value={role}
              disabled={busy}
              onChange={(e) => setRole(e.target.value as typeof role)}
            >
              <option value="staff">{t('roleStaff')}</option>
              <option value="receptionist">{t('roleReceptionist')}</option>
            </select>
          </div>
          {/* Only for a stylist. A receptionist runs the whole diary, so a
              "whose calendar?" question has no answer for them and the API
              drops the field anyway. */}
          {role === 'staff' && (
            <div className="team-role-field">
              <label htmlFor="invite-provider">{t('whoseCalendar')}</label>
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
          {role === 'receptionist' && multiBranch && (
            <div className="team-role-field">
              <label htmlFor="invite-branch">{t('whichBranch')}</label>
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
          <button
            className="btn team-invite-btn"
            disabled={busy || !phone.trim() || (role === 'staff' && !providerId) || (role === 'receptionist' && multiBranch && !locationId)}
            onClick={() => void send()}
          >
            {busy ? t('creating') : t('createInvite')}
          </button>
        </div>
        {error && <div role="alert" className="field-error">{error}</div>}

        {created && (
          <div className="banner banner-info" style={{ marginTop: 16 }}>
            <strong>{created.resent ? t('newLink') : t('ready')}</strong>
            <div style={{ marginTop: 4 }}>
              {/* Said plainly, because it is the one thing that cannot be
                  undone by coming back to this screen later. */}
              {t('sendTo', { phone: created.phone })}
              {created.resent && ` ${t('resentNote')}`}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input readOnly value={linkFor(created.token)} style={{ flex: '1 1 240px', minWidth: 0 }} onFocus={(e) => e.target.select()} />
              {/* The primary button, not a ghost one: copying the link is the
                  single thing this banner exists to make happen, and the link
                  is shown once. A quiet control here is a link not copied. */}
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
            </div>
            {/* Said instead of "Copied", never alongside it: the link is shown once, so a refused copy has to
                be visible while the field is still on screen to copy from by hand. */}
            {copyFailed && (
              <div role="alert" className="field-hint" style={{ marginTop: 8 }}>
                {t('copyFailed')}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 620, fontSize: 14.5, marginBottom: 8 }}>{t('waiting')}</div>
          {invites.length === 0 ? (
            <p className="field-hint" style={{ margin: 0 }}>
              {t('noInvites')}
            </p>
          ) : (
            invites.map((invite, i) => (
              <div
                key={invite.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 0',
                  borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 620, fontSize: 14.5 }}>{invite.phone}</div>
                  <div className="field-hint" style={{ margin: 0 }}>
                    {expiryLabel(invite.expiresAt)}
                    {multiBranch && branchName(invite.locationId) ? ` · ${branchName(invite.locationId)}` : ''}
                  </div>
                </div>
                {/* `btn-ghost btn-danger`, the pattern the services table
                    already uses for a destructive row action — cancelling
                    kills the link the invitee is holding. Quiet rather than
                    prominent: it sits beside every pending row, and a filled
                    green button there reads as the thing to press. */}
                <button type="button" className="btn btn-ghost btn-danger" onClick={() => void revoke(invite.id)}>
                  {t('cancel')}
                </button>
              </div>
            ))
          )}
        </div>

        {/* Jira GRW-237 — each branch has its own front desk. Only with more than one
            branch: one branch has nothing to choose, and the screen stays as it was. */}
        {multiBranch && members.some((m) => m.role === 'receptionist') && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 620, fontSize: 14.5, marginBottom: 8 }}>{t('receptionists')}</div>
            {members
              .filter((m) => m.role === 'receptionist')
              .map((m, i) => (
                <div
                  key={m.userId}
                  className="team-member-row"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                    padding: '12px 0',
                    borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                    <div style={{ fontWeight: 620, fontSize: 14.5 }}>{m.phone ?? t('receptionist')}</div>
                    <div className="field-hint" style={{ margin: 0 }}>
                      {m.locationId ? t('worksAt', { branch: m.locationName ?? branchName(m.locationId) ?? '' }) : t('everyBranch')}
                    </div>
                  </div>
                  <select
                    aria-label={m.phone ? t('branchFor', { phone: m.phone }) : t('branchForUnnamed')}
                    value={m.locationId ?? ''}
                    disabled={savingMember === m.userId}
                    onChange={(e) => void moveMember(m.userId, e.target.value)}
                    style={{ flex: '0 1 260px', minWidth: 0 }}
                  >
                    {!m.locationId && <option value="">{t('chooseBranch')}</option>}
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
          </div>
        )}

        {/* Jira GRW-470 — everybody who can sign in, and the way to stop them. The owner is not listed: a business
            keeps its owner. */}
        {loginHolders.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 620, fontSize: 14.5, marginBottom: 8 }}>{t('canSignIn')}</div>
            {loginHolders.map((m, i) => (
              <div
                key={m.userId}
                className="team-member-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 0',
                  borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 620, fontSize: 14.5 }}>{memberName(m)}</div>
                  <div className="field-hint" style={{ margin: 0 }}>
                    {roleLabel(m)}
                    {m.phone && m.providerName ? ` · ${m.phone}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-danger"
                  aria-label={t('removeFor', { name: memberName(m) })}
                  onClick={() => {
                    setRemoveError(null);
                    setConfirmRemove(m);
                  }}
                >
                  {t('remove')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {confirmRemove && (
        <ConfirmDialog
          title={t('removeTitle', { name: memberName(confirmRemove) })}
          body={t('removeBody')}
          confirmLabel={t('remove')}
          tone="danger"
          busy={removing}
          error={removeError}
          onConfirm={() => void doRemove(confirmRemove)}
          onCancel={() => {
            setConfirmRemove(null);
            setRemoveError(null);
          }}
        />
      )}
    </div>
  );
}
