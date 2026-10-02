/**
 * Jira GRW-442 — reading the refusal the API sends when a package still sells a service.
 *
 * Separate and pure because this parses something that arrived over the wire. It is the one place that
 * decides what a well-formed refusal looks like, and the place a test can prove that a malformed one falls
 * back to the plain sentence instead of rendering an empty dialog.
 */

export interface HeldPackage {
  id: string;
  title: string;
  serviceCount: number;
  priceMinor: string | null;
}

function isPackage(value: unknown): value is HeldPackage {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    p.id.length > 0 &&
    typeof p.title === 'string' &&
    p.title.length > 0 &&
    typeof p.serviceCount === 'number' &&
    (p.priceMinor === null || typeof p.priceMinor === 'string')
  );
}

/**
 * The packages named in a 409 body, or null when it is not that kind of refusal.
 *
 * Null — not an empty array — for anything unrecognised, so the caller can tell "no packages were named" from
 * "this refusal is about something else" and fall back to the plain message rather than opening a dialog with
 * nothing in it.
 */
export function packagesInRefusal(details: unknown): HeldPackage[] | null {
  if (typeof details !== 'object' || details === null) return null;
  const list = (details as { packages?: unknown }).packages;
  if (!Array.isArray(list) || list.length === 0) return null;
  const packages = list.filter(isPackage);
  return packages.length > 0 ? packages : null;
}
