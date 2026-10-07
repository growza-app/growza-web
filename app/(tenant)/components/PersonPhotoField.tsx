'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { PersonPhoto } from './PersonPhoto';

/**
 * Jira GRW-559 — the control that puts a face on a person.
 *
 * Deliberately the same shape and the same `sheet-photo-*` classes as the
 * service photo control in ServiceForm, down to the hidden file input and the
 * "Change photo / why" pair of lines. A second visual language for the same
 * act — pick a picture, replace it, take it off — is the thing the UI rules in
 * CLAUDE.md exist to stop, and it would be the owner's problem, not ours: they
 * meet both controls on the same afternoon.
 *
 * **No size check here.** `uploadFile` downscales in the browser before
 * anything leaves, so a 4 MB camera-roll photo arrives at around 120 KB and
 * the API's 5 MB cap is the only one that can fire. A pre-check would refuse
 * photos that would have been fine — which is the bug GRW-558's QA removed
 * from two screens; it does not get reintroduced here.
 *
 * `onUpload`/`onRemove` are the caller's, because the two uses write different
 * rows: a stylist's provider row, or the signed-in person's own.
 */
export function PersonPhotoField({
  name,
  photoUrl,
  onUpload,
  onRemove,
  disabled = false,
}: {
  name: string;
  photoUrl: string | null;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
  /** The viewer may not set this person's photo — owner/manager rules live with the caller. */
  disabled?: boolean;
}) {
  const t = useTranslations('personPhoto');
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * One handler for both verbs so the busy flag and the error can never be set
   * by one and cleared by the other. Failing leaves the old photo on screen:
   * the row did not change, so neither should what the owner is looking at.
   */
  async function run(act: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await act();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failed'));
    } finally {
      setBusy(false);
      // Without this, picking the SAME file again fires no change event.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="sheet-photo">
      <PersonPhoto name={name} photoUrl={photoUrl} className="sheet-photo-img" />
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void run(() => onUpload(file));
        }}
      />
      <button
        type="button"
        className="sheet-photo-text"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        <span className="sheet-photo-action">{photoUrl ? t('change') : t('add')}</span>
        <span className="sheet-photo-why">{error ?? (busy ? t('saving') : t('hint'))}</span>
      </button>
      {photoUrl && (
        <button type="button" className="sheet-photo-remove" disabled={disabled || busy} onClick={() => void run(onRemove)}>
          {t('remove')}
        </button>
      )}
    </div>
  );
}
