/**
 * Which column of the owner's spreadsheet becomes which field of a service.
 *
 * Pure, because the one thing that goes wrong here is a column ending up as two things (or a field coming from
 * two columns) — and that is cheap to pin and expensive to find in a 189-row import.
 */

export type Field = 'name' | 'categoryName' | 'durationMin' | 'bufferAfterMin' | 'priceMinor';

/** `field → column index` in the owner's file; -1 is "not in the file". */
export type ColumnMap = Record<Field, number>;

/** `labelKey` names the field in `services.import.fields`; `hints` are header words to recognise, in English as the files usually are. */
export const FIELDS: { key: Field; labelKey: 'name' | 'category' | 'minutes' | 'cleanup' | 'price'; required: boolean; hints: string[] }[] = [
  { key: 'name', labelKey: 'name', required: true, hints: ['service', 'name', 'treatment', 'item'] },
  { key: 'categoryName', labelKey: 'category', required: false, hints: ['type', 'category', 'group', 'section'] },
  // "Labour hrs" is the design's own example of a column that should map to duration without the owner
  // reformatting their file. The board calls this "Takes"; we say "Minutes", which names the unit.
  { key: 'durationMin', labelKey: 'minutes', required: true, hints: ['duration', 'mins', 'minutes', 'time', 'takes', 'labour', 'hrs'] },
  { key: 'bufferAfterMin', labelKey: 'cleanup', required: false, hints: ['cleanup', 'buffer', 'gap', 'turnaround'] },
  { key: 'priceMinor', labelKey: 'price', required: false, hints: ['price', 'rate', 'cost', 'amount', 'charge', 'fee'] },
];

/** Best-guess mapping so a conventionally-named sheet needs no work at all. */
export function suggest(headers: string[]): ColumnMap {
  const used = new Set<number>();
  const out = {} as ColumnMap;
  for (const f of FIELDS) {
    const i = headers.findIndex((h, idx) => !used.has(idx) && f.hints.some((hint) => h.toLowerCase().includes(hint)));
    out[f.key] = i;
    if (i >= 0) used.add(i);
  }
  return out;
}

/** What column `i` becomes, or null when it is not used. */
export function fieldAt(map: ColumnMap, i: number): Field | null {
  return FIELDS.find((f) => map[f.key] === i)?.key ?? null;
}

/**
 * Column `i` becomes `field` (or nothing, with null).
 *
 * A column is one thing and a field comes from one column, so choosing a field that another column held moves
 * it: that other column is then unused, rather than the import quietly reading the same field twice.
 */
export function withColumnAs(map: ColumnMap, i: number, field: Field | null): ColumnMap {
  const next = { ...map };
  for (const f of FIELDS) if (next[f.key] === i) next[f.key] = -1;
  if (field) next[field] = i;
  return next;
}

/** The required fields with no column yet. */
export function missingRequired(map: ColumnMap): Field[] {
  return FIELDS.filter((f) => f.required && map[f.key] < 0).map((f) => f.key);
}

/** Whether the guess found every required column — the cue to confirm in one line rather than ask. */
export const matchedAll = (map: ColumnMap): boolean => missingRequired(map).length === 0;

/** Up to `n` different non-empty values from column `i`, trimmed and cut, so the owner can see what is in it. */
export function samplesFor(rows: string[][], i: number, n = 2): string[] {
  const out: string[] = [];
  for (const r of rows.slice(0, 40)) {
    const v = (r[i] ?? '').trim();
    if (v && !out.includes(v)) out.push(v.length > 24 ? `${v.slice(0, 23)}…` : v);
    if (out.length >= n) break;
  }
  return out;
}
