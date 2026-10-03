'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { formatDateOnly } from '../lib/format';
import { Card, EmptyState, PrimaryButton, SecondaryButton, SectionTitle, StatusPill, Table, TableRow, TextInput } from '../components/primitives';
import { ADMIN_USER_COLUMNS } from '../lib/list-columns';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { oklch } from '../tokens';
import { AddAdminModal, type RoleOption } from './AddAdminModal';

/**
 * GRW-133 — who can administer Growza, as a page rather than a query.
 *
 * This screen rendered `PLATFORM_USERS` from `data.ts` behind a preview banner:
 * four invented people with invented roles and a "last active" column nothing
 * recorded. "Who has access?" is a question a security review asks and a
 * departing colleague creates, and answering it with fiction is worse than not
 * answering it.
 *
 * Every refusal GRW-132 defines is shown here as a sentence and, where it is
 * knowable up front, as an absent control rather than one that is offered and
 * then refused (FR-02, FR-03).
 */
interface AdminRow {
  id: string;
  name: string;
  phone: string | null;
  status: 'active' | 'deactivated';
  roleId: string | null;
  roleName: string | null;
  roleIsBuiltin: boolean;
  createdAt: string;
}

interface UsersResponse {
  rows: AdminRow[];
  roles: RoleOption[];
  selfId: string;
}

// Jira GRW-288 — the columns live in lib/list-columns.ts, where a test holds
// their minimums to the widths this table has to fit.
const COLUMNS = ADMIN_USER_COLUMNS;

export default function AdminUsersPage() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [changing, setChanging] = useState<{ user: AdminRow; status: 'active' | 'deactivated' } | null>(null);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  /** GRW-165 — the admin's own control: put somebody back to a one-time password. */
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState<string | null>(null);
  /*
   * Jira GRW-475 — the password reset and the role change were `window.prompt`: the new password showed in plain
   * text with no second box to catch a typo, and an empty reason could be sent. Both are dialogs now, the password
   * masked and typed twice, the reason required like every other write here.
   */
  const [resetting, setResetting] = useState<AdminRow | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordAgain, setNewPasswordAgain] = useState('');
  const [roleChange, setRoleChange] = useState<{ user: AdminRow; roleId: string } | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) =>
      adminFetch<UsersResponse>('/users', { signal })
        .then((body) => {
          setData(body);
          setError(null);
        })
        .catch((err) => {
          if (signal?.aborted) return;
          setError(err instanceof AdminApiError ? err.message : 'Could not load administrators.');
        }),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function changeStatus(reason: string) {
    if (!changing) return;
    setBusy(true);
    setChangeError(null);
    adminFetch(`/users/${changing.user.id}/status`, { method: 'PATCH', body: JSON.stringify({ reason, status: changing.status }) })
      .then(() => {
        setChanging(null);
        void load();
      })
      // FR-02 — the server's sentence, which already says "this is the last
      // active Super Admin" rather than a code.
      .catch((err) => setChangeError(err instanceof AdminApiError ? err.message : 'Could not change this administrator.'))
      .finally(() => setBusy(false));
  }

  function changeRole(user: AdminRow, roleId: string) {
    setRoleError(null);
    setRoleChange({ user, roleId });
  }

  function confirmRoleChange(reason: string) {
    if (!roleChange) return;
    const { user, roleId } = roleChange;
    setBusy(true);
    adminFetch(`/users/${user.id}/role`, { method: 'PATCH', body: JSON.stringify({ roleId, reason: reason.trim() }) })
      .then(() => {
        setRoleChange(null);
        void load();
      })
      .catch((err) => setRoleError(err instanceof AdminApiError ? err.message : 'Could not change that role.'))
      .finally(() => setBusy(false));
  }

  /**
   * GRW-165 — the admin keeps control without ever knowing a working password.
   *
   * A reset produces a NEW one-time password, which this admin hands over and
   * which dies the first time it is used. Two prompts rather than a modal
   * because it is a rare, deliberate act; the reason is recorded against the
   * admin's name like every other write on this screen.
   */
  function resetPassword(user: AdminRow) {
    setResetError(null);
    setResetDone(null);
    setNewPassword('');
    setNewPasswordAgain('');
    setResetting(user);
  }

  function confirmReset(reason: string) {
    if (!resetting) return;
    if (newPassword.length < 8) {
      setResetError('Use at least 8 characters.');
      return;
    }
    if (newPassword !== newPasswordAgain) {
      setResetError('The two passwords are not the same.');
      return;
    }
    const user = resetting;
    setBusy(true);
    setResetError(null);
    adminFetch(`/users/${user.id}/password-reset`, {
      method: 'POST',
      body: JSON.stringify({ password: newPassword, reason: reason.trim() }),
    })
      .then(() => {
        setResetting(null);
        setResetDone(`${user.name} now has a one-time password. They must change it when they next sign in.`);
      })
      .catch((err) => setResetError(err instanceof AdminApiError ? err.message : 'Could not reset that password.'))
      .finally(() => setBusy(false));
  }

  if (error) return <EmptyState icon="users" title="Could not load administrators" sub={error} />;
  if (!data) return <div style={{ fontSize: 13.5, color: oklch.textMuted }}>Loading…</div>;

  const visible = data.rows.filter((u) => showDeactivated || u.status === 'active');
  const activeSupers = data.rows.filter((u) => u.roleIsBuiltin && u.status === 'active').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <SectionTitle title="Platform administrators" />
          <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: oklch.textMuted }}>
              <input type="checkbox" checked={showDeactivated} onChange={(e) => setShowDeactivated(e.target.checked)} />
              Show deactivated
            </label>
            <PrimaryButton onClick={() => setAddOpen(true)}>Add administrator</PrimaryButton>
          </div>
        </div>

        {roleError ? <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(0.5 0.18 25)', paddingTop: 8 }}>{roleError}</div> : null}
        {resetError ? <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(0.5 0.18 25)', paddingTop: 8 }}>{resetError}</div> : null}
        {resetDone ? <div style={{ fontSize: 13, fontWeight: 700, color: oklch.textStrong, paddingTop: 8 }}>{resetDone}</div> : null}

        {visible.length === 0 ? (
          <EmptyState icon="users" title="Nobody to show" sub={showDeactivated ? 'No administrators yet.' : 'No active administrators.'} />
        ) : (
          <Table
            columns={COLUMNS}
            rows={visible.map((user) => {
              const isSelf = user.id === data.selfId;
              // AC-03 — the last active Super Admin is protected VISIBLY, so
              // the control is absent rather than offered and then refused.
              const isLastSuper = user.roleIsBuiltin && user.status === 'active' && activeSupers === 1;
              const locked = isSelf ? 'This is you — ask another administrator.' : isLastSuper ? 'The last Super Admin.' : null;

              return (
                <TableRow key={user.id} columns={COLUMNS}>
                  <div style={{ minWidth: 0 }}>
                    <div className="admin-name" style={{ fontSize: 14, fontWeight: 700, color: oklch.textStrong }}>
                      {user.name}
                    </div>
                    <div style={{ fontSize: 12.5, color: oklch.textMuted, overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.phone ?? '—'}</div>
                  </div>

                  <div>
                    {locked ? (
                      <span style={{ fontSize: 13, fontWeight: 700, color: oklch.textStrong }}>{user.roleName ?? 'No role'}</span>
                    ) : (
                      <select
                        aria-label={`Role for ${user.name}`}
                        value={user.roleId ?? ''}
                        onChange={(e) => changeRole(user, e.target.value)}
                        style={{ padding: '6px 9px', borderRadius: 9, border: `1px solid ${oklch.border}`, fontSize: 12.5, fontWeight: 600, maxWidth: 170 }}
                      >
                        {user.roleId === null ? <option value="">No role</option> : null}
                        {data.roles.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {/* A role is what they may do; no role is a real state and
                        must not read as an empty cell. */}
                    {user.roleId === null ? (
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'oklch(0.52 0.13 65)', marginTop: 3 }}>No permissions</div>
                    ) : null}
                  </div>

                  <div style={{ fontSize: 13, color: oklch.textMuted, fontWeight: 600 }}>{formatDateOnly(user.createdAt)}</div>

                  <div>
                    <StatusPill status={user.status === 'active' ? 'Active' : 'Deactivated'} />
                  </div>

                  <div style={{ textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {/*
                      GRW-165 — offered on ACTIVE administrators only, including
                      yourself: resetting your own password is a legitimate
                      thing to do, unlike deactivating yourself, so the `locked`
                      guard above does not apply to it.
                    */}
                    {user.status === 'active' ? (
                      <SecondaryButton onClick={() => resetPassword(user)}>Reset password</SecondaryButton>
                    ) : null}
                    {locked ? (
                      <span style={{ fontSize: 11.5, color: oklch.textFaint, fontWeight: 600, alignSelf: 'center' }}>{locked}</span>
                    ) : user.status === 'active' ? (
                      <SecondaryButton danger onClick={() => setChanging({ user, status: 'deactivated' })}>
                        Deactivate
                      </SecondaryButton>
                    ) : (
                      <SecondaryButton onClick={() => setChanging({ user, status: 'active' })}>Reactivate</SecondaryButton>
                    )}
                  </div>
                </TableRow>
              );
            })}
          />
        )}
      </Card>

      <AddAdminModal open={addOpen} roles={data.roles} onClose={() => setAddOpen(false)} onAdded={() => void load()} />

      <ConfirmDialog
        open={resetting !== null}
        title={`New one-time password for ${resetting?.name ?? 'this administrator'}`}
        description="Tell it to them. They must replace it the next time they sign in."
        confirmLabel="Set password"
        reasonRequired
        reasonPlaceholder="Why are you resetting it? This is recorded against your name."
        loading={busy}
        error={resetError}
        onConfirm={confirmReset}
        onCancel={() => {
          setResetting(null);
          setResetError(null);
        }}
      >
        <TextInput
          type="password"
          autoComplete="new-password"
          aria-label="New password"
          placeholder="New password (8 characters or more)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <div style={{ height: 8 }} />
        <TextInput
          type="password"
          autoComplete="new-password"
          aria-label="New password again"
          placeholder="The same password again"
          value={newPasswordAgain}
          onChange={(e) => setNewPasswordAgain(e.target.value)}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={roleChange !== null}
        title={`Change ${roleChange?.user.name ?? 'this administrator'}'s role?`}
        description="What they can see and do changes the next time they load a page."
        confirmLabel="Change role"
        reasonRequired
        reasonPlaceholder="Why is their role changing?"
        loading={busy}
        error={roleError}
        onConfirm={confirmRoleChange}
        onCancel={() => {
          setRoleChange(null);
          setRoleError(null);
        }}
      />

      <ConfirmDialog
        open={changing !== null}
        danger={changing?.status === 'deactivated'}
        title={
          changing?.status === 'deactivated'
            ? `Deactivate ${changing?.user.name ?? 'this administrator'}?`
            : `Reactivate ${changing?.user.name ?? 'this administrator'}?`
        }
        description={
          changing?.status === 'deactivated'
            ? 'They stop being able to sign in immediately. Nothing is deleted — their name stays on everything they did, which is why administrators are deactivated rather than removed.'
            : 'They can sign in again, with the role they hold.'
        }
        confirmLabel={changing?.status === 'deactivated' ? 'Deactivate' : 'Reactivate'}
        reasonRequired
        reasonPlaceholder="Why is this changing?"
        loading={busy}
        error={changeError}
        onConfirm={changeStatus}
        onCancel={() => {
          setChanging(null);
          setChangeError(null);
        }}
      />
    </div>
  );
}
