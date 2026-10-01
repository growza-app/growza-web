'use client';

/**
 * Jira GRW-416 — Save where the thumb is.
 *
 * GRW-229's scope said "long forms still scroll on a phone, with Save pinned" and only the scrolling half
 * was built. Measured on Booking settings at 402×874: the page scrolls 542px and Save's bottom edge sits
 * 381px below the fold, so an owner changes a value and the button that keeps it is off-screen in a
 * direction they have no reason to look.
 *
 * One component rather than a class each screen copies (BR-01). Booking settings and Report access had
 * byte-identical save rows — the same inline `marginTop: 16, display: flex, gap: 12` — which is how the
 * two of them drifted from Business profile's pinned bar in the first place.
 *
 * On a laptop this renders exactly the row those two screens already had, so AC-04's "no pinned bar on
 * desktop" costs nothing to honour: the pinning lives entirely in a `max-width: 860px` block in
 * 85-settings-fit.css.
 *
 * Deliberately NOT tracking dirty state. Business profile's bar disables Save until something changes,
 * these two forms never have, and teaching them would change what the button does rather than where it
 * is. The ticket's Validations line about a disabled Save describes Business profile's behaviour, not a
 * new requirement for these — noted on GRW-416 rather than quietly implemented.
 */
export function SettingsSaveBar({
  busy,
  saved,
  onSave,
  saveLabel,
  savingLabel,
  savedLabel,
}: {
  busy: boolean;
  saved: boolean;
  onSave: () => void;
  saveLabel: string;
  savingLabel: string;
  savedLabel: string;
}) {
  return (
    <div className="settings-savebar">
      <button className="btn settings-savebar-btn" disabled={busy} onClick={onSave}>
        {busy ? savingLabel : saveLabel}
      </button>
      {saved && !busy && <span className="settings-savebar-note">{savedLabel}</span>}
    </div>
  );
}
