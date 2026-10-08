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
