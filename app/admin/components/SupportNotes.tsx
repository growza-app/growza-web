'use client';

import { useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { oklch } from '../tokens';
import { Card, PrimaryButton, SectionTitle } from './primitives';

export const NOTE_MAX = 1000;

interface Note {
  id: string;
  body: string;
  author: string;
  createdAt: string;
}

/**
 * Jira GRW-703 — short notes support keeps on a business, so the next admin knows the history before calling.
 * Never shown to the business. Kept as written: no edit, no delete. Newest first.
 */
export function SupportNotes({ businessId, canWrite }: { businessId: string; canWrite: boolean }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

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
              <div style={{ fontSize: '0.875rem', color: oklch.textStrong, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{n.body}</div>
              <div style={{ fontSize: '0.75rem', color: oklch.textFaint, marginTop: 4 }}>
                {n.author} · {formatDateTime(n.createdAt)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
