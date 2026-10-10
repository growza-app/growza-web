/**
 * Jira GRW-563 — where this phone is, from the browser's own Geolocation. No provider, no key.
 *
 * Never throws and never blocks for long: permission denied, no GPS, a plain-http page (Geolocation needs
 * HTTPS or localhost) and a fix that takes longer than `timeoutMs` all answer `null`, which the API reads as
 * "the phone could not say" — the row is still saved, and waits for the owner. The worst outcome of asking is
 * "pending", never "refused" (BR-01).
 */
export interface GeoFix {
  lat: number;
  lng: number;
  /** Metres, the phone's own confidence. */
  accuracyM: number | null;
}

export function getFix(timeoutMs = 10_000): Promise<GeoFix | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const finish = (fix: GeoFix | null) => {
      if (done) return;
      done = true;
      resolve(fix);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          const { latitude, longitude, accuracy } = pos.coords;
          finish(Number.isFinite(latitude) && Number.isFinite(longitude) ? { lat: latitude, lng: longitude, accuracyM: Number.isFinite(accuracy) ? Math.round(accuracy) : null } : null);
        },
        () => {
          clearTimeout(timer);
          finish(null);
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
      );
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}

/**
 * A pin from a pasted maps share link, or "lat, lng" typed by hand. The API parses the same shapes
 * (`coordinatesFromMapsLink`); this copy lets the form say "no place in that" before a round trip.
 */
export function pinFromText(text: string): { lat: number; lng: number } | null {
  const patterns = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|ll|query)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
  }
  return null;
}

/**
 * A share link that carries no place, only an id the maps provider resolves on its own servers.
 *
 * This is what the Share button on a phone hands you — `maps.app.goo.gl/AbC123`, `goo.gl/maps/…`,
 * `maps.apple.com/p/…` — so the hint on Settings › Phone check-in ("Share the branch from Google Maps …
 * and paste the link here") named the one thing `pinFromText` cannot read, and the owner got "Could not
 * find a place in that link." for following it. Nothing on this side can turn one into a pin: it takes a
 * request to Google or Apple to follow the redirect. Until something makes that request, the screen
 * recognises the link for what it is and says what to do instead of leaving the owner to guess which
 * half of the instruction was wrong.
 */
export function isShortMapsLink(text: string): boolean {
  return /maps\.app\.goo\.gl|goo\.gl\/maps|maps\.apple\.com\/p\//i.test(text);
}

/** Somewhere the owner can look at the pin and recognise their own street. Numbers alone cannot be checked. */
export function mapsHref(pin: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${pin.lat},${pin.lng}`;
}

/** "about 2 shops away" is for the owner; the register wants metres. */
export function metresLabel(m: number | null | undefined): string | null {
  if (m == null) return null;
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
