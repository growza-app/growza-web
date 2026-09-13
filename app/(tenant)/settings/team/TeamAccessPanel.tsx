'use client';

import { useState } from 'react';
import { api, ApiError, type CreatedInvite, type PendingInvite, type Provider } from '../../lib/api';
/*
 * GRW-199 — the shared phone rule, replacing this panel's own.
 *
 * `toE164`/`validateInvitePhone` existed because an owner typing ten digits for
 * a stylist was doing the normal thing while the invite route demanded a
 * leading `+`. With the dial code rendered as chrome the two can no longer
 * disagree: what the field holds is ten digits, and what is sent is always
 * `+91` and those ten.
 */
import { PhoneField } from '../../components/PhoneField';
import { toStoredPhone, validateNationalPhone } from '../../lib/phone';

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

export function TeamAccessPanel({ initial, providers }: { initial: PendingInvite[]; providers: Provider[] }) {
  const [invites, setInvites] = useState<PendingInvite[]>(initial);
  const [phone, setPhone] = useState('');
  /**
   * GRW-169 — what this person will be able to do.
   *
   * `staff` stays the default because it is the smaller permission and it is
   * what every invite meant before this control existed. `owner` and `manager`
   * are not offered: manager is documented as headroom TREATED AS OWNER, so
   * putting it in this list would be handing over the business behind a
   * gentler word.
   */
  const [role, setRole] = useState<'staff' | 'receptionist'>('staff');
  /**
   * Jira GRW-63 · GRW-171 — WHICH stylist this login belongs to.
   *
   * QA found the gap this closes: the form sent only a phone and a role, so
   * every stylist invite created a member with a null `provider_id`. That
   * resolves to `NO_PROVIDER` — a scope that matches nothing, correctly — and
   * the person signed in to an **empty diary**. The permission worked, the
   * account worked, and the product had nothing to show them.
   *
   * Required for `staff` (BR-01 below) and meaningless for a receptionist, who
   * runs everybody's day; the API drops it for them either way.
   */
  const [providerId, setProviderId] = useState('');
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
     * The API stores E.164 (BR-04) and will not complete a bare number for us;
     * `toStoredPhone` below is what always prepends the dial code.
     */
    const complaint = validateNationalPhone(phone);
    if (complaint) {
      setPhoneError(complaint);
      return;
    }
    /**
     * BR-01 — a stylist invite MUST name a stylist. Refusing here rather than
     * defaulting to the first on the roster: guessing whose calendar somebody
     * gets is worse than asking, and the wrong guess is invisible until they
     * sign in to somebody else's day.
     */
    if (role === 'staff' && !providerId) {
      setError('Choose which stylist this login is for.');
      return;
    }
    const e164 = toStoredPhone(phone)!;

    setBusy(true);
    setError(null);
    setPhoneError(null);
    setCreated(null);
    setCopied(false);
    try {
      const invite = await api.createTeamInvite({ phone: e164, role, providerId: role === 'staff' ? providerId : null });
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

        <div className="team-invite-grid">
          {/* GRW-199 — the shared field: a greyed +91 and ten digits. It
              cannot hold an invalid character, so the old validate-on-blur
              dance is gone; what remains is the length check on submit. */}
          <div className="team-invite-phone">
            <PhoneField
              id="invite-phone"
              label="Mobile number"
              required
              value={phone}
              disabled={busy}
              error={phoneError}
              onChange={(v) => {
                setPhone(v);
                if (phoneError) setPhoneError(null);
              }}
            />
          </div>
          <div className="team-role-field">
            <label htmlFor="invite-role">Role</label>
            <select
              id="invite-role"
              value={role}
              disabled={busy}
              onChange={(e) => setRole(e.target.value as typeof role)}
            >
              <option value="staff">Stylist — their own bookings only</option>
              <option value="receptionist">Receptionist — bookings, clients, payments, attendance</option>
            </select>
          </div>
          {/* Only for a stylist. A receptionist runs the whole diary, so a
              "whose calendar?" question has no answer for them and the API
              drops the field anyway. */}
          {role === 'staff' && (
            <div className="team-role-field">
              <label htmlFor="invite-provider">Whose calendar</label>
              {providers.length === 0 ? (
                <p className="field-hint" style={{ margin: 0 }}>
                  No staff on the roster yet — add someone under Staff first, then invite them here.
                </p>
              ) : (
                <select
                  id="invite-provider"
                  value={providerId}
                  disabled={busy}
                  onChange={(e) => {
                    setProviderId(e.target.value);
                    setError(null);
                  }}
                >
                  <option value="">Choose a stylist…</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                      {p.title ? ` · ${p.title}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          <button
            className="btn team-invite-btn"
            disabled={busy || !phone.trim() || (role === 'staff' && !providerId)}
            onClick={() => void send()}
          >
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
