'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { autoFocusField } from '../../shared/a11y/soft-keyboard';
import { useDialog } from '../../shared/a11y/useDialog';
import { putName } from '../lib/lang';
import { useSession } from './SessionProvider';

/**
 * First sign-in — "What should we call you?"
 *
 * Asked once per sign-in session while the person has no name (an owner enrolled without one, a receptionist
 * invited without one). Skipping is fine: "Add your name" stays in the account menu. A degraded session with no
 * member (role null) is never asked — there is no row to write the answer to.
 */
const SEEN = 'growza.namePromptSeen';

export function NamePrompt() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const askable = !!session && session.role !== null && !session.name;

  useEffect(() => {
    if (!askable) return;
    try {
      if (window.sessionStorage.getItem(SEEN)) return;
    } catch {
      // Storage blocked: ask once per page load rather than never.
    }
    setOpen(true);
  }, [askable]);

  if (!open) return null;
  return (
    <NameDialog
      onClose={() => {
        try {
          window.sessionStorage.setItem(SEEN, '1');
        } catch {
          /* the prompt may come back on the next page load; harmless */
        }
        setOpen(false);
      }}
    />
  );
}

function NameDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations('chrome.account');
  const router = useRouter();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, { onClose: busy ? undefined : onClose });

  const save = async () => {
    const name = value.trim();
    if (!name || busy) return;
    setBusy(true);
    setFailed(false);
    const ok = await putName(name);
    setBusy(false);
    if (!ok) return setFailed(true);
    onClose();
    router.refresh();
  };

  return (
    <>
      <div className="acct-scrim" onClick={busy ? undefined : onClose} aria-hidden="true" />
      <div ref={dialogRef} className="acct-menu name-prompt" role="dialog" aria-modal="true" aria-label={t('namePromptTitle')} tabIndex={-1}>
        <div className="acct-head">
          <div className="acct-role">{t('namePromptTitle')}</div>
          <div className="acct-sub name-prompt-sub">{t('namePromptSub')}</div>
        </div>
        <div className="acct-form acct-name-form">
          <label htmlFor="name-prompt-input">{t('yourName')}</label>
          <input
            id="name-prompt-input"
            type="text"
            autoComplete="name"
            maxLength={60}
            value={value}
            disabled={busy}
            autoFocus={autoFocusField()}
            onChange={(e) => {
              setValue(e.target.value);
              setFailed(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
            }}
          />
          {failed && <div role="alert" className="field-error">{t('nameFailed')}</div>}
          <div className="acct-form-actions">
            <button type="button" className="btn" disabled={busy || value.trim().length === 0} onClick={() => void save()}>
              {busy ? t('saving') : t('saveName')}
            </button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={onClose}>
              {t('notNow')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
