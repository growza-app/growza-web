/**
 * Jira GRW-563 — where this phone is, from the browser's own Geolocation. No provider, no key.
 *
 * Never throws and never blocks for long: permission denied, no GPS, a plain-http page (Geolocation needs
 * HTTPS or localhost) and a fix that takes longer than `timeoutMs` all answer `null`, which the API reads as
 * "the phone could not say" — the row is still saved, and waits for the owner. The worst outcome of asking is
 * "pending", never "refused" (BR-01).
 *
 * **Why `watchPosition` and not `getCurrentPosition`.** Two stylists standing together were placed 800 m
 * apart, and one went to the owner for approval. `getCurrentPosition` resolves on the FIRST position the
 * browser produces, which on Android is the wifi/cell estimate ~200 ms in; the GPS fix lands 3-8 s later,
 * by which time the promise has settled and the better fix is discarded. `enableHighAccuracy` only asks
 * for GPS, it does not make that call wait for it. Worse, the network provider understates its own error —
 * it claimed well under 700 m while being 800 m out — so the slack in `placeWithin` (distance <= radius +
 * accuracy) had nothing to work with. Watching and keeping the best fix is the whole fix.
 */
export interface GeoFix {
  lat: number;
  lng: number;
  /** Metres, the phone's own confidence. */
  accuracyM: number | null;
}

/**
 * Accurate enough to stop watching. It has to be tighter than the tightest fence, because at a radius of
 * 0 — which migration 0111 allows, meaning "only where the pin is" — the accuracy slack ALONE decides, so
 * settling for 50 m would admit anyone within 50 m of the pin while a 5 m fix would not. Phone GPS
 * outdoors reports 20 m or better within a few seconds; worse than that and the timer earns its keep.
 */
const GOOD_ENOUGH_M = 20;

export function getFix(timeoutMs = 10_000): Promise<GeoFix | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    /** The most precise fix seen so far. The timer answers with this, never with nothing. */
    let best: GeoFix | null = null;
    let watchId: number | null = null;

    const finish = (fix: GeoFix | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (watchId != null) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch {
          /* a browser that cannot clear its own watch must not fail the check-in */
        }
      }
      resolve(fix);
    };

    // Not `finish(null)`: a basement salon where GPS never locks still answers with the wifi fix it did
    // get, which is what today's code returns anyway. Waiting can improve the answer, never worsen it.
    const timer = setTimeout(() => finish(best), timeoutMs);

    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
          const accuracyM = Number.isFinite(accuracy) ? Math.round(accuracy) : null;
          // An unstated accuracy loses to a stated one: `placeWithin` reads null as "exact", so a fix
          // that claims nothing is the most dangerous one to keep when a measured fix is available.
          if (best === null || (accuracyM != null && (best.accuracyM == null || accuracyM < best.accuracyM))) {
            best = { lat: latitude, lng: longitude, accuracyM };
          }
          if (accuracyM != null && accuracyM <= GOOD_ENOUGH_M) finish(best);
        },
        (err) => {
          // Denied is final — nothing will arrive however long we wait. POSITION_UNAVAILABLE and TIMEOUT
          // are not: the network provider often fails while GPS is still acquiring, so keep watching and
          // let the timer end it.
          if (err.code === err.PERMISSION_DENIED) finish(null);
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
      );
      // A browser that delivered a fix synchronously resolved before `watchId` was assigned, so `finish`
      // had nothing to clear and the watch would have run on for the life of the page.
      if (done) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch {
          /* as above */
        }
      }
    } catch {
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
