import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { scanSource } from './i18n-scan';
import { lowered, surplus, type Inventory } from './i18n-ratchet';
import { DASHBOARD_ROOT, fromDashboard } from './dashboard-root';

/**
 * Jira GRW-317 — owner-facing English cannot be added without the dictionary.
 *
 * Jira GRW-315 makes the dashboard fully Hindi. That cannot finish while every
 * new screen adds English written straight into a component, so this fails on
 * it. Same shape as `title-coverage.test.ts`: it reads the directory, not a list.
 *
 * ## A ratchet, not a wall
 *
 * `i18n-allowlist.json` records WHICH literals each file may still contain. A
 * file may not gain one, and a file that loses one must have it removed from the
 * list — so the list only ever shrinks. Recording the literals rather than a
 * count is what stops one string leaving while a different one arrives.
 *
 * To lower the list after translating some text:
 *
 *   I18N_UPDATE_ALLOWLIST=1 npx vitest run "web/app/(tenant)/lib/i18n-guard.test.ts"
 *
 * That only ever removes entries (a literal that moved to another file, word for
 * word, moves with it). Accepting NEW English means editing the JSON by hand,
 * where a reviewer sees it. It never runs in CI.
 *
 * Text that is deliberately not translated (a brand name, a unit) is excused
 * with a comment saying why — see `i18n-scan.ts`.
 *
 * Everything under `web/app` is scanned except `admin` (BR-01, the platform
 * portal): the roots are read from the directory, so a new route group or shared
 * folder is covered without touching this file.
 */

const APP = fromDashboard('app');
const EXCLUDED = new Set(['admin']);
const ALLOWLIST = fromDashboard('app/(tenant)/lib/i18n-allowlist.json');
const UPDATE_CMD = 'I18N_UPDATE_ALLOWLIST=1 npx vitest run i18n-guard.test.ts';
/** Comfortably under the real count (~135), so a moved directory fails instead of passing on nothing. */
const FILE_FLOOR = 120;

const isSource = (name: string) => /\.(tsx|jsx)$/.test(name) && !/\.test\.(tsx|jsx)$/.test(name);

function findSource(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry).split('\\').join('/');
    if (statSync(full).isDirectory()) out.push(...findSource(full));
    else if (isSource(entry)) out.push(full);
  }
  return out;
}

const isTracked = (path: string) => {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', path], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

describe('scanSource', () => {
  const flagged = (src: string) => scanSource('x.tsx', src).literals.map((l) => l.text);

  it('flags JSX text', () => {
    expect(flagged('const A = () => <button>Save changes</button>;')).toEqual(['Save changes']);
  });

  it('flags a literal in a text attribute, in either spelling', () => {
    expect(flagged('const A = () => <input placeholder="Search" />;')).toEqual(['placeholder="Search"']);
    expect(flagged('const A = () => <input aria-label={"Close"} />;')).toEqual(['aria-label="Close"']);
  });

  it('flags custom text props by name shape, not a closed list', () => {
    expect(flagged('const A = () => <Dialog subtitle="Are you sure?" confirmLabel="Remove" body="Gone for good." />;')).toEqual([
      'subtitle="Are you sure?"',
      'confirmLabel="Remove"',
      'body="Gone for good."',
    ]);
  });

  it('flags the name a KPI tile gives its line (Jira GRW-363)', () => {
    expect(flagged('const A = () => <Kpi sparkName="Came back" />;')).toEqual(['sparkName="Came back"']);
  });

  it('flags a template with words in it, and the branches of a ternary', () => {
    expect(flagged('const A = ({ n }) => <a aria-label={`Call ${n}`} title={n ? "Open" : undefined} />;')).toEqual([
      'aria-label="Call ${…}"',
      'title="Open"',
    ]);
  });

  it('flags literals in JSX child expressions', () => {
    expect(flagged('const A = ({ b }) => <p>{b ? "Saving…" : "Save"}{"Done"}{b && `Wait ${b}`}</p>;')).toEqual([
      '{Saving…}',
      '{Save}',
      '{Done}',
      '{Wait ${…}}',
    ]);
  });

  it('flags text-carrying object properties and message calls', () => {
    expect(flagged('const T = [{ label: "Present" }]; setError("Could not save"); if (window.confirm("Delete it?")) x();')).toEqual([
      'label: "Present"',
      'setError("Could not save")',
      'confirm("Delete it?")',
    ]);
  });

  it('does not flag text that comes from the dictionary', () => {
    expect(flagged('const A = () => <button title={copy.x.y}>{copy.x.save}{t(`a`)}</button>;')).toEqual([]);
  });

  it('does not flag symbols, entities, whitespace or non-text attributes', () => {
    expect(flagged('const A = () => <p className="btn-primary" href="/settings" data-label="Hello" type="text">· ₹ &nbsp; &amp; &frac12;</p>;')).toEqual([]);
    expect(flagged('const A = () => <p>{"·"}{cond && "₹"}</p>;')).toEqual([]);
  });

  it('honours i18n-ok with a reason — text, expression, attribute, same line', () => {
    expect(flagged('const A = () => <p>{/* i18n-ok: brand name */}Growza</p>;')).toEqual([]);
    expect(flagged('const A = () => <p>\n  {/* i18n-ok: brand name */}\n  Growza\n</p>;')).toEqual([]);
    expect(flagged('const A = () => <p>{/* i18n-ok: brand name */}{"Growza"}</p>;')).toEqual([]);
    expect(flagged('const A = () => (\n  <img\n    // i18n-ok: brand name\n    alt="Growza"\n  />\n);')).toEqual([]);
    expect(flagged('const A = () => <input /* i18n-ok: unit */ placeholder="kg" />;')).toEqual([]);
  });

  it('a marker excuses only the one node after it', () => {
    expect(flagged('const A = ({ x }) => <p>{/* i18n-ok: brand */}Growza{x}Salon</p>;')).toEqual(['Salon']);
  });

  it('counts an i18n-ok comment with no reason as a failure, and still flags the text', () => {
    const r = scanSource('x.tsx', 'const A = () => <p>{/* i18n-ok */}Growza</p>;');
    expect(r.badMarkers).toBe(1);
    expect(r.literals).toHaveLength(1);
  });

  it('does not mistake i18n-ok inside a string, or JSX text, for a marker', () => {
    expect(scanSource('x.tsx', 'const s = "i18n-ok-x"; const A = () => <p>{s}</p>;').badMarkers).toBe(0);
    expect(scanSource('x.tsx', 'const A = () => <p>{"see i18n-ok"}</p>;').badMarkers).toBe(0);
  });

  it('reports the line of a literal spread over several lines', () => {
    const r = scanSource('x.tsx', 'const A = () => (\n  <p>\n    Hello there\n  </p>\n);');
    expect(r.literals[0]?.line).toBe(3);
  });

  it('records the same text the same way wherever it sits in the file', () => {
    const a = scanSource('x.tsx', 'const A = () => <p>Hello there</p>;').literals[0]?.text;
    const b = scanSource('x.tsx', '\n\n\nconst A = () => (\n  <p>\n    Hello   there\n  </p>\n);').literals[0]?.text;
    expect(b).toBe(a);
  });
});

describe('the allowlist arithmetic', () => {
  it('sees a swap: one string out, a different one in, same count', () => {
    const allowed = ['aria-label="Back"'];
    const now = ['Brand new hardcoded English'];
    expect(surplus(now, allowed)).toEqual(['Brand new hardcoded English']);
    expect(surplus(allowed, now)).toEqual(['aria-label="Back"']);
  });

  it('counts duplicates', () => {
    expect(surplus(['Save', 'Save'], ['Save'])).toEqual(['Save']);
  });

  it('lowers: drops what is gone, never adds what is new', () => {
    const existing: Inventory = { 'a.tsx': ['Save', 'Cancel'] };
    const current: Inventory = { 'a.tsx': ['Save', 'Brand new'] };
    expect(lowered(existing, current)).toEqual({ 'a.tsx': ['Save'] });
  });

  it('lets a literal move with a renamed file, one for one', () => {
    const existing: Inventory = { 'Old.tsx': ['Save', 'Cancel'] };
    const current: Inventory = { 'New.tsx': ['Save', 'Cancel'] };
    expect(lowered(existing, current)).toEqual({ 'New.tsx': ['Cancel', 'Save'] });
  });

  it('adopts no more than left, and only word for word', () => {
    const existing: Inventory = { 'Old.tsx': ['Save'] };
    const current: Inventory = { 'New.tsx': ['Save', 'Save', 'Something else'] };
    expect(lowered(existing, current)).toEqual({ 'New.tsx': ['Save'] });
  });

  it('removes a file whose English is gone', () => {
    expect(lowered({ 'a.tsx': ['Save'] }, {})).toEqual({});
  });
});

describe('owner-facing text goes through the dictionary', () => {
  const dirs = readdirSync(APP).filter((e) => statSync(join(APP, e)).isDirectory() && !EXCLUDED.has(e) && e !== 'node_modules');
  const top = readdirSync(APP).filter((e) => statSync(join(APP, e)).isFile() && isSource(e)).map((e) => `${APP}/${e}`);
  /*
   * Jira GRW-373 — the inventory is keyed RELATIVE to the dashboard root.
   *
   * These keys are compared against the committed allowlist, so they must mean
   * the same thing wherever the dashboard lives: `app/(tenant)/...`, not
   * `web/app/(tenant)/...` in growza and something else again in growza-web.
   */
  const files = [...top, ...dirs.flatMap((d) => findSource(`${APP}/${d}`))]
    .map((f) => relative(DASHBOARD_ROOT, f).split('\\').join('/'))
    .sort();

  // Each file is read and parsed once, and every test below reads from this.
  // `files` holds dashboard-relative keys; the read needs the root put back on.
  const scans = new Map(files.map((f) => [f, scanSource(f, readFileSync(fromDashboard(f), 'utf8'))]));

  it('finds the screens at all, and never opens the admin portal', () => {
    // A guard that scans nothing passes forever. If a directory moves, this says so.
    expect(files.length).toBeGreaterThan(FILE_FLOOR);
    expect(files.filter((f) => f.includes('/admin/'))).toEqual([]);
  });

  it('has no i18n-ok comment without a reason', () => {
    const bare = files.filter((f) => scans.get(f)!.badMarkers > 0);
    expect(bare, `\ni18n-ok needs a reason: {/* i18n-ok: brand name */}\n`).toEqual([]);
  });

  it('adds no hardcoded English, and the allowlist only shrinks', () => {
    const current: Inventory = {};
    for (const [f, s] of scans) if (s.literals.length) current[f] = s.literals.map((l) => l.text).sort();

    const write = (inv: Inventory) => writeFileSync(ALLOWLIST, JSON.stringify({ files: inv }, null, 2) + '\n');
    const update = process.env.I18N_UPDATE_ALLOWLIST === '1';
    const init = process.env.I18N_INIT_ALLOWLIST === '1';
    if ((update || init) && process.env.CI) throw new Error('The allowlist is never rewritten in CI. Run the update locally and commit it.');

    let allow: Inventory;
    if (existsSync(ALLOWLIST)) {
      allow = (JSON.parse(readFileSync(ALLOWLIST, 'utf8')) as { files: Inventory }).files;
      if (update) {
        allow = lowered(allow, current);
        write(allow);
      }
    } else if (isTracked(ALLOWLIST)) {
      throw new Error(`${ALLOWLIST} is tracked but missing. Restore it: git checkout -- "${ALLOWLIST}"\nRegenerating it would accept every current literal as allowed.`);
    } else if (init) {
      allow = current;
      write(allow);
    } else {
      throw new Error(`${ALLOWLIST} does not exist. Create the first one with I18N_INIT_ALLOWLIST=1.`);
    }

    const lines: string[] = [];
    const paths = [...new Set([...Object.keys(current), ...Object.keys(allow)])].sort();

    const added = paths.map((f) => [f, surplus(current[f] ?? [], allow[f] ?? [])] as const).filter(([, x]) => x.length);
    if (added.length) {
      lines.push('\nHardcoded English was added. Put the words in lib/copy.ts and read them from there:');
      for (const [f, extra] of added) {
        lines.push(`  ${f}`);
        for (const text of extra) lines.push(`      line ${scans.get(f)?.literals.find((l) => l.text === text)?.line ?? '?'}: ${text.slice(0, 70)}`);
      }
      lines.push('\nText that must stay as-is (a brand name, a unit): add a comment  i18n-ok: <reason>');
    }

    const gone = paths.map((f) => [f, surplus(allow[f] ?? [], current[f] ?? [])] as const).filter(([, x]) => x.length);
    if (gone.length) {
      lines.push('\nThe allowlist still lists English that is no longer there. Remove it:');
      for (const [f, stale] of gone) lines.push(`  ${f}  (${stale.length} gone, e.g. ${stale[0]!.slice(0, 50)})`);
      lines.push(`\n  ${UPDATE_CMD}`);
    }

    if (lines.length) throw new Error(lines.join('\n'));
  });
});
