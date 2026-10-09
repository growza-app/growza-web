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
 * Deliberately a plain function, not a hook: it is read during render, where `autoFocus` is read, and the server
 * answers "not touch", which is what it already emitted (React drops `autoFocus` from server HTML and applies it
 * on mount, so the client's answer is the one that counts).
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
