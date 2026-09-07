'use client';

import { useState } from 'react';
import { api, ApiError, type CreatedInvite, type PendingInvite } from '../../lib/api';
import { toE164, validateInvitePhone } from '../../lib/validate';

/**
 * Jira GRW-63 · GRW-67 — send an invite, see what is outstanding, take one back.
 *
 * The screen's one unusual job: **the link is shown once and never again.** No
 * route returns a token a second time, because only its hash is stored. So the
 * new link gets its own block that stays put until the owner dismisses it,
 * rather than a toast that can be missed by looking away.
 */
const LOAD_ERROR = 'Could not reach the server. Try again in a moment.';

function expiryLabel(iso: string): string {
  const days = Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000);
  if (days <= 0) return 'Expires today';
  return `Expires in ${days} day${days === 1 ? '' : 's'}`;
}

export function TeamAccessPanel({ initial }: { initial: PendingInvite[] }) {
  const [invites, setInvites] = useState<PendingInvite[]>(initial);
  const [phone, setPhone] = useState('');
  /** Field-level, shown under the input. Distinct from `error`, which is the server's answer. */
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<(CreatedInvite & { phone: string }) | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = async () => {
    const { invites: next } = await api.teamInvites();
    setInvites(next);
  };

  const send = async () => {
    /**
     * Checked here, before the request, so a mistyped number is a message
     * under the field rather than a round trip that comes back a raw 400.
     * `toE164` completes a bare ten-digit number, which is what an owner
     * actually types — the API stores E.164 (BR-04) and will not do it for us.
     */
    const complaint = validateInvitePhone(phone);
    if (complaint) {
      setPhoneError(complaint);
      return;
    }
    const e164 = toE164(phone)!;

    setBusy(true);
    setError(null);
    setPhoneError(null);
    setCreated(null);
    setCopied(false);
    try {
      const invite = await api.createTeamInvite({ phone: e164 });
      // The normalised number, not what was typed — it is the one the invite
      // is actually for, and the one they will sign in with.
      setCreated({ ...invite, phone: e164 });
      setPhone('');
      await refresh();
    } catch (e) {
      // The server's own words when it has any — "That number is already on
      // this team" tells an owner what to do; a generic failure does not.
      setError(e instanceof ApiError ? e.message : LOAD_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setError(null);
    try {
      await api.revokeTeamInvite(id);
      if (created?.id === id) setCreated(null);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : LOAD_ERROR);
    }
  };

  const linkFor = (token: string) =>
    `${typeof window === 'undefined' ? '' : window.location.origin}/join/${token}`;

  return (
    <div className="card">
      <div className="card-head">Team access</div>
      <div className="card-body">
        <p className="field-hint" style={{ marginTop: 0, marginBottom: 14 }}>
          Invite someone to sign in to this business. They choose their own password.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Validate on blur and clear on change — the pattern the staff edit
              screen uses. Complaining on every keystroke marks a number invalid
              while it is still being typed. */}
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              aria-label="Mobile number"
              placeholder="+91 98765 43210"
              style={{ width: '100%' }}
              value={phone}
              disabled={busy}
              className={phoneError ? 'field-invalid' : undefined}
              aria-invalid={!!phoneError}
              onChange={(e) => {
                setPhone(e.target.value);
                if (phoneError) setPhoneError(null);
              }}
              onBlur={() => setPhoneError(phone.trim() ? validateInvitePhone(phone) : null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && phone.trim() && !busy) void send();
              }}
            />
            {phoneError && <div className="field-error">{phoneError}</div>}
          </div>
          <button className="btn" disabled={busy || !phone.trim()} onClick={() => void send()}>
            {busy ? 'Creating…' : 'Create invite'}
          </button>
        </div>
        {error && <div className="field-error">{error}</div>}

        {created && (
          <div className="banner banner-info" style={{ marginTop: 16 }}>
            <strong>{created.resent ? 'New link created' : 'Invite ready'}</strong>
            <div style={{ marginTop: 4 }}>
              {/* Said plainly, because it is the one thing that cannot be
                  undone by coming back to this screen later. */}
              Send this link to {created.phone}. It is shown only now — we do not keep a copy.
              {created.resent && ' Their previous link has stopped working.'}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input readOnly value={linkFor(created.token)} style={{ flex: '1 1 240px', minWidth: 0 }} onFocus={(e) => e.target.select()} />
              {/* The primary button, not a ghost one: copying the link is the
                  single thing this banner exists to make happen, and the link
                  is shown once. A quiet control here is a link not copied. */}
              <button
                type="button"
                className="btn"
                onClick={() => {
                  void navigator.clipboard?.writeText(linkFor(created.token));
                  setCopied(true);
                }}
              >
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 620, fontSize: 14.5, marginBottom: 8 }}>Waiting to join</div>
          {invites.length === 0 ? (
            <p className="field-hint" style={{ margin: 0 }}>
              No invites waiting. Anyone you invite shows here until they join.
            </p>
          ) : (
            invites.map((invite, i) => (
              <div
                key={invite.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 0',
                  borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 620, fontSize: 14.5 }}>{invite.phone}</div>
                  <div className="field-hint" style={{ margin: 0 }}>{expiryLabel(invite.expiresAt)}</div>
                </div>
                {/* `btn-ghost btn-danger`, the pattern the services table
                    already uses for a destructive row action — cancelling
                    kills the link the invitee is holding. Quiet rather than
                    prominent: it sits beside every pending row, and a filled
                    green button there reads as the thing to press. */}
                <button type="button" className="btn btn-ghost btn-danger" onClick={() => void revoke(invite.id)}>
                  Cancel
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
