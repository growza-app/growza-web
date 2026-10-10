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
 * No "Saved" note. It had one, and it could never appear: GRW-556 made every one of these forms close on a
 * successful save (`useCloseAfterSave`), so the screen is already on its way to the Settings list — which
 * says "Saved" itself, with `SavedToast`. Five forms were each keeping a `saved` boolean and a `savedLabel`
 * string for a span that is unreachable; they are gone with it.
 *
 * Deliberately NOT tracking dirty state. Business profile's bar disables Save until something changes,
 * these two forms never have, and teaching them would change what the button does rather than where it
 * is. The ticket's Validations line about a disabled Save describes Business profile's behaviour, not a
 * new requirement for these — noted on GRW-416 rather than quietly implemented.
 */
export function SettingsSaveBar({
  busy,
  onSave,
  saveLabel,
  savingLabel,
  pinned = true,
}: {
  busy: boolean;
  onSave: () => void;
  saveLabel: string;
  savingLabel: string;
  /**
   * Whether this bar sticks to the bottom of a phone's screen (design review, 2026-10-07).
   *
   * True for a screen with ONE thing to save, which is nearly all of them. False where a screen holds two
   * forms that save apart — Working hours keeps the salon's hours and the attendance grace period — because
   * two bars stuck to the same edge would cover each other, and neither would say which half it kept.
   */
  pinned?: boolean;
}) {
  return (
    <div className={`settings-savebar ${pinned ? 'settings-savebar-pinned' : ''}`}>
      <button className="btn settings-savebar-btn" disabled={busy} onClick={onSave}>
        {busy ? savingLabel : saveLabel}
      </button>
    </div>
  );
}
