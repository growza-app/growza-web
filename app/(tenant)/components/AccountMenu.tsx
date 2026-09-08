'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';

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
 */

const ROLE_LABEL: Record<string, { name: string; sub: string }> = {
  owner: { name: 'Owner', sub: 'Full access to everything' },
  manager: { name: 'Manager', sub: 'Full access to everything' },
  receptionist: { name: 'Receptionist', sub: 'Bookings, clients, payments and attendance' },
  staff: { name: 'Stylist', sub: 'Your own day, and your own attendance' },
};

export function AccountMenu({ initial }: { initial: string }) {
  const [open, setOpen] = useState(false);
  /**
   * Loaded when the menu is first opened, not on every page render.
   *
   * `PageHeader` appears on every screen and its callers already pass whatever
   * they needed; threading a role and a phone through all of them to fill a
   * panel most visits never open would be a request and a prop drilled
   * everywhere for a rare interaction. Null until it answers, and the panel
   * says so rather than showing a wrong role.
   */
  const [who, setWho] = useState<{ role: string | null; phone: string | null; businessName: string | null } | null>(null);
  const [whoFailed, setWhoFailed] = useState(false);
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open || who || whoFailed) return;
    let cancelled = false;
    api
      .me()
      .then((me) => {
        if (cancelled) return;
        setWho({
          role: me.member?.role ?? null,
          phone: me.member?.phone ?? null,
          businessName: me.tenant?.name ?? null,
        });
      })
      .catch(() => !cancelled && setWhoFailed(true));
    return () => {
      cancelled = true;
    };
  }, [open, who, whoFailed]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => {
    setOpen(false);
    setChanging(false);
    setCurrent('');
    setNext('');
    setError(null);
    setDone(false);
  };

  const label = ROLE_LABEL[who?.role ?? 'owner'] ?? ROLE_LABEL.owner!;

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
        type="button"
        className="avatar-lg acct-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Your account"
        onClick={() => (open ? close() : setOpen(true))}
      >
        {initial}
      </button>

      {open && (
        <>
          <div className="acct-scrim" onClick={close} aria-hidden="true" />
          <div className="acct-menu" role="dialog" aria-label="Your account">
            <div className="acct-head">
              {whoFailed ? (
                <>
                  <div className="acct-role">Signed in</div>
                  <div className="acct-sub">Could not load your details just now.</div>
                </>
              ) : !who ? (
                <>
                  <div className="acct-role">Signed in</div>
                  <div className="acct-sub">Loading…</div>
                </>
              ) : (
                <>
                  <div className="acct-role">{label.name}</div>
                  <div className="acct-sub">{label.sub}</div>
                </>
              )}
              {/* The number, because it is what they sign in with (GRW-198) —
                  not an email, which this product never uses as a credential. */}
              {who?.phone && <div className="acct-phone">{who.phone}</div>}
              {who?.businessName && <div className="acct-biz">{who.businessName}</div>}
            </div>

            {!changing ? (
              <div className="acct-actions">
                <button type="button" className="acct-item" onClick={() => setChanging(true)}>
                  Change password
                </button>
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
