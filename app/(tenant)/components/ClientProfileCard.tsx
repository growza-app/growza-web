'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { api, ApiError, formatMoney, type ClientProfile, type ClientProfileRow } from '../lib/api';
import { ConfirmDialog } from './ConfirmDialog';
import { useClientCardCopy } from '../lib/use-copy';
import { formatPhone } from '../lib/format';
import { IconClose, IconPhone } from './icons';
import { useDialog } from '../../shared/a11y/useDialog';
import { useMayUse } from './SessionProvider';

/**
 * One client's whole story, in a card that opens over the list.
 *
 * Opens from a row on the Clients page and from two places in Reports, and
 * is one component for all three: an owner who taps the same name in two
 * places must not get two different accounts of that person. The figures are
 * derived server-side (`/api/v1/reports/client/:id`) rather than stored, so
 * there is nothing here that can drift out of step with the bookings.
 *
 * It is read-only, deliberately. There is no "Message" button: every
 * proactive send has to go through the compliance funnel with opt-in and an
 * approved template, and a second path to the adapter is lint-forbidden
 * (05-messaging-compliance.md, ADR-11). Call is a `tel:` link, which is the
 * owner's own phone doing the work.
 */
export function ClientProfileCard({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [failed, setFailed] = useState(false);
  /*
   * Jira GRW-218 — the card stops being read-only for the ONE thing the front
   * desk needs to fix: a mistyped name or number.
   *
   * Still no "Message" button and no price editing. The rule the note above
   * states holds — every proactive send goes through the compliance funnel —
   * and this is not a send. It is the identity, which somebody at a counter
   * gets wrong daily and could not correct anywhere in the product until now.
   *
   * The receptionist may correct and may not delete (the owner's rule); the
   * delete below is drawn only for a role the API serves it to (GRW-477).
   *
   * Jira GRW-409 — this said "no role gate: a stylist cannot reach the Clients
   * screen and never sees this card". The card is also opened from Reports,
   * which a salon may open to a stylist (GRW-197), so "Edit" is asked of the
   * shared rule: drawn only for a role `PATCH /customers/:id` serves.
   */
  const mayEdit = useMayUse('client.edit');
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftPhone, setDraftPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /*
   * Jira GRW-477 — the owner's delete, which the API had and no screen offered, with its undo. The grace period
   * is the server's (`graceDays` in the answer); the undo is here while the card is open, as the moment somebody
   * notices a wrong tap is the moment right after it.
   */
  const mayDelete = useMayUse('client.delete');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletedFor, setDeletedFor] = useState<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const c = useClientCardCopy();
  const router = useRouter();

  useEffect(() => {
    let live = true;
    setProfile(null);
    setFailed(false);
    // A card reopened on a different client must not inherit the last one's
    // half-typed correction.
    setEditing(false);
    setSaveError(null);
    setDeletedFor(null);
    setConfirmDelete(false);
    api
      .clientProfile(clientId)
      .then((p) => live && setProfile(p))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [clientId]);

  // Escape closes, Tab stays inside, and focus goes back to the row it came from (Jira GRW-342). It lands on the
  // panel itself, which announces its name, rather than on the first field of an edit form.
  useDialog(panel, { onClose, initialFocus: 'container' });

  /** Resolve a row to the words an owner reads. Money and dates go through the shared formatters. */
  function render(row: ClientProfileRow): string {
    if (row.value === null || row.value === '') {
      return row.label === 'lastVisit' ? c.neverIn : row.label === 'interval' || row.label === 'nextVisit' ? c.notEnough : '—';
    }
    if (row.kind === 'money') return formatMoney(String(row.value));
    if (row.kind === 'percent') return `${row.value}%`;
    if (row.kind === 'days') {
      const n = Number(row.value);
      if (row.label === 'lastVisit') return c.daysAgo(n);
      // "Due back" is the one row that reads as a direction rather than a
      // duration: the number is how far past their own rhythm they are.
      if (row.label === 'nextVisit') return n > 0 ? c.overdue(n) : n === 0 ? c.dueNow : c.dueIn(-n);
      return c.days(n);
    }
    if (row.label === 'since') {
      // Month and year is the useful grain here — the exact day a client
      // first booked two years ago is noise.
      const d = new Date(String(row.value));
      return Number.isNaN(d.getTime())
        ? String(row.value)
        : d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    }
    return String(row.value);
  }

  const tone = (row: ClientProfileRow) =>
    row.tone === 'bad' ? 'var(--rp-red)' : row.tone === 'warn' ? 'var(--rp-amber)' : undefined;

  const startEditing = () => {
    setDraftName(profile?.name ?? '');
    /*
     * The stored value is E.164; the field shows the ten digits a person types
     * and the server's `toStoredPhone` puts it back. Showing "+919876543210"
     * and asking somebody to edit it invites them to break the country code —
     * the same reason `PhoneField` exists for every other number in the app.
     */
    setDraftPhone((profile?.phone ?? '').replace(/^\+91/, ''));
    setSaveError(null);
    setEditing(true);
  };

  const remove = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const done = await api.deleteCustomer(clientId);
      setConfirmDelete(false);
      setDeletedFor(done.graceDays);
      router.refresh();
    } catch (err) {
      // Refused for a reason the owner can act on (a booking still coming up, GRW-472) — said where they are looking.
      setDeleteError(err instanceof ApiError ? err.message : c.actionFailed);
    } finally {
      setDeleting(false);
    }
  };

  const undo = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.restoreCustomer(clientId);
      setDeletedFor(null);
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : c.actionFailed);
    } finally {
      setDeleting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      /*
       * Jira GRW-477 — the number goes only when it was changed. A person who cannot see it (or saw it masked)
       * and fixed a spelling sent back what the field held, and that blank or masked value replaced the client's
       * real number.
       */
      const phoneAsShown = (profile?.phone ?? '').replace(/^\+91/, '');
      const phoneChanged = draftPhone.trim() !== phoneAsShown.trim();
      const updated = await api.updateCustomer(clientId, {
        name: draftName.trim() || null,
        ...(phoneChanged ? { phone: draftPhone.trim() || null } : {}),
      });
      /*
       * Patched in place rather than refetched. The figures below — spend,
       * visits, the insight rows — cannot be changed by renaming somebody, so a
       * refetch would redraw the whole card to move two lines. `router.refresh`
       * updates the list underneath, which DOES show the name.
       */
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              /*
               * The server's own fallback, mirrored: `reports.customers.ts`
               * renders a nameless client as their phone number
               * (`r.name?.trim() || r.waPhone`). Applying the same rule here
               * keeps the card showing what a reload would show, instead of
               * going briefly blank until somebody refreshes.
               */
              name: updated.name?.trim() || updated.waPhone || '',
              phone: updated.waPhone ?? '',
            }
          : prev,
      );
      setEditing(false);
      router.refresh();
    } catch (err) {
      /*
       * The server's own message, verbatim. It knows things this component
       * cannot — whose number that is, or that the holder is mid-erasure — and
       * a generic "could not save" would throw away the only part of the answer
       * the receptionist can act on.
       */
      setSaveError(err instanceof Error && err.message ? err.message : c.saveFailed);
    } finally {
      setSaving(false);
    }
  };


  return (
    <>
      <button type="button" className="cpc-scrim" aria-label={c.close} onClick={onClose} />
      <div className="cpc" role="dialog" aria-modal="true" tabIndex={-1} ref={panel}>
        <header className="cpc-head">
          <div className="cpc-head-top">
            <span className="cpc-kicker">{c.kicker}</span>
            <button type="button" className="cpc-close" onClick={onClose} aria-label={c.close}>
              <IconClose />
            </button>
          </div>

          {failed ? (
            <p className="cpc-failed">{c.loadFailed}</p>
          ) : (
            <>
              <div className="cpc-identity">
                <span className="cpc-avatar">{profile?.initial ?? '·'}</span>
                {editing ? (
                  <div className="cpc-edit">
                    <input
                      className="cpc-edit-name"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder={c.namePlaceholder}
                      disabled={saving}
                      aria-label={c.namePlaceholder}
                      autoFocus
                    />
                    <div className="cpc-edit-phone-row">
                      <span className="cpc-edit-cc">+91</span>
                      <input
                        className="cpc-edit-phone"
                        value={draftPhone}
                        onChange={(e) => setDraftPhone(e.target.value)}
                        placeholder={c.phonePlaceholder}
                        inputMode="numeric"
                        disabled={saving}
                        aria-label={c.phonePlaceholder}
                      />
                    </div>
                    {saveError && <p className="cpc-edit-error">{saveError}</p>}
                    <div className="cpc-edit-actions">
                      <button type="button" className="cpc-edit-save" onClick={save} disabled={saving}>
                        {saving ? c.saving : c.save}
                      </button>
                      <button type="button" className="cpc-edit-cancel" onClick={() => setEditing(false)} disabled={saving}>
                        {c.cancel}
                      </button>
                    </div>
                    {mayDelete && (
                      <button
                        type="button"
                        className="cpc-edit-delete"
                        onClick={() => {
                          setDeleteError(null);
                          setConfirmDelete(true);
                        }}
                        disabled={saving}
                      >
                        {c.delete}
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{ minWidth: 0 }}>
                    <div className="cpc-name">{profile?.name ?? ' '}</div>
                    <div className="cpc-phone">{profile ? formatPhone(profile.phone) : ' '}</div>
                  </div>
                )}
                {profile && !editing && mayEdit && (
                  <button type="button" className="cpc-edit-open" onClick={startEditing}>
                    {c.edit}
                  </button>
                )}
              </div>
              {deletedFor !== null && (
                <div className="cpc-deleted" role="status">
                  <span>{c.deleted(deletedFor)}</span>
                  <button type="button" onClick={undo} disabled={deleting}>
                    {deleting ? c.undoing : c.undo}
                  </button>
                  {deleteError && <p className="cpc-edit-error">{deleteError}</p>}
                </div>
              )}
              <div className="cpc-summary">
                <div>
                  <span>{c.totalSpent}</span>
                  <strong>{profile ? formatMoney(String(profile.lifetimeSpendMinor)) : '—'}</strong>
                </div>
                <div>
                  <span>{c.totalVisits}</span>
                  <strong>{profile ? profile.visits : '—'}</strong>
                </div>
              </div>
            </>
          )}
        </header>

        <div className="cpc-body">
          {profile && (
            <>
              <h3 className="cpc-section">{c.insight}</h3>
              {profile.rows.map((row) => (
                <div className="cpc-row" key={row.label}>
                  <span>{c.rows[row.label as keyof typeof c.rows] ?? row.label}</span>
                  <strong style={{ color: tone(row) }}>{render(row)}</strong>
                </div>
              ))}

              {profile.recent.length > 0 && (
                <>
                  <h3 className="cpc-section">{c.recent}</h3>
                  {profile.recent.map((visit) => (
                    <div className="cpc-row" key={visit.whenISO}>
                      <span>
                        {visit.service}
                        <em>{new Date(visit.whenISO).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</em>
                      </span>
                      <strong>{formatMoney(String(visit.amountMinor))}</strong>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>

        <footer className="cpc-foot">
          {/* Disabled with a reason rather than a tel: link to nothing. */}
          <a
            className={`cpc-btn ${profile?.phone ? '' : 'cpc-btn-off'}`}
            href={profile?.phone ? `tel:${profile.phone}` : undefined}
            title={profile?.phone ? undefined : c.noPhone}
          >
            <span className="cpc-btn-icon"><IconPhone /></span>
            {c.call}
          </a>
          {/* By id, not by name in the search box. The search-by-name link
              landed on the Bookings screen's default day — today — so a client
              whose last visit was in July showed nothing at all. */}
          <a
            className={`cpc-btn cpc-btn-primary ${profile ? '' : 'cpc-btn-off'}`}
            href={profile ? `/appointments?customerId=${profile.id}` : undefined}
          >
            {c.viewBookings}
          </a>
        </footer>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title={c.deleteTitle}
          body={c.deleteBody(7)}
          confirmLabel={deleting ? c.deleting : c.deleteConfirm}
          tone="danger"
          busy={deleting}
          error={deleteError}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
