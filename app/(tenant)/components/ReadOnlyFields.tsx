'use client';

import type { ReactNode } from 'react';
import { useWritable } from './SessionProvider';

/**
 * Jira GRW-556 (follow-up) — a form that shows its values and cannot be changed, while the business is suspended.
 *
 * A business suspended for non-payment reads every screen; on a settings form that means the values stay on show and
 * every field, switch and button inside goes inert. `disabled` on a `<fieldset>` does exactly that for everything
 * nested in it — inputs, selects, textareas and buttons, including the custom editors built from them — which is why
 * this is the form-screen answer and `useWritable()` per control is the list-screen one. On Settings the save bars inside
 * it are hidden while it is disabled (`.ro-fields:disabled`, 85-settings-fit.css): a disabled Save on a form nobody can
 * edit is noise.
 *
 * Writable (the default, and every business that is not suspended) renders a plain wrapper that changes nothing: the
 * reset in `00-base.css` strips the fieldset's own border and padding.
 */
export function ReadOnlyFields({ children, exempt = false }: { children: ReactNode; /** Stays editable whatever the business may do — Billing. */ exempt?: boolean }) {
  const writable = useWritable();
  return (
    <fieldset className="ro-fields" disabled={!writable && !exempt}>
      {children}
    </fieldset>
  );
}
