'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { oklch } from '../tokens';
import { FieldLabel, PrimaryButton, SecondaryButton, TextInput } from '../components/primitives';
import { useDialog } from '../../shared/a11y/useDialog';
import { useAdminMe } from '../components/AdminMeContext';

/**
 * GRW-135 — creating and editing a platform role.
 *
 * Every permission offered comes from the server's `catalogue`, which is the
 * `ADMIN_PERMISSIONS` registry with its labels (FR-01). Nothing here hardcodes
 * a list: a permission added to the registry appears without a frontend change,
 * and one removed stops being offered rather than lingering as a checkbox that
 * grants nothing.
 */
export interface PermissionOption {
  key: string;
  label: string;
}

export interface RoleRow {
  id: string;
  name: string;
  permissions: string[];
  isBuiltin: boolean;
  holders: number;
}

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * The registry's keys are `admin.<area>.<verb>`, so the area is the natural
 * grouping — twenty-odd loose checkboxes is a form nobody reads, and reading it
 * is the whole point of choosing what someone may do.
 */
function groupByArea(catalogue: PermissionOption[]): Array<[string, PermissionOption[]]> {
  const groups = new Map<string, PermissionOption[]>();
  for (const option of catalogue) {
    const area = option.key.split('.')[1] ?? 'other';
    const label = area.replace(/_/g, ' ');
    const existing = groups.get(label);
    if (existing) existing.push(option);
    else groups.set(label, [option]);
  }
  return [...groups.entries()];
}

export function RoleEditor({
  open,
  role,
  catalogue,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null creates; a row edits it. */
  role: RoleRow | null;
  catalogue: PermissionOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { can } = useAdminMe();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, { onClose: saving ? undefined : onClose });
  const [error, setError] = useState<string | null>(null);
  const ids = useId();
  const openedFor = useRef<string | null>(null);

  /**
   * Seed once per opening, on the transition into open — the same guard
   * RecordPaymentModal needed, and for the same reason: an effect that re-runs
   * while the modal is open wipes half-typed input under the admin's cursor.
   */
  useEffect(() => {
    if (!open) {
      openedFor.current = null;
      return;
    }
    const key = role?.id ?? 'new';
    if (openedFor.current === key) return;
    openedFor.current = key;
    setName(role?.name ?? '');
    setSelected(new Set(role?.permissions ?? []));
    setReason('');
    setError(null);
  }, [open, role]);

  if (!open) return null;

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const blocker =
    name.trim() === ''
      ? 'Give the role a name.'
      : reason.trim() === ''
        ? 'Enter a reason — it is recorded against your name.'
        : null;

  function save() {
    setSaving(true);
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const body = JSON.stringify({ name: name.trim(), permissions: [...selected], reason: reason.trim() });

    const request = role
      ? adminFetch<unknown>(`/roles/${role.id}`, { method: 'PATCH', signal: controller.signal, body })
      : adminFetch<unknown>('/roles', { method: 'POST', signal: controller.signal, body });

    request
      .then(() => {
        onSaved();
        onClose();
      })
      .catch((err) =>
        setError(
          err instanceof AdminApiError
            ? err.message
            : controller.signal.aborted
              ? 'That took too long to answer. Check the list before trying again.'
              : 'Could not save this role.',
        ),
      )
      .finally(() => {
        clearTimeout(timer);
        setSaving(false);
      });
  }

  return (
    <div
      className="admin-dialog-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'oklch(0.2 0.02 155 / 0.5)',
      }}
      onClick={saving ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        ref={dialogRef}
        aria-labelledby={`${ids}-title`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(620px, 100%)',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'white',
          borderRadius: 18,
          boxShadow: '0 24px 60px oklch(0.2 0.04 155 / 0.35)',
          animation: 'admin-fade 0.2s ease',
        }}
      >
        <div style={{ padding: '22px 24px 0' }}>
          <h3 id={`${ids}-title`} style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em', color: oklch.textStrong }}>
            {role ? `Edit ${role.name}` : 'New role'}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: oklch.textMuted }}>
            {role
              ? `${role.holders} ${role.holders === 1 ? 'administrator holds' : 'administrators hold'} this role. Changes apply on their next request.`
              : 'Choose what an administrator on this role may do.'}
          </p>
        </div>

        <div style={{ padding: '18px 24px 24px', display: 'grid', gap: 16 }}>
          <div>
            {/* Jira GRW-288 (AC-05) — was a <div>: the role's name field had no name. */}
            <FieldLabel htmlFor={`${ids}-name`}>Name</FieldLabel>
            <TextInput id={`${ids}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Support" disabled={saving} />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: oklch.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Permissions · {selected.size} selected
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              {groupByArea(catalogue).map(([area, options]) => (
                <div key={area}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: oklch.textStrong, marginBottom: 5, textTransform: 'capitalize' }}>{area}</div>
                  <div style={{ display: 'grid', gap: 5 }}>
                    {options.map((option) => (
                      <label key={option.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: oklch.textStrong }}>
                        <input
                          type="checkbox"
                          checked={selected.has(option.key)}
                          onChange={() => toggle(option.key)}
                          // Batch D — the server refuses a role carrying a permission you do not hold
                          // (`beyond_your_permissions`), so it is not offered. Already-ticked ones stay ticked.
                          disabled={saving || !can(option.key)}
                          style={{ marginTop: 2 }}
                        />
                        <span style={can(option.key) ? undefined : { color: oklch.textFaint }}>
                          {option.label}
                          {can(option.key) ? null : <span style={{ fontSize: 11.5 }}> — you do not hold this</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <FieldLabel htmlFor={`${ids}-reason`}>Reason</FieldLabel>
            <TextInput id={`${ids}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this role exists, or why it is changing" disabled={saving} />
          </div>

          {error ? <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(0.5 0.18 25)' }}>{error}</div> : null}
          {blocker ? <div style={{ fontSize: 12.5, color: oklch.textMuted, fontWeight: 600 }}>{blocker}</div> : null}

          <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
            <SecondaryButton onClick={onClose} disabled={saving}>
              Close
            </SecondaryButton>
            <PrimaryButton onClick={save} disabled={blocker !== null || saving}>
              {saving ? 'Saving…' : role ? 'Save role' : 'Create role'}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
