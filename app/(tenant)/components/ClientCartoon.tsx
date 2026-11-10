/**
 * A friendly cartoon face for a client, in place of their initials (owner, 10 Nov 2026).
 *
 * The face is chosen from the client's id, so the same person always gets the same face, on every screen and every
 * device. It is deliberately NOT chosen from the name: we do not store gender, and a man or woman guessed from a first
 * name is wrong often enough to offend. Every hairstyle here is one anyone might wear.
 *
 * Drawn inline — no image files, nothing to download (the image budget is 200 KB a screen) and no icon set beside
 * the one we have. The tile it sits in keeps its own size and round shape; this only fills it.
 */

const BACKGROUNDS = ['var(--accent-soft)', 'var(--blue-soft)', 'var(--amber-soft)', 'var(--purple-soft)', 'var(--danger-soft)'];
const SKINS = [
  { skin: '#f2c9a8', shade: '#e3b08d' },
  { skin: '#e2ae88', shade: '#cf9670' },
  { skin: '#c98f68', shade: '#b27852' },
  { skin: '#a8714c', shade: '#8f5c3a' },
  { skin: '#7d5236', shade: '#6a4129' },
];
const HAIR_COLOURS = ['#2b2522', '#3b2a20', '#1d1b1a', '#5a3b26', '#8b8580'];
const SHIRTS = ['#4b5aa6', '#16a34a', '#d97706', '#0e7490', '#be3a6d', '#6d4bb6', '#475569'];

/** Hairlines drawn over a head centred at (32, 28), 28 wide and 30 tall, in a 64 × 64 box. */
const HAIR = [
  // Short crop
  'M17 27C17 15 24 10 32 10s15 5 15 17c-3-6-7-8-15-8s-12 2-15 8Z',
  // Swept to one side
  'M17 28C16 14 26 9 34 10c8 1 14 7 13 18-2-6-6-10-11-11-6 3-13 4-19 11Z',
  // Quiff
  'M17 27c0-11 6-15 13-15 1-4 8-5 12-2 4 3 5 9 5 17-3-6-8-9-15-9s-12 3-15 9Z',
  // Close cut
  'M18 25c0-9 7-13 14-13s14 4 14 13c-4-5-9-7-14-7s-10 2-14 7Z',
  // Fuller, over the ears
  'M15 32C14 16 23 9 32 9s18 7 17 23c-2-3-3-7-4-10-5-3-9-4-13-4s-8 1-13 4c-1 3-2 7-4 10Z',
] as const;

/** Small hash, the same one the initials' tint has always used, so a client's colour does not change. */
function hash(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h;
}

export type Cartoon = { background: string; skin: string; shade: string; hairColour: string; hair: number; shirt: string; curly: boolean };

/** Which face a client gets. Pure, so a test can pin that it is stable and that a list of people is not all one face. */
export function cartoonFor(id: string): Cartoon {
  const h = hash(id);
  // Each part reads a different slice of the hash, so two clients who share a background still differ elsewhere.
  const pick = <T,>(list: readonly T[], shift: number) => list[Math.floor(h / shift) % list.length]!;
  const tone = pick(SKINS, 7);
  const style = Math.floor(h / 283) % (HAIR.length + 1); // the extra slot is curly hair, drawn as circles
  return {
    background: BACKGROUNDS[h % BACKGROUNDS.length]!,
    skin: tone.skin,
    shade: tone.shade,
    hairColour: pick(HAIR_COLOURS, 41),
    hair: style,
    shirt: pick(SHIRTS, 2017),
    curly: style === HAIR.length,
  };
}

export function ClientCartoon({ id, className }: { id: string; className: string }) {
  const c = cartoonFor(id);
  return (
    <span className={`${className} client-cartoon`} style={{ background: c.background }} aria-hidden>
      <svg viewBox="0 0 64 64" focusable="false">
        <path d="M8 66c0-14 11-21 24-21s24 7 24 21Z" fill={c.shirt} />
        <path d="M27 37h10v8.5c-1.6 1.4-3.3 2-5 2s-3.4-.6-5-2Z" fill={c.shade} />
        <circle cx="17.5" cy="30" r="3.6" fill={c.shade} />
        <circle cx="46.5" cy="30" r="3.6" fill={c.shade} />
        <ellipse cx="32" cy="28" rx="14" ry="15" fill={c.skin} />
        {c.curly ? (
          <g fill={c.hairColour}>
            <circle cx="20" cy="21" r="5" />
            <circle cx="25" cy="15.5" r="5.5" />
            <circle cx="32" cy="13.5" r="6" />
            <circle cx="39" cy="15.5" r="5.5" />
            <circle cx="44" cy="21" r="5" />
          </g>
        ) : (
          <path d={HAIR[c.hair]} fill={c.hairColour} />
        )}
        <circle cx="26.5" cy="29" r="1.7" fill="#2b2522" />
        <circle cx="37.5" cy="29" r="1.7" fill="#2b2522" />
        <path d="M27.5 34.5h9a4.5 4 0 0 1-9 0Z" fill="#fff" stroke="#2b2522" strokeWidth=".8" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
