'use client';

import { useEffect, useRef } from 'react';

/**
 * Whether focusing a text field would raise the on-screen keyboard — and what auto-focus should do about it.
 *
 * On a desktop, moving focus into the search box or the first field of a form is a kindness: the person can type
 * straight away and nothing moves. On a phone it costs them the page. The keyboard takes half the screen before
 * they have read the heading, and on a sheet it covers the very summary they opened it to check. Every screen with
 * a text field had this, because `autoFocus` reads the same on both.
 *
 * So auto-focus becomes a question rather than a flag. A coarse pointer (a finger, not a mouse) is the signal: it
 * is what the platform itself uses to decide a soft keyboard is the only keyboard there is. Focus still moves into
 * a dialog on touch — onto the dialog itself, which is what a screen reader needs — it just does not land in a
 * field and summon the keyboard.
 *
 * `autoFocusField()` is read during render, where `autoFocus` is read, and it is for a field that only ever mounts
 * on the client — a sheet, a dialog, a step that opens when something is tapped. A field that is part of a page's
 * own HTML must use `useAutoFocusField()` instead: React compares `autoFocus` when it hydrates, the server has no
 * pointer to ask about, and the two answers disagreeing is a hydration mismatch (and a dev overlay full of it).
 */
export function opensSoftKeyboard(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    // An old browser that cannot answer the question gets the desktop behaviour it had before.
    return false;
  }
}

/** `autoFocus={autoFocusField()}` — true where a keyboard is already attached, false where one would appear. */
export function autoFocusField(wanted = true): boolean {
  return wanted && !opensSoftKeyboard();
}

/**
 * The same answer for a field that is in a page's own HTML: a ref to put on the input, which takes focus once the
 * page is live, on a pointer that has a keyboard behind it. Nothing is rendered either side of hydration, so the
 * server and the browser cannot disagree.
 */
export function useAutoFocusField<T extends HTMLElement>(wanted = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (wanted && !opensSoftKeyboard()) ref.current?.focus({ preventScroll: true });
    // Only on the way in: re-focusing because a sibling's state changed would steal the caret mid-sentence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

/** Does focusing this element raise the keyboard? A button or a link does not; a field does. */
export function takesTyping(el: HTMLElement): boolean {
  if (el.isContentEditable) return true;
  // Read the tag rather than `instanceof`: it answers the same question and holds for an element from another
  // document, and it is what lets this be tested without a DOM.
  const tag = el.tagName?.toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag !== 'INPUT') return false;
  // The picker types: a date or a colour opens its own control, not a keyboard.
  return !PICKERS.includes((el as HTMLInputElement).type);
}

const PICKERS = ['button', 'checkbox', 'color', 'date', 'datetime-local', 'file', 'image', 'month', 'radio', 'range', 'reset', 'submit', 'time', 'week'];
