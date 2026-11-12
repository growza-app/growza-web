'use client';

import { useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { oklch } from '../tokens';
import { ConfirmDialog } from './ConfirmDialog';
import { Card, PrimaryButton, SectionTitle } from './primitives';

export const NOTE_MAX = 1000;

interface Note {
  id: string;
  /** null once removed. */
  body: string | null;
  author: string;
  createdAt: string;
  removed?: { by: string; at: string; reason: string };
}

/**
 * Jira GRW-703 — short notes support keeps on a business, so the next admin knows the history before calling.
 * Never shown to the business. Newest first, never edited.
 *
 * QA loophole L3, 11 Nov 2026 — a note can be removed, for the one that should never have been written (an owner's
 * phone, a client's health detail). Its words go; the line stays, saying who removed it, when and why.
 */
export function SupportNotes({ businessId, canWrite }: { businessId: string; canWrite: boolean }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [removing, setRemoving] = useState<Note | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch<{ notes: Note[] }>(`/businesses/${businessId}/notes`)
      .then((r) => !cancelled && setNotes(r.notes))
      .catch((err) => !cancelled && setLoadError(err instanceof AdminApiError && err.status === 404 ? null : 'Could not load notes.'));
    return () => {
      cancelled = true;
    };
  }, [businessId, reload]);

  // An API older than growza#516 has no notes route: leave the card out rather than show an error forever.
  if (notes === null && loadError === null) return null;

  const tooLong = draft.trim().length > NOTE_MAX;
  const save = () => {
    if (!draft.trim() || tooLong) return;
    setSaving(true);
    setSaveError(null);
    adminFetch(`/businesses/${businessId}/notes`, { method: 'POST', body: JSON.stringify({ body: draft }) })
      .then(() => {
        setDraft('');
        setReload((n) => n + 1);
      })
      .catch((err) => setSaveError(err instanceof AdminApiError ? err.message : 'Could not save the note.'))
      .finally(() => setSaving(false));
  };

  const remove = (reason: string) => {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    adminFetch(`/businesses/${businessId}/notes/${removing.id}`, { method: 'DELETE', body: JSON.stringify({ reason }) })
      .then(() => {
        setRemoving(null);
        setReload((n) => n + 1);
      })
      .catch((err) => setRemoveError(err instanceof AdminApiError ? err.message : 'Could not remove the note.'))
      .finally(() => setRemoveBusy(false));
  };

  return (
    <Card>
      <SectionTitle title="Support notes" />
      {canWrite ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="What was the call about, and what did you do?"
            aria-label="New support note"
            aria-describedby="support-note-hint"
            style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 10, border: `1px solid ${tooLong ? oklch.danger : oklch.borderStrong}`, fontSize: '1rem', fontFamily: 'inherit', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span id="support-note-hint" style={{ fontSize: '0.75rem', color: tooLong ? oklch.danger : oklch.textFaint, flex: 1, minWidth: '12rem' }}>
              {tooLong ? 'Keep notes under 1,000 characters.' : `Only admins see this. Never write a customer's details here. ${draft.trim().length}/${NOTE_MAX}`}
            </span>
            <PrimaryButton onClick={save} disabled={saving || !draft.trim() || tooLong} style={{ minHeight: 44 }}>
              {saving ? 'Saving…' : 'Add note'}
            </PrimaryButton>
          </div>
          {saveError ? (
            <div role="alert" style={{ fontSize: '0.8125rem', color: oklch.danger }}>
              {saveError}
            </div>
          ) : null}
        </div>
      ) : null}
      {loadError ? (
        <div style={{ fontSize: '0.8125rem', color: oklch.textFaint }}>{loadError}</div>
      ) : notes && notes.length === 0 ? (
        <div style={{ fontSize: '0.8125rem', color: oklch.textFaint }}>No notes yet.</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {notes?.map((n, i) => (
            <li key={n.id} style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : `1px solid ${oklch.divider}` }}>
              {n.removed ? (
                <div style={{ fontSize: '0.8125rem', color: oklch.textMuted, fontStyle: 'italic', overflowWrap: 'anywhere' }}>
                  Removed by {n.removed.by} · {formatDateTime(n.removed.at)} — {n.removed.reason}
                </div>
              ) : (
                <div style={{ fontSize: '0.875rem', color: oklch.textStrong, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{n.body}</div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: '0.75rem', color: oklch.textFaint, flex: 1, minWidth: 0 }}>
                  {n.author} · {formatDateTime(n.createdAt)}
                </span>
                {canWrite && !n.removed ? (
                  <button
                    type="button"
                    className="admin-note-remove"
                    onClick={() => {
                      setRemoveError(null);
                      setRemoving(n);
                    }}
                    aria-label={`Remove note by ${n.author}`}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={removing !== null}
        title="Remove this note?"
        description="Its words are deleted for good. Every admin will still see that a note was here, who removed it, when and why."
        confirmLabel="Remove note"
        danger
        reasonRequired
        reasonPlaceholder="Why? For example: had the owner's phone number in it."
        loading={removeBusy}
        error={removeError}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  );
}
