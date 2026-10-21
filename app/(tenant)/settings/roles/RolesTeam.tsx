'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, ApiError, type PendingInvite, type ProviderOverviewRow, type ShopRole, type TeamMember } from '../../lib/api';
import { useWritable } from '../../components/SessionProvider';
import { PersonPhoto } from '../../components/PersonPhoto';
import { InviteSheet, WaitingGroup } from '../../providers/TeamLogins';

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
  providers,
  branches,
  onChanged,
}: {
  roles: ShopRole[];
  initialMembers: TeamMember[];
  initialInvites: PendingInvite[];
  providers: ProviderOverviewRow[];
  branches: Array<{ id: string; name: string }>;
  /** Roles show how many people hold them; tell the screen above to re-read after a change here. */
  onChanged: () => void;
}) {
  const t = useTranslations('settingsRoles');
  const writable = useWritable();
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  // Roles that can be given today: ones that work like a desk or like staff (a manager-like or unset role is refused by the API).
  const giveable = roles.filter((r) => r.worksLike === 'receptionist' || r.worksLike === 'staff');
  const people = members.filter((m) => m.role !== 'owner');

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
      await refresh();
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
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError && e.status < 500 ? e.message : t('errors.roleFailed'));
    }
  };

  return (
    <div className="card roles-card roles-team">
      <div className="card-head">{t('peopleTitle')}</div>
      <div className="card-body">
        {people.length === 0 ? (
          <p className="roles-empty">{t('peopleEmpty')}</p>
        ) : (
          <div className="login-rows">
            {people.map((m) => {
              const name = m.name ?? m.providerName ?? m.phone ?? t('unnamed');
              // Only roles of the same kind as this login — and the one they hold, so the select never shows a blank for it.
              const options = roles.filter((r) => r.worksLike === m.role || r.id === m.tenantRoleId);
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

        <WaitingGroup invites={invites} branchName={() => null} onRevoke={(id) => void revoke(id)} writable={writable} />

        <div className="roles-actions">
          <button type="button" className="btn" disabled={!writable} onClick={() => setInviting(true)}>
            {t('invite')}
          </button>
        </div>
      </div>
      {inviting && (
        <InviteSheet
          target={{ role: 'receptionist' }}
          roles={giveable}
          providers={providers.filter((p) => p.active)}
          branches={branches}
          onClose={() => setInviting(false)}
          onCreated={() => void refresh()}
        />
      )}
    </div>
  );
}
