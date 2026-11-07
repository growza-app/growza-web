import type { Messages } from './messages';

/**
 * The business's own nouns, put into the English messages (2026-11-07).
 *
 * The dashboard was written for a salon first, and about three hundred English messages said "client", "stylist",
 * "salon" or "service" in their text rather than taking the noun from the business's vertical config. A clinic's
 * no-show button said "Client didn't come"; a spa's Home said "Clients due back". Fixing them one call site at a
 * time is how they kept coming back, so the nouns are put in here, once, for every screen: this runs in the request
 * config, which is where both the server's `getTranslations` and the layout's client messages come from.
 *
 * What it does, word by word, on message TEXT only — never a `{placeholder}` or an ICU argument name:
 *
 *   client / clients   → labels.customer / labels.customers
 *   stylist            → labels.provider
 *   salon              → labels.business
 *   service / services → labels.service / labels.services
 *
 * keeping the case the message used ("Clients" → "Patients", "clients" → "patients", "CLIENTS" → "PATIENTS"). A salon's
 * labels ARE these words, so a salon's messages come out exactly as written; `vertical-words.test.ts` holds that, and
 * that no other business type is left with a salon word outside the exceptions below.
 *
 * English only. Every other language uses a word that fits every business (Hindi "ग्राहक", "बिज़नेस") — GRW-315's rule
 * until the vertical configs carry their own words per language.
 */

/** Messages whose salon-sounding words are not the business's nouns, and stay as written. */
export const KEEP_AS_WRITTEN: ReadonlySet<string> = new Set([
  // The marketplace's own field names: an OAuth "client", not a customer.
  'settingsChannels.fieldClientId',
  'settingsChannels.fieldClientSecret',
  // An iPhone setting is called "Location Services" whatever the business sells.
  'help.fixes.topics.cant-in.iphone.s1',
  // "Left without service" is about being served at all, not about the catalogue.
  'tokens.left',
  // An example business description, shown greyed in the empty field.
  'settingsProfile.placeholders.description',
]);

/** Namespaces that are lookup tables keyed by the English nouns themselves. */
const SKIP_NAMESPACES = new Set(['verticalNouns']);

interface Swap {
  /** The word as messages write it, lower case and singular/plural as matched. */
  word: string;
  /** The label key that replaces it. */
  label: string;
}

const SWAPS: Swap[] = [
  { word: 'clients', label: 'customers' },
  { word: 'client', label: 'customer' },
  { word: 'stylist', label: 'provider' },
  { word: 'salon', label: 'business' },
  { word: 'services', label: 'services' },
  { word: 'service', label: 'service' },
];

/** A label as it reads where the message had the word in lower case: "Patient" → "patient", but "MUA" stays "MUA". */
function lowerLike(label: string): string {
  const rest = label.slice(1);
  return rest === rest.toLowerCase() ? label.charAt(0).toLowerCase() + rest : label;
}

/** The label in the case the message wrote the word in. */
function inCaseOf(found: string, label: string): string {
  if (found === found.toUpperCase()) return label.toUpperCase();
  if (found.charAt(0) === found.charAt(0).toUpperCase()) return label.charAt(0).toUpperCase() + label.slice(1);
  return lowerLike(label);
}

/**
 * Not straight after "{" — that is an argument's name (`{client}`, `{clients, plural, …}`), which only the code passing
 * the value may change. Text inside a plural's branches (`{# client}`) is text, and is swapped, up to its closing "}".
 * "stylist-type" is swapped too; a word inside a longer one ("clientele") is not.
 */
const PATTERN = new RegExp(`(?<![{\\w-])(${SWAPS.map((s) => s.word).join('|')})(?!\\w)`, 'gi');

export function swapWords(text: string, labels: Record<string, string>): string {
  return text.replace(PATTERN, (found) => {
    const swap = SWAPS.find((s) => s.word === found.toLowerCase());
    const label = swap ? labels[swap.label] : undefined;
    return label ? inCaseOf(found, label) : found;
  });
}

/** The English messages with this business's nouns in them. Returns the same object when there are no labels. */
export function inVerticalWords(messages: Messages, labels: Record<string, string> | null | undefined): Messages {
  if (!labels || Object.keys(labels).length === 0) return messages;
  const walk = (node: unknown, path: string): unknown => {
    if (typeof node === 'string') return KEEP_AS_WRITTEN.has(path) ? node : swapWords(node, labels);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        const child = path ? `${path}.${k}` : k;
        out[k] = !path && SKIP_NAMESPACES.has(k) ? v : walk(v, child);
      }
      return out;
    }
    return node;
  };
  return walk(messages, '') as Messages;
}
