'use client';

import { useState } from 'react';

/**
 * Jira GRW-90 · GRW-137 — the banner §7 asks for.
 *
 * "an unmissable banner for the entire session — IMPERSONATING GLOW SALON —
 * OWNER — with a working exit". The failure mode it exists to prevent is an
 * admin forgetting whose account is on screen, so it is above everything
 * including the billing banner, and it has no dismiss (BR-02): a support
 * session that can be hidden is a silent one.
 */
export function ImpersonationBanner({ businessName, role }: { businessName: string; role: string }) {
  const [leaving, setLeaving] = useState(false);

  async function exit() {
    if (leaving) return;
    setLeaving(true);
    try {
      await fetch('/api/v1/auth/end-impersonation', { method: 'POST' });
    } catch {
      // Leave anyway, and land in the admin portal. The request failing does
      // not mean the session survived, and the worst outcome is an admin
      // stranded inside somebody's salon because a network blip ate the exit.
      // The session expires on its own regardless (GRW-136).
    }
    // A full page load: this crosses back into the admin portal's own root
    // layout, and every cached render made as the owner has to go.
    window.location.assign('/admin');
  }

  return (
    <div className="impersonation-banner" role="alert">
      <span className="impersonation-banner-dot" aria-hidden />
      <span className="impersonation-banner-text">
        {/* "read-only" earns its place: the dashboard still shows New booking,
            Add walk-in and the rest, and they will all be refused. Hiding every
            write control across the whole product is a much larger change than
            this story; saying so up front is the honest version of it. */}
        Viewing <strong>{businessName}</strong> as {role} — read-only support session
      </span>
      <button type="button" className="impersonation-banner-exit" onClick={exit} disabled={leaving}>
        {leaving ? 'Leaving…' : 'Exit'}
      </button>
    </div>
  );
}
