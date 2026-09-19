/**
 * Jira GRW-319 — message-catalogue helpers. Pure, so they are unit-tested.
 */

export type Messages = { [key: string]: string | Messages };

const isBranch = (v: unknown): v is Messages => typeof v === 'object' && v !== null;

/**
 * `wanted` laid over `base`: every key `wanted` has, and English for any it
 * lacks. A translation that is still pending shows English instead of a blank
 * or a raw key (BR-04); the parity test is what forces it to be finished.
 */
export function withFallback(base: Messages, wanted: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(wanted)) {
    const under = out[key];
    out[key] = isBranch(value) && isBranch(under) ? withFallback(under, value) : value;
  }
  return out;
}

/**
 * Only the named top-level groups. A client component needs its own strings,
 * not the whole catalogue: handing the client everything would put every
 * screen's text in every page's HTML.
 */
export function pickNamespaces(messages: Messages, names: readonly string[]): Messages {
  return Object.fromEntries(Object.entries(messages).filter(([k]) => names.includes(k)));
}

/** Every leaf as `group.key` → its text, for comparing catalogues. */
export function flatten(messages: Messages, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isBranch(value)) Object.assign(out, flatten(value, path));
    else out[path] = value;
  }
  return out;
}
