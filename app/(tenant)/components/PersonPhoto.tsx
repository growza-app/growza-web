import { avatarTone, initials } from '../providers/StaffRoster';

/**
 * Jira GRW-559 — the face of somebody who works here, or their initials.
 *
 * One component because there were already two `initials` implementations and
 * six places drawing the same tile by hand, and a photograph had to reach all
 * of them. A second copy of "img when there is one, letters when there is not"
 * is how half the screens end up never showing the photo that was uploaded.
 *
 * **The initials are not a fallback, they are the other half of the feature.**
 * Most staff will never have a photo — nobody is going to photograph eight
 * stylists on day one — so the lettered tile is the normal state and has to
 * look deliberate rather than broken. That is why the tone is kept: a wall of
 * initials stays scannable because each person's colour is stable.
 *
 * The caller passes the same class it used before, so every existing size and
 * shape (44px roster row, 48px edit header, 28px booking card) keeps working
 * with no new CSS per site; `person-photo` only adds the object-fit the <img>
 * needs to fill a box the tile already sized.
 *
 * **Two sites deliberately do NOT use this, and should not be "fixed" to.**
 * Both were weighed when the picker and the register gained photos (GRW-559):
 *
 *   - `AttendanceRegister` tints its tile with a per-name `oklch` hue computed
 *     inline, not with the four tone CLASSES this returns. Routing it through
 *     here would recolour a screen the desk reads every morning, to no one's
 *     benefit, so it keeps its own tile and only gained a branch for the photo.
 *   - The stylist chip in `NewVisitSheet` has to wrap the name and its "free
 *     now" line in a box of their own, because the chip is `flex-direction:
 *     column` and a bare <img> sibling would sit ABOVE the name. This renders
 *     one element; it has nowhere to put that wrapper.
 *
 * So this is the chokepoint for a tile that wants the FOUR TONES and holds
 * nothing but the face or the letters. Anything else is a third case, and the
 * honest thing is to add it to this list rather than to pretend the list of
 * users is complete.
 */
export function PersonPhoto({
  name,
  photoUrl,
  className = 'staff-avatar',
  muted = false,
}: {
  name: string;
  photoUrl?: string | null;
  /** The tile class this site already used — sizing and shape stay with the screen. */
  className?: string;
  /** Off today, inactive: the screen's existing greyed treatment. */
  muted?: boolean;
}) {
  const classes = [
    className,
    muted ? 'is-muted' : '',
    // `person-tile` is what the four tone colours hang off when the caller's own class is not
    // `.staff-avatar` — the photo field reuses the service sheet's 60px box instead.
    photoUrl ? 'person-photo' : `person-tile ${avatarTone(name)}`,
  ]
    .filter(Boolean)
    .join(' ');

  /*
   * `alt=""` on purpose. The person's name is always rendered next to this —
   * every caller is a row or a header that names them — so alt text would make
   * a screen reader say it twice. The image is decoration of a label that is
   * already there.
   */
  if (photoUrl) return <img className={classes} src={photoUrl} alt="" />;
  return <div className={classes}>{initials(name)}</div>;
}
