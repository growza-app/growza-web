/**
 * Jira GRW-563 — a branch's pin from a pasted maps link or "lat, lng" typed by hand, for the enrol and
 * add-branch forms. The API parses the same shapes (`coordinatesFromMapsLink`); this lets the form say
 * "no place in that" before a round trip. Optional everywhere: an owner can set it later in Settings.
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

export const GEO_PROBLEM = 'Paste a Google or Apple Maps link, or type lat, lng — or leave it empty';
