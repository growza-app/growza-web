'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { Icon } from '../icons';
import { Card, EmptyState, PrimaryButton, SecondaryButton, SectionTitle } from '../components/primitives';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { oklch } from '../tokens';
import { RoleEditor, type PermissionOption, type RoleRow } from './RoleEditor';
import { useAdminMe } from '../components/AdminMeContext';

/**
 * GRW-135 — the platform roles screen.
 *
 * This page used to render `PLATFORM_ROLES` from `data.ts` behind a preview
 * banner: three invented roles and a permission matrix nothing enforced (all of
 * it now deleted from `data.ts`, so it cannot be picked up again). That
 * is the same shape GRW-126 had to replace on the Usage screen — a screen that
 * answers a question confidently and wrongly is worse than no screen, and "who
 * can do what on this platform" is a question a support call and a security
 * review both ask.
 *
 * Every role here is a `platform_role` row, every permission comes from the
 * server's own registry, and the built-in Super Admin is shown as what it is:
 * the role that guarantees somebody can always administer this platform, and
 * therefore the one nobody can edit away.
 */
interface RolesResponse {
  rows: RoleRow[];
  catalogue: PermissionOption[];
}

export default function AdminRolesPage() {
  const [data, setData] = useState<RolesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [deleting, setDeleting] = useState<RoleRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  /**
   * Batch D — what this admin may do here, said up front instead of discovered as a 403/409 after typing a reason.
   * The same three rules the roles routes apply (roles.controller.ts): `admin.role.manage` to change anything; never
   * the role you hold (`own_role`); never a role carrying a permission you do not (`beyond_your_permissions`).
   */
  const { me, can, holdsAll } = useAdminMe();
  const canManage = can('admin.role.manage');
  const lockedReason = (role: RoleRow): string | null =>
    me && role.name === me.admin.roleName
      ? 'This is your own role — ask another administrator to change it.'
      : !holdsAll(role.permissions)
        ? 'Has permissions you do not hold — only someone who holds them can change it.'
        : null;

  const load = useCallback(
    (signal?: AbortSignal) =>
      adminFetch<RolesResponse>('/roles', { signal })
        .then((body) => {
          setData(body);
          setError(null);
        })
        .catch((err) => {
          if (signal?.aborted) return;
          setError(err instanceof AdminApiError ? err.message : 'Could not load roles.');
        }),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function remove(reason: string) {
    if (!deleting) return;
    setRemoving(true);
    setDeleteError(null);
    adminFetch(`/roles/${deleting.id}`, { method: 'DELETE', body: JSON.stringify({ reason }) })
      .then(() => {
        setDeleting(null);
        void load();
      })
      // The server's sentence, not a code: "2 administrators hold this role"
      // is what an admin needs, and it already says it.
      .catch((err) => setDeleteError(err instanceof AdminApiError ? err.message : 'Could not delete this role.'))
      .finally(() => setRemoving(false));
  }

  if (error) {
    return <EmptyState icon="roles" title="Could not load roles" sub={error} />;
  }

  const labelFor = (key: string) => data?.catalogue.find((c) => c.key === key)?.label ?? key;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <SectionTitle title="Platform roles" />
          {canManage ? (
            <PrimaryButton
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
            >
              New role
            </PrimaryButton>
          ) : (
            <div style={{ fontSize: 12.5, color: oklch.textFaint, fontWeight: 600 }}>View only — changing roles needs Manage roles.</div>
          )}
        </div>

        {!data ? (
          <div style={{ fontSize: 13.5, color: oklch.textMuted, paddingTop: 8 }}>Loading…</div>
        ) : data.rows.length === 0 ? (
          <EmptyState icon="roles" title="No roles yet" sub="Create one to give an administrator less than full access." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
            {data.rows.map((role) => (
              <div key={role.id} style={{ borderTop: `1px solid ${oklch.divider}`, paddingTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  {/* Jira GRW-288 — `minWidth: 0` and `admin-name`: an 80-character
                      role name with no spaces (the most the API allows) had a
                      minimum width of the whole word, and pushed the page 305px
                      sideways at 390px. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                    <span
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 9,
                        background: 'oklch(0.95 0.02 150)',
                        color: 'oklch(0.42 0.09 152)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: 'none',
                      }}
                    >
                      <Icon name="roles" size={15} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="admin-name" style={{ fontSize: 13.5, fontWeight: 700, color: oklch.textStrong }}>
                        {role.name}
                      </div>
                      <div style={{ fontSize: 12, color: oklch.textFaint }}>
                        {role.holders} {role.holders === 1 ? 'administrator' : 'administrators'} ·{' '}
                        {role.isBuiltin ? 'every permission' : `${role.permissions.length} permissions`}
                      </div>
                    </div>
                  </div>

                  {/* AC-04 — the built-in role's controls are absent, with the
                      reason stated. Shown-and-disabled would invite a click and
                      then refuse it; this says why there is nothing to click. */}
                  {role.isBuiltin ? (
                    <div style={{ fontSize: 12, color: oklch.textFaint, fontWeight: 600, maxWidth: 320 }}>
                      Cannot be changed — it is what guarantees somebody can always administer this platform.
                    </div>
                  ) : !canManage ? null : lockedReason(role) ? (
                    <div style={{ fontSize: 12, color: oklch.textFaint, fontWeight: 600, maxWidth: 320 }}>{lockedReason(role)}</div>
                  ) : (
                    <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
                      <SecondaryButton
                        onClick={() => {
                          setEditing(role);
                          setEditorOpen(true);
                        }}
                      >
                        Edit
                      </SecondaryButton>
                      {/* The server refuses to delete a role somebody still holds (`role_in_use`) — said here instead. */}
                      {role.holders > 0 ? (
                        <span style={{ fontSize: 11.5, color: oklch.textFaint, fontWeight: 600 }}>
                          In use — move its {role.holders === 1 ? 'administrator' : 'administrators'} first to delete it.
                        </span>
                      ) : (
                        <SecondaryButton
                          danger
                          onClick={() => {
                            setDeleteError(null);
                            setDeleting(role);
                          }}
                        >
                          Delete
                        </SecondaryButton>
                      )}
                    </div>
                  )}
                </div>

                {!role.isBuiltin && role.permissions.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 9, paddingLeft: 43 }}>
                    {role.permissions.map((key) => (
                      <span
                        key={key}
                        style={{
                          fontSize: 11.5,
                          fontWeight: 700,
                          color: 'oklch(0.44 0.06 220)',
                          background: 'oklch(0.96 0.02 220)',
                          padding: '3px 9px',
                          borderRadius: 6,
                        }}
                      >
                        {labelFor(key)}
                      </span>
                    ))}
                  </div>
                ) : null}

                {!role.isBuiltin && role.permissions.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'oklch(0.52 0.13 65)', fontWeight: 600, marginTop: 9, paddingLeft: 43 }}>
                    No permissions — an administrator on this role can sign in and do nothing.
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <RoleEditor
        open={editorOpen}
        role={editing}
        catalogue={data?.catalogue ?? []}
        onClose={() => setEditorOpen(false)}
        onSaved={() => void load()}
      />

      <ConfirmDialog
        open={deleting !== null}
        danger
        title={`Delete ${deleting?.name ?? 'this role'}?`}
        description="The role is removed. Administrators who hold it must be moved to another role first — this is refused if any still do."
        confirmLabel="Delete role"
        reasonRequired
        reasonPlaceholder="Why is this role no longer needed?"
        loading={removing}
        error={deleteError}
        onConfirm={remove}
        onCancel={() => {
          setDeleting(null);
          setDeleteError(null);
        }}
      />
    </div>
  );
}
