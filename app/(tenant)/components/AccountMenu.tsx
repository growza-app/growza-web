'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { homeCopy } from '../lib/home-copy';
import { rememberLang, type Lang } from '../lib/lang';
import { useLabels } from './LabelsProvider';
import { useSession } from './SessionProvider';
import { SignOutButton } from './SignOutButton';
import { IconClose, IconLogout } from './icons';

/**
 * Jira GRW-63 · GRW-202 — the avatar in the header, which did nothing.
 *
 * It was a `<div>` with a letter in it on every screen in the product: it looks
 * exactly like the account button every other web app puts there, and it had no
 * handler. A control that looks pressable and is not teaches people that the
 * product is broken in ways they then stop reporting.
 *
 * It answers the two questions somebody clicks an avatar for: who am I signed
 * in as, and how do I change my password.
 *
 * ## Jira GRW-306 — everything about *you*, in one place
 *
 * Role, the number you sign in with, language, Change password and Sign out.
 * Language is here rather than in the Home header because it is a setting
 * changed once, and it is now reachable from every screen instead of only Home.
 * On a phone it opens as a bottom sheet; from 861px it is the small card it was.
 *
 * It is a real modal now: focus moves in, Tab stays inside, Escape closes and
 * focus goes back to the avatar.
 */

const ROLE_LABEL: Record<string, { name: string; sub: string }> = {
  owner: { name: 'Owner', sub: 'Full access to everything' },
  manager: { name: 'Manager', sub: 'Full access to everything' },
  receptionist: { name: 'Receptionist', sub: 'Bookings, clients, payments and attendance' },
  staff: { name: 'Stylist', sub: 'Your own day, and your own attendance' },
};

export function AccountMenu() {
  /**
   * GRW-203 — from the layout's own `/me`, not a fetch of its own.
   *
   * The first version took an `initial` prop and looked the rest up when
   * opened. Two things were wrong. `initial` was optional on `PageHeader` and
   * ELEVEN OF FOURTEEN screens never passed it, so the account button did not
   * exist on most of the product — which is exactly how it was reported:
   * "clicking the name icon does nothing", on a page with no icon to click.
   * And re-fetching `/me` duplicated a request the layout had already made.
   */
  const session = useSession();
  const labels = useLabels();
  const router = useRouter();
  const dialogId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Focus follows what the dialog is showing. It used to move only when the menu opened, so
  // pressing "Change password" (which unmounts the focused button), Cancel, a finished save, or
  // a save disabling the inputs all dropped it onto <body> — outside the Tab trap, behind an
  // aria-modal dialog. The form's first field when there is a form; the dialog otherwise.
  useEffect(() => {
    if (!open || busy) return;
    if (changing && !done) document.getElementById('acct-current')?.focus();
    else dialogRef.current?.focus();
  }, [open, changing, done, busy]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
    setChanging(false);
    setCurrent('');
    setNext('');
    setError(null);
    setDone(false);
  };

  const label = ROLE_LABEL[session?.role ?? 'owner'] ?? ROLE_LABEL.owner!;

  const lang: Lang = session?.lang ?? 'en';
  const t = homeCopy(lang, labels);

  const chooseLang = (next: Lang) => {
    if (next === lang) return;
    rememberLang(next);
    router.refresh();
  };

  const keepFocusInside = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])') ?? []).filter((n) => n.offsetParent !== null);
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.changePassword({ currentPassword: current, newPassword: next });
      setDone(true);
      setCurrent('');
      setNext('');
    } catch (err) {
      // The API's own sentence, which distinguishes a wrong current password
      // from one the pool refused — two different things for the person to do.
      setError(err instanceof Error ? err.message : 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="acct">
      <button
        ref={triggerRef}
        type="button"
        className="avatar-lg acct-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label="Menu and account"
        onClick={() => (open ? close() : setOpen(true))}
      >
        {session?.initial ?? 'S'}
      </button>

      {open && (
        <>
          <div className="acct-scrim" onClick={close} aria-hidden="true" />
          <div ref={dialogRef} id={dialogId} className="acct-menu" role="dialog" aria-modal="true" aria-label="Menu and account" tabIndex={-1} onKeyDown={keepFocusInside}>
            <div className="acct-head">
              <button type="button" className="acct-close acct-phone-only" aria-label="Close account menu" onClick={close}>
                <IconClose />
              </button>
              <div className="acct-role">{label.name}</div>
              <div className="acct-sub">{label.sub}</div>
              {/* The number, because it is what they sign in with (GRW-198) —
                  not an email, which this product never uses as a credential. */}
              {session?.phone && <div className="acct-phone">{session.phone}</div>}
              {session?.businessName && <div className="acct-biz">{session.businessName}</div>}
            </div>

            {!changing ? (
              <div className="acct-actions">
                <div className="acct-lang" role="group" aria-label={t.langToggleLabel}>
                  <button type="button" lang="en" aria-pressed={lang === 'en'} onClick={() => chooseLang('en')}>
                    English
                  </button>
                  <button type="button" lang="hi" aria-pressed={lang === 'hi'} onClick={() => chooseLang('hi')}>
                    हिन्दी
                  </button>
                </div>
                <button type="button" className="acct-item" onClick={() => setChanging(true)}>
                  Change password
                </button>
                <SignOutButton className="acct-item acct-signout">
                  <IconLogout />
                  {t.nav.signOut}
                </SignOutButton>
              </div>
            ) : (
              <div className="acct-form">
                {done ? (
                  <p className="acct-done">Password changed. Use the new one next time you sign in.</p>
                ) : (
                  <>
                    <label htmlFor="acct-current">Current password</label>
                    <input
                      id="acct-current"
                      type="password"
                      autoComplete="current-password"
                      value={current}
                      disabled={busy}
                      onChange={(e) => {
                        setCurrent(e.target.value);
                        setError(null);
                      }}
                    />
                    <label htmlFor="acct-new">New password</label>
                    <input
                      id="acct-new"
                      type="password"
                      autoComplete="new-password"
                      value={next}
                      disabled={busy}
                      onChange={(e) => {
                        setNext(e.target.value);
                        setError(null);
                      }}
                    />
                    <p className="acct-hint">At least 8 characters.</p>
                    {error && <div className="field-error">{error}</div>}
                    <div className="acct-form-actions">
                      <button
                        type="button"
                        className="btn"
                        disabled={busy || current.length === 0 || next.length < 8}
                        onClick={() => void submit()}
                      >
                        {busy ? 'Saving…' : 'Change password'}
                      </button>
                      <button type="button" className="btn-ghost" disabled={busy} onClick={() => setChanging(false)}>
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
