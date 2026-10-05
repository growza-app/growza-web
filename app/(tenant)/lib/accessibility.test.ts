import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-342 — the accessibility floor, pinned.
 *
 * The rendered checks (axe-core over 22 screens at 320/360/393/768/1280px, a keyboard walk, a target-size
 * measurement, and every dialog opened, tabbed through and closed with Escape) were run in a browser. These pin
 * the rules a future change could quietly break, in ways a browser run would only catch if someone ran it.
 */
const APP = resolve(__dirname, '../..'); // web/app
const STYLES = resolve(__dirname, '../styles');
const read = (p: string) => readFileSync(p, 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('every modal dialog keeps its promise', () => {
  // Own their focus handling (checked by hand, and by the browser run): the account menu and the nav drawer
  // (a trap of their own), and the install banner, which is deliberately not modal.
  const OWN = ['AccountMenu.tsx', 'Sidebar.tsx', 'InstallBanner.tsx'];

  it('uses the shared useDialog hook: focus in, Tab kept inside, Escape closes, focus returns', () => {
    const missing = walk(APP)
      .filter((f) => /role="(alert)?dialog"/.test(read(f)))
      .filter((f) => !OWN.some((n) => f.endsWith(n)))
      .filter((f) => !read(f).includes('useDialog('))
      .map((f) => relative(APP, f));
    expect(missing).toEqual([]);
  });

  it('a dialog that says aria-modal is one that traps (no aria-modal without a hook or a trap)', () => {
    const lying = walk(APP)
      .filter((f) => /aria-modal=\{?"?true/.test(read(f)))
      .filter((f) => !OWN.some((n) => f.endsWith(n)))
      .filter((f) => !read(f).includes('useDialog('))
      .map((f) => relative(APP, f));
    expect(lying).toEqual([]);
  });

  it('the hook only lets the TOPMOST dialog answer Escape and Tab', () => {
    const hook = read(join(APP, 'shared/a11y/useDialog.ts'));
    expect(hook).toMatch(/if \(open\[open\.length - 1\] !== id\) return;/);
    expect(hook).toMatch(/opener\.isConnected/);
  });
});

describe('errors are announced', () => {
  it('no field, form or sheet error is rendered without a live region', () => {
    const silent: string[] = [];
    for (const f of walk(APP)) {
      read(f)
        .split('\n')
        .forEach((line, i) => {
          if (/<(?:div|p|span)\s+className="[^"]*\b(?:field-error|wi-error|banner-error)\b/.test(line) && !/role=|aria-live/.test(line)) silent.push(`${relative(APP, f)}:${i + 1}`);
        });
    }
    expect(silent).toEqual([]);
  });
});

describe('colour', () => {
  const base = read(join(STYLES, '00-base.css'));
  const token = (name: string) => new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(base)![1]!;
  const PAGE = '#eef0ee';

  it('the deep green reads on white, on the page, and on its own soft tint (4.5:1)', () => {
    const deep = token('--accent-deep');
    for (const bg of ['#ffffff', PAGE, token('--accent-soft')]) expect(contrast(deep, bg), `${deep} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it('white text on the deep green — every filled button and selected chip — clears 4.5:1', () => {
    expect(contrast('#ffffff', token('--accent-deep'))).toBeGreaterThanOrEqual(4.5);
  });

  it('no filled control puts white text on the bright green (#16a34a is 3.3:1)', () => {
    const offenders: string[] = [];
    for (const f of readdirSync(STYLES).filter((n) => n.endsWith('.css'))) {
      for (const m of read(join(STYLES, f)).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const body = m[2]!;
        if (/(?<![-\w])color:\s*(#fff|#ffffff|white)\b/.test(body) && /background(?:-color)?:\s*var\(--accent\)/.test(body)) offenders.push(`${f} ${m[1]!.trim().split('\n').pop()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('muted text keeps 4.5:1 on the page background', () => {
    expect(contrast(token('--muted'), PAGE)).toBeGreaterThanOrEqual(4.5);
  });

  it('the disabled "Coming soon" rows are muted, not faded — opacity puts their words under 4.5:1', () => {
    const settings = read(join(STYLES, '28-settings.css')).replace(/\/\*[\s\S]*?\*\//g, ''); // comments may mention it
    expect(settings).not.toMatch(/\.settings-row-disabled\s*\{[^}]*opacity:/);
  });
});

describe('the accessibility stylesheet', () => {
  const css = read(join(STYLES, '90-accessibility.css'));

  it('gives every control a focus ring, and text fields a forced one', () => {
    expect(css).toMatch(/:focus-visible\s*\{\s*outline:\s*2px solid var\(--accent-deep\)/);
    expect(css).toMatch(/input:focus-visible,\s*select:focus-visible,\s*textarea:focus-visible\s*\{[^}]*!important/);
  });

  it('respects "reduce motion"', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it('makes a phone control a 44px target, and a field 16px so iOS does not zoom the page', () => {
    expect(css).toMatch(/@media \(max-width: 860px\)[\s\S]*min-height:\s*44px/);
    expect(css).toMatch(/font-size:\s*16px !important/);
  });

  it('is loaded after every sheet it corrects, so it wins', () => {
    const globals = read(resolve(APP, '(tenant)/globals.css'));
    const imports = [...globals.matchAll(/@import '\.\/styles\/([^']+)'/g)].map((m) => m[1]!);
    const at = (name: string) => imports.indexOf(name);
    expect(at('90-accessibility.css')).toBeGreaterThan(at('89-book-again.css'));
    expect(at('90-accessibility.css')).toBeGreaterThan(at('86-money-card-phone.css'));
    expect(at('90-accessibility.css')).toBeGreaterThan(at('32-customers.css'));
  });
});

describe('one header, one ink, one dark card (Home and every other screen on a phone)', () => {
  const header = read(join(STYLES, '91-one-header.css'));

  it('every screen\'s title is Home\'s: 1.3125rem (21px at the default root), weight 800, on the page, no bar and no rule', () => {
    expect(header).toMatch(/@media \(max-width: 860px\)[\s\S]*\.topbar\s*\{\s*background:\s*transparent;\s*border-bottom:\s*0;/);
    // Jira GRW-481 — the size is the same 21px it always was; it is written in rem
    // so it grows with the reader's text size instead of ignoring it.
    expect(header).toMatch(/\.topbar h1,\s*\.rp-title-row h1\s*\{[^}]*font-size:\s*1\.3125rem;[^}]*font-weight:\s*800;/);
  });

  it('a subtitle stays on one line, as Home\'s date does', () => {
    expect(header).toMatch(/\.topbar-with-sub p\s*\{[^}]*white-space:\s*nowrap;/);
  });

  // Jira GRW-455 — Bookings' own dark summary card went with the metric card it was; Home's ink rule stands.
  it('Home has no ink of its own', () => {
    expect(read(join(STYLES, '83-role-home.css'))).toMatch(/--hm-ink:\s*var\(--text\)/);
  });
});

describe('charts have a name', () => {
  it('a donut and a line chart are announced with what they show', () => {
    expect(read(join(APP, '(tenant)/reports/charts/Donut.tsx'))).toMatch(/role="img" aria-label=\{segments\.map/);
    expect(read(join(APP, '(tenant)/reports/charts/LineChart.tsx'))).toMatch(/role="img" aria-label=\{chartName\}/);
  });
});

describe('one vertical rhythm on a phone', () => {
  const spacing = read(join(STYLES, '92-spacing.css'));

  it('every block on a screen is 16px from the next — the page padding, and Home\'s own card gap', () => {
    expect(spacing).toMatch(/@media \(max-width: 860px\)/);
    expect(spacing).toMatch(/\.page-body:not\(\.hm-page\) > \* \+ \*[^{]*\{\s*margin-top:\s*var\(--sp-4\) !important;/);
    expect(spacing).toMatch(/\.page-body:not\(\.hm-page\) > \*\s*\{\s*margin-bottom:\s*0 !important;/);
  });

  it('Home is left to its own grid gap — margins on top of it made the gaps 32px', () => {
    expect(spacing).toContain(':not(.hm-page)');
    expect(read(join(STYLES, '83-role-home.css'))).toMatch(/\.hm-page\s*\{[^}]*gap:\s*var\(--sp-4\)/);
  });

  it('cards carry 16px inside, and the transparent header fades content out instead of cutting it', () => {
    expect(spacing).toMatch(/\.bk-filter-card,\s*\.cust-segments\s*\{\s*padding:\s*var\(--sp-4\)/);
    expect(spacing).toMatch(/\.topbar::after,\s*\.hm-head::after/);
  });

  it("the phone's branch line is a 44px target without moving the title (Jira GRW-395)", () => {
    const css = read(join(STYLES, '94-header-branch-picker.css'));
    expect(css).toMatch(/\.hbp-line \.sbp-btn::after\s*\{\s*content:\s*'';\s*position:\s*absolute;\s*inset:\s*-9px -6px;/);
  });
});

/**
 * Jira GRW-481 — the reader's text size reaches the app.
 *
 * Every size in this app used to be a px literal measured against a hardcoded
 * `body { font-size: 15.5px }`, 874 of them, so an owner who turned on Larger
 * Text saw nothing change on any screen. These pin the two halves of the fix:
 * the scale is in `rem`, and the root is the reader's own body size.
 *
 * The one deliberate exception is a form field at 16px. That is not a
 * readability floor, it is the guard that stops iOS zooming the whole page when
 * someone taps into a field; below 16px Safari zooms, and a `rem` that the
 * reader had shrunk would walk straight back into it.
 */
describe('text grows with the reader', () => {
  // Comments quote the old px values on purpose, so they are not code to check.
  const sheets = readdirSync(STYLES)
    .filter((n) => n.endsWith('.css'))
    .map((n) => ({ name: n, css: read(join(STYLES, n)).replace(/\/\*[\s\S]*?\*\//g, '') }));

  it('makes a rem the reader\'s body size, not ours', () => {
    const base = read(join(STYLES, '00-base.css'));
    expect(base).toMatch(/html\s*\{\s*font:\s*-apple-system-body;\s*\}/);
    // Nothing may pin the root again afterwards — a font-size on html or body is
    // what broke this in the first place, and in `rem` it would also be circular.
    expect(base).not.toMatch(/html,\s*\nbody\s*\{[^}]*font-size:/);
  });

  it('writes every size in rem, except the field guard against iOS zoom', () => {
    const stray: string[] = [];
    for (const { name, css } of sheets) {
      for (const m of css.matchAll(/font-size:\s*([0-9.]+)px/g)) {
        if (m[1] !== '16') stray.push(`${name}: ${m[0]}`);
      }
    }
    expect(stray).toEqual([]);
  });

  /*
   * Jira GRW-484 — the icons go with the text.
   *
   * GRW-481 moved the type scale to rem and left all 229 icon sizes in px, so turning
   * Larger Text on widened the gap between a word and the icon beside it rather than
   * scaling the screen. Apple's own line, from the page the type rules came from:
   * "Increase the size of meaningful interface icons as font size increases."
   */
  it('sizes every icon in rem, so it grows with the words beside it', () => {
    const stray: string[] = [];
    for (const { name, css } of sheets) {
      for (const rule of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
        if (!/svg/.test(rule[1]!)) continue;
        for (const d of rule[2]!.matchAll(/(?:width|height):\s*[0-9.]+px/g)) {
          stray.push(`${name}: ${rule[1]!.trim().slice(0, 40)} { ${d[0]} }`);
        }
      }
    }
    expect(stray).toEqual([]);
  });

  /**
   * Jira GRW-551 — ONE named exception, at the owner's explicit request: the two pills on a phone's token card
   * (`Token No: 1`, `Since 2:57 pm`) are 0.625rem (10px). It is allowed by SELECTOR — the rule that starts
   * `.tb-board .tb-token,` in the token board sheet — so every other rule is still held to the floor and the
   * exception cannot spread by accident. Returns true when this declaration is that rule's.
   */
  const isTokenPill = (name: string, css: string, at: number) => {
    const before = css.slice(0, at);
    const selector = before.slice(before.lastIndexOf('}') + 1, before.lastIndexOf('{')).trim();
    return name === '95-token-board.css' && selector.startsWith('.tb-board .tb-token,');
  };

  it('keeps the 12px floor as a floor, in the new unit', () => {
    for (const { name, css } of sheets) {
      for (const m of css.matchAll(/font-size:\s*([0-9.]+)rem/g)) {
        if (isTokenPill(name, css, m.index ?? 0)) continue;
        expect(Number(m[1]), `${name}: ${m[0]}`).toBeGreaterThanOrEqual(0.75);
      }
    }
  });

  it('the only text under 12px is the token card pills (Jira GRW-551)', () => {
    const small: string[] = [];
    for (const { name, css } of sheets) {
      for (const m of css.matchAll(/font-size:\s*([0-9.]+)rem/g)) {
        if (Number(m[1]) < 0.75 && isTokenPill(name, css, m.index ?? 0)) small.push(`${name}: ${m[0]}`);
      }
    }
    expect(small).toEqual(['95-token-board.css: font-size: 0.625rem']);
    // ...and nothing else is below it (the floor test above would already fail, this names the exception's size).
    const allSmall = sheets.flatMap(({ css }) => [...css.matchAll(/font-size:\s*([0-9.]+)rem/g)].filter((m) => Number(m[1]) < 0.75));
    expect(allSmall).toHaveLength(1);
  });
});
