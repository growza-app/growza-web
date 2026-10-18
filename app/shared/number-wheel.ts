/**
 * Owner, 2026-10-19 — "price and cost price field amount is scrollable, any scroll can change the amount".
 *
 * A focused `<input type="number">` takes the mouse wheel (and a trackpad swipe) as "step the value": scroll a
 * long form with the cursor over the Price field and ₹1,250 becomes ₹1,247 without anyone typing. It is the
 * browser's behaviour for every number field, so it is fixed once, here, for all of them — the product sheet, the
 * package price, the checkout amount, the admin plan forms — rather than field by field.
 *
 * The fix is to let go of the field when the wheel turns over it: the page scrolls as the person meant, and the
 * value is never touched. Only a FOCUSED field is affected, so nothing changes for a person who is typing in it,
 * and the keyboard's own ↑/↓ still steps the value (GRW-491 kept that on purpose).
 */
export function isFocusedNumberField(el: unknown): el is HTMLInputElement {
  return typeof el === 'object' && el !== null && (el as HTMLInputElement).tagName === 'INPUT' && (el as HTMLInputElement).type === 'number';
}

/** Registers the guard on a document; returns the function that removes it. Passive: it never blocks scrolling. */
export function guardNumberWheel(doc: Pick<Document, 'addEventListener' | 'removeEventListener' | 'activeElement'>): () => void {
  const onWheel = () => {
    const active = doc.activeElement;
    if (isFocusedNumberField(active)) active.blur();
  };
  doc.addEventListener('wheel', onWheel, { passive: true });
  return () => doc.removeEventListener('wheel', onWheel);
}
