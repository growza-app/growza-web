'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Jira GRW-342 — what every modal dialog owes a keyboard and a screen reader, in one place.
 *
 * A `role="dialog" aria-modal="true"` only TELLS assistive technology the page behind is inert. It does nothing
 * itself. Before this, only the account menu and the navigation drawer kept their promise: every other sheet left
 * focus on the button that opened it, let Tab walk out into the page behind, and most ignored Escape.
 *
 * While `active`:
 *  1. focus moves into the dialog (its first control, or the dialog itself when it has none),
 *  2. Tab and Shift+Tab wrap inside it,
 *  3. Escape closes it — only the TOPMOST dialog, so Escape over a confirmation closes the confirmation, not the
 *     sheet under it,
 *  4. on close, focus goes back to whatever opened it, if that is still on the page.
 *
 * `trapTab: false` is for a small popover (a menu beside its button) rather than a modal: focus still moves in,
 * Escape still closes and returns focus, but Tab may leave — and a popover that lets you tab away should close.
 *
 * `initialFocus: 'container'` is for a dialog whose first control is a destructive action or a long form: focus
 * lands on the dialog (announcing its name) rather than on a button someone might press by reflex.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open dialogs, oldest first. Only the last one answers the keyboard. */
const open: symbol[] = [];

function isShown(el: HTMLElement): boolean {
  return el.offsetParent !== null || el === document.activeElement;
}

export function useDialog(
  ref: RefObject<HTMLElement | null>,
  { onClose, active = true, initialFocus = 'first', trapTab = true }: { onClose?: () => void; active?: boolean; initialFocus?: 'first' | 'container'; trapTab?: boolean } = {},
): void {
  // Read at press time, so a parent re-rendering with a fresh `onClose` does not re-run the effect (which would
  // yank focus back to the first control on every keystroke).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // What had focus when this dialog first rendered — i.e. the button that opened it. A dialog whose own field
  // auto-focuses has already stolen focus by the time the effect below runs, so it cannot be read there.
  const openedFrom = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null,
  );

  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;

    const id = Symbol('dialog');
    open.push(id);
    const now = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const first = openedFrom.current;
    // A popover that is always mounted reads focus right now (the trigger still has it); a dialog that mounts when
    // opened reads it from its first render.
    const opener = now && !root.contains(now) ? now : first && !root.contains(first) ? first : null;
    let skipRestore = false;
    const controls = () => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isShown);

    if (!root.contains(document.activeElement)) {
      const first = initialFocus === 'first' ? controls()[0] : undefined;
      const target = first ?? root;
      if (target === root && !root.hasAttribute('tabindex')) root.tabIndex = -1;
      target.focus({ preventScroll: true });
    }

    const onKey = (e: KeyboardEvent) => {
      if (open[open.length - 1] !== id) return;
      if (e.key === 'Escape') {
        if (closeRef.current) {
          e.preventDefault();
          closeRef.current();
        }
        return;
      }
      if (e.key !== 'Tab') return;
      if (!trapTab) {
        // A popover, not a modal: tabbing past its last control leaves it, and it should close behind you.
        const at = document.activeElement;
        if (!(at instanceof Node) || !root.contains(at)) return;
        const list = controls();
        const edge = e.shiftKey ? list[0] : list[list.length - 1];
        if (at === edge || at === root) {
          skipRestore = true; // they are going forward, not back to the button
          window.setTimeout(() => closeRef.current?.(), 0);
        }
        return;
      }
      const nodes = controls();
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) {
        e.preventDefault();
        root.focus();
        return;
      }
      const at = document.activeElement;
      const inside = at instanceof Node && root.contains(at);
      if (e.shiftKey && (at === first || at === root || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (at === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      const at = open.indexOf(id);
      if (at >= 0) open.splice(at, 1);
      if (!skipRestore && opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [active, ref, initialFocus, trapTab]);
}
