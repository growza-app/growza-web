'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, ApiError, type PendingInvite, type ProviderOverviewRow, type ShopRole, type TeamMember } from '../../lib/api';
import { useWritable } from '../../components/SessionProvider';
import { PersonPhoto } from '../../components/PersonPhoto';
import { InviteShell, InviteSheet, LoginGroup, WaitingGroup } from '../../providers/TeamLogins';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PhoneField } from '../../components/PhoneField';
import { toStoredPhone } from '../../lib/phone';
import { usePhoneProblem } from '../../lib/use-phone-problem';
import { rolesForMember, rolesToGive } from './role-choices';

/**
 * Jira GRW-73 — the people on a shop's team, and the role each holds.
 *
 * A shop has no Staff screen (its nav is Orders and Stock), so this is where an owner invites someone INTO a role and changes it later.
 * A role is offered to a person only if it works like what they already are — a desk login takes a desk role, a staff login a staff
 * role — because changing the kind of login is a new invitation, not an edit; the API refuses the rest in words.
 */
export function RolesTeam({
  roles,
  initialMembers,
  initialInvites,
  providers: initialProviders,
  branches,
  loadFailed,
  onChanged,
}: {
  roles: ShopRole[];
  initialMembers: TeamMember[];
  initialInvites: PendingInvite[];
  providers: ProviderOverviewRow[];
  branches: Array<{ id: string; name: string }>;
  loadFailed: boolean;
  /** Roles show how many people hold them; tell the screen above to re-read after a change here. */
  onChanged: () => void;
}) {
  const t = useTranslations('settingsRoles');
  // The owners group's words are the Staff screen's: it is the same group, on the screen a shop actually opens.
  const tTeam = useTranslations('settingsTeam');
  const writable = useWritable();
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [addingStaff, setAddingStaff] = useState(false);
  const [confirmLogin, setConfirmLogin] = useState<TeamMember | null>(null);
  const [removingLogin, setRemovingLogin] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [providers, setProviders] = useState(initialProviders);

  // Roles that can be given: any that works like a manager, a desk or staff (a role that works like nothing is refused by the API).
  // A staff-like login belongs to a person on the roster, and a shop has no screen to put one there: without anyone on it, only desk roles are offered.
  const rosterPeople = providers.filter((p) => p.active);
  const giveable = rolesToGive(roles, rosterPeople.length);
  const people = members.filter((m) => m.role !== 'owner');
  /*
   * The owners, who are not in `people` above and never were — there was one of them and it was you.
   *
   * A business can have joint owners now, and this is the screen a shop opens (it has no Staff screen), so this is
   * where an owner has to be able to see who else owns the business and take a login back from somebody who has
   * left. No role select on these rows: an owner holds no role, which is the whole reason they were filtered out.
   */
  const owners = members.filter((m) => m.role === 'owner');

  /** Take a login away. Asked first, because it is immediate: their next tap is refused. */
  const doRemoveLogin = async (member: TeamMember) => {
    setRemovingLogin(true);
    setLoginError(null);
    try {
      await api.removeTeamMember(member.userId);
      setMembers((all) => all.filter((m) => m.userId !== member.userId));
      setConfirmLogin(null);
    } catch (e) {
      setLoginError(e instanceof ApiError ? e.message : t('errors.roleFailed'));
    } finally {
      setRemovingLogin(false);
    }
  };

  const refresh = async () => {
    const [m, i] = await Promise.all([api.teamMembers().then((r) => r.members), api.teamInvites().then((r) => r.invites)]);
    setMembers(m);
    setInvites(i);
    onChanged();
  };

  const change = async (member: TeamMember, tenantRoleId: string) => {
    setSavingId(member.userId);
    setError(null);
    try {
      await api.setTeamMemberRole(member.userId, tenantRoleId || null);
      // The change is saved; a failed re-read must not be reported as a failed change.
      await refresh().catch(() => undefined);
    } catch (e) {
      setError(e instanceof ApiError && e.status < 500 ? e.message : t('errors.roleFailed'));
    } finally {
      setSavingId(null);
    }
  };

  const revoke = async (id: string) => {
    setError(null);
    try {
      await api.revokeTeamInvite(id);
      await refresh().catch(() => undefined);
    } catch (e) {
      setError(e instanceof ApiError && e.status < 500 ? e.message : t('errors.roleFailed'));
    }
  };

  return (
    <div className="card roles-card roles-team">
      <div className="card-head">{t('peopleTitle')}</div>
      <div className="card-body">
        <LoginGroup
          title={tTeam('owners')}
          members={owners}
          branches={branches}
          savingId={savingId}
          roleLabel={() => tTeam('owner')}
          // An owner has no branch of their own, so this group never draws the branch select that would call it.
          onMove={() => undefined}
          onRemove={(m) => {
            setLoginError(null);
            setConfirmLogin(m);
          }}
          // The last owner keeps no Remove: the API refuses it, and a button that is always refused reads as a
          // broken screen rather than as the rule it is.
          removable={() => owners.length > 1}
          writable={writable}
        />
        {loadFailed ? (
          <div role="alert" className="field-error">
            {t('errors.peopleFailed')}
          </div>
        ) : people.length === 0 ? (
          <p className="roles-empty">{t('peopleEmpty')}</p>
        ) : (
          <div className="login-rows">
            {people.map((m) => {
              const name = m.name ?? m.providerName ?? m.phone ?? t('unnamed');
              // Only roles of the same kind as this login — and the one they hold, so the select never shows a blank for it.
              const options = rolesForMember(roles, m);
              return (
                <div key={m.userId} className="login-row roles-person">
                  <PersonPhoto name={m.name ?? m.providerName ?? name} />
                  <div className="login-identity">
                    <div className="login-name">{name}</div>
                    <div className="login-sub">
                      <span>{m.phone ?? ''}</span>
                    </div>
                  </div>
                  <select
                    className="roles-person-role"
                    aria-label={t('roleFor', { name })}
                    value={m.tenantRoleId ?? ''}
                    disabled={savingId === m.userId || !writable}
                    onChange={(e) => void change(m, e.target.value)}
                  >
                    <option value="">{t('noRole')}</option>
                    {options.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <div role="alert" className="field-error">
            {error}
          </div>
        )}

        <WaitingGroup invites={invites} branchName={(id) => branches.find((b) => b.id === id)?.name ?? null} onRevoke={(id) => void revoke(id)} writable={writable} />

        {roles.some((r) => r.worksLike === 'staff') && rosterPeople.length === 0 && <p className="field-hint">{t('staffNeedsRoster')}</p>}

        <div className="roles-actions">
          <button type="button" className="btn" disabled={!writable || loadFailed} onClick={() => setInviting(true)}>
            {t('invite')}
          </button>
          <button type="button" className="btn btn-ghost" disabled={!writable || loadFailed} onClick={() => setAddingStaff(true)}>
            {t('addStaff')}
          </button>
        </div>
      </div>
      {addingStaff && (
        <AddStaffSheet
          branches={branches}
          onClose={() => setAddingStaff(false)}
          onAdded={async () => {
            // The new person must be on the roster before a Staff invitation can name them.
            setProviders(await api.providersOverview().then((o) => o.providers, () => providers));
          }}
        />
      )}
      {confirmLogin && (
        <ConfirmDialog
          title={tTeam('removeTitle', { name: confirmLogin.name ?? confirmLogin.phone ?? t('unnamed') })}
          body={tTeam('removeBody')}
          confirmLabel={tTeam('remove')}
          tone="danger"
          busy={removingLogin}
          error={loginError}
          onConfirm={() => void doRemoveLogin(confirmLogin)}
          onCancel={() => {
            setConfirmLogin(null);
            setLoginError(null);
          }}
        />
      )}
      {inviting && (
        <InviteSheet
          target={{ role: 'receptionist' }}
          roles={giveable}
          providers={rosterPeople}
          branches={branches}
          onClose={() => setInviting(false)}
          onCreated={() => void refresh().catch(() => undefined)}
        />
      )}
    </div>
  );
}

/**
 * Jira GRW-73 (follow-up) — add a person to a shop's staff from the Roles screen.
 *
 * A shop has no Staff screen, and a Staff login belongs to a person on the roster. So the name and number go here; the person is then on
 * the roster, ready to be invited to sign in with a role. No stylist wizard, no services, no hours: a shop's staff mark attendance.
 */
function AddStaffSheet({ branches, onClose, onAdded }: { branches: Array<{ id: string; name: string }>; onClose: () => void; onAdded: () => Promise<void> }) {
  const t = useTranslations('settingsRoles');
  const checkPhone = usePhoneProblem();
  const multiBranch = branches.length > 1;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [locationId, setLocationId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    const complaint = checkPhone(phone);
    if (complaint) {
      setPhoneError(complaint);
      return;
    }
    if (multiBranch && !locationId) {
      setError(t('chooseBranchFirst'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createProvider({ displayName: name.trim(), phone: toStoredPhone(phone)!, ...(multiBranch ? { locationId } : {}) });
      await onAdded();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError && e.status < 500 ? e.message : t('errors.addStaffFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <InviteShell title={t('addStaff')} sub={t('addStaffSub')} closeLabel={t('closeSheet')} onClose={onClose} dismiss={busy ? undefined : onClose}>
          <div className="field">
            <label htmlFor="staff-name">{t('staffName')}</label>
            <input id="staff-name" type="text" autoComplete="off" maxLength={60} value={name} disabled={busy} onChange={(e) => setName(e.target.value)} />
          </div>
          <PhoneField
            id="staff-phone"
            label={t('staffPhone')}
            required
            value={phone}
            disabled={busy}
            error={phoneError}
            onChange={(v) => {
              setPhone(v);
              if (phoneError) setPhoneError(null);
            }}
          />
          {multiBranch && (
            <div className="field">
              <label htmlFor="staff-branch">{t('staffBranch')}</label>
              <select id="staff-branch" value={locationId} disabled={busy} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">{t('chooseBranch')}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {error && (
            <div role="alert" className="field-error">
              {error}
            </div>
          )}
          <button className="btn invite-submit" disabled={busy || !name.trim() || !phone.trim()} onClick={() => void add()}>
            {busy ? t('saving') : t('addStaffSubmit')}
          </button>
    </InviteShell>
  );
}
