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

/** "about 2 shops away" is for the owner; the register wants metres. */
export function metresLabel(m: number | null | undefined): string | null {
  if (m == null) return null;
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
