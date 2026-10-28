import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const tenant = join(__dirname, '..');
const read = (p: string) => readFileSync(join(tenant, p), 'utf8');

// The search boxes people use every day, and how many of their `type="search"` inputs must carry the × and mic.
const BOXES: Array<[string, number]> = [
  ['customers/CustomersClient.tsx', 2],
  ['appointments/BookingsList.tsx', 1],
  ['sales/SalesClient.tsx', 1],
  ['appointments/new/DeskServiceGrid.tsx', 1],
  ['appointments/new/ClientSheet.tsx', 1],
  ['services/ServicesTable.tsx', 2],
  ['providers/StaffClient.tsx', 2],
  ['components/NewVisitSheet.tsx', 1],
  ['components/ServiceSheet.tsx', 1],
  ['products/ProductsList.tsx', 1],
  ['search/SearchClient.tsx', 1],
];

describe('the × and voice microphone inside a search box', () => {
  it.each(BOXES)('%s carries it', (file, n) => {
    const src = read(file);
    expect(src).toMatch(/import \{ SearchClear \} from '[^']*SearchClear';/);
    expect((src.match(/<SearchClear /g) ?? []).length).toBeGreaterThanOrEqual(n);
  });

  it('shows only while there is text (or voice is supported), labels itself, and puts the cursor back', () => {
    const src = read('components/SearchClear.tsx');
    expect(src).toContain("if (value === '') return null;");
    expect(src).toContain("t('clearSearch')");
    expect(src).toContain("t('voiceSearch')");
    expect(src).toContain("t('stopVoiceSearch')");
    expect(src).toContain('box.focus()');
  });

  it('hides the browser’s own × beside it and keeps a 44px tap area for both clear and mic', () => {
    const css = read('styles/26-search.css');
    expect(css).toContain("input[type='search']:has(+ .search-clear)::-webkit-search-cancel-button");
    expect(css).toContain("input[type='search']:has(+ .search-mic)::-webkit-search-cancel-button");
    expect(css).toMatch(/\.search-clear \{[^}]*width: 2\.75rem;[^}]*height: 2\.75rem;/);
    expect(css).toMatch(/\.search-mic \{[^}]*width: 2\.75rem;[^}]*height: 2\.75rem;/);
  });

  it('has its words in English and Hindi', () => {
    for (const lang of ['en', 'hi']) {
      const m = JSON.parse(readFileSync(join(tenant, '../../messages', `${lang}.json`), 'utf8'));
      expect(m.common.clearSearch).toBeTruthy();
      expect(m.common.voiceSearch).toBeTruthy();
      expect(m.common.stopVoiceSearch).toBeTruthy();
      expect(m.common.voiceListening).toBeTruthy();
      expect(m.common.voicePermissionDenied).toBeTruthy();
      expect(m.common.alsoTry).toBeTruthy();
    }
  });
});

/**
 * QA 2026-10-26, County Chicken — a blocked microphone says so in words.
 *
 * The owner reported that voice search "does not work". It was wired correctly; what was missing was the
 * answer. A denied microphone turned the icon red and set `title`, and `title` never appears on a touch
 * device — so the owner tapped, a small shape changed shade, and nothing told them what had happened or
 * what to do. The red icon stays; it is no longer the whole of the message.
 */
describe('a microphone the browser has blocked', () => {
  const component = read('components/SearchClear.tsx');
  const css = read('styles/26-search.css');

  it('says it in a sentence, not only in a colour', () => {
    expect(component).toMatch(/\{denied && \(/);
    expect(component).toContain("t('voicePermissionDeniedHelp')");
    // A status, not an alert: it answers something they just did, it does not interrupt them.
    expect(component).toMatch(/className="search-mic-note" role="status"/);
  });

  it('keeps the line short and puts the instructions in the popup, in both languages', () => {
    for (const locale of ['en', 'hi']) {
      const messages = JSON.parse(readFileSync(join(tenant, '..', '..', 'messages', `${locale}.json`), 'utf8')) as {
        common: Record<string, string>;
      };
      const c = messages.common;
      // The note is one line over a list the owner was reading: it says what happened and that typing works.
      expect(c.voicePermissionDeniedHelp, locale).toBeTruthy();
      expect(c.voicePermissionDeniedHelp!.length, locale).toBeLessThan(70);
      // The steps live behind "How to turn it on", and they say WHERE — a help message that does not name
      // the switch is the bug this started as.
      for (const key of ['voiceHowTo', 'voiceEnableTitle', 'voiceEnableSteps', 'voiceEnableWhy', 'voiceTryAgain', 'voiceNoteClose']) {
        expect(c[key], `${locale}.${key}`).toBeTruthy();
      }
      expect(c.voiceEnableSteps, locale).toMatch(locale === 'en' ? /lock/i : /ताले|ताला/);
      // Three numbered steps, one per line, so the <ol> has three items to render.
      expect(c.voiceEnableSteps!.split('\n'), locale).toHaveLength(3);
      expect(c.voicePermissionDenied, locale).toBeTruthy();
    }
  });

  /*
   * No page can reopen a permission prompt it has already been refused — the same is true of geolocation.
   * So the popup is ours, it says plainly whose decision it is, and it offers the retry that makes sense
   * once they have made it. The watcher is what spares them even that on the common path.
   */
  it('offers a way out and a way back: a dismiss, a how-to, and a retry', () => {
    expect(component).toMatch(/className="search-mic-note-x"[\s\S]{0,80}onClick=\{\(\) => setDenied\(false\)\}/);
    expect(component).toMatch(/className="search-mic-how"[\s\S]{0,60}setShowHowTo\(true\)/);
    expect(component).toContain('<ConfirmDialog');
    expect(component).toMatch(/confirmLabel=\{t\('voiceTryAgain'\)\}/);
    // The steps render as a list, not as a string with newlines in it.
    expect(component).toMatch(/<ol className="search-mic-steps">/);
  });

  it('clears itself when the microphone is allowed, rather than contradicting a mic that now works', () => {
    expect(component).toMatch(/permissions/);
    expect(component).toMatch(/query\(\{ name: 'microphone' \}\)/);
    expect(component).toMatch(/result\.onchange = sync;/);
    // A browser without the Permissions API must not throw: it simply keeps the note until the next tap.
    expect(component).toMatch(/\} catch \{[\s\S]{0,120}\}/);
  });

  /*
   * Two parents, both found by looking. `.search-wrap` is a flex row in `.prd-search`, so the <p> became a
   * 94px column beside the input; the menu sheet's `.pf-client-box` is a different box, where the magnifier
   * and the microphone — `position: absolute; top: 50%` of a parent that had just grown 90px — came to rest
   * on top of the sentence they produced. Hence the rule is on the note's PARENT, whatever it is: naming
   * the containers one at a time is how the second one shipped.
   */
  it('takes a line of its own in whatever box holds it, not a column beside the input', () => {
    expect(css).toMatch(/:has\(> \.search-mic-note\) \{\s*flex-wrap: wrap;/);
    expect(css).toMatch(/\.search-mic-note \{\s*flex: 1 0 100%;/);
    // Not tied to one container's class name.
    expect(css).not.toMatch(/\.search-wrap:has\(\.search-mic-note\)/);
  });

  /*
   * `:is()` for specificity, not brevity: `.pf-client-box svg` sets `top: 50%` from a later stylesheet, and
   * a plain `> svg` ties with it and loses on source order — which is how the magnifier ended up sitting on
   * the word "Microphone".
   */
  it('leaves the magnifier and the microphone on the input row', () => {
    expect(css).toMatch(/:has\(> \.search-mic-note\) > :is\(svg, \.search-mic, \.search-clear\) \{\s*top: 1\.375rem;/);
  });

  /*
   * QA 2026-10-28 — and the note's OWN icons stay inside their buttons.
   *
   * The rule above rescues the box's direct children. The cross is a grandchild, inside its own button, so
   * `.pf-client-box svg` still had it: `position: absolute; left: var(--sp-3); top: 50%` parked the glyph at
   * the middle-left of a box the note had just made 90px taller — on top of "Microphone is blocked" — and
   * `pointer-events: none` meant tapping it did nothing. Measured in a browser: the glyph sat at x=44 while
   * its button was at x=295, and a hit test at the glyph returned the <p>, not the button.
   *
   * Two classes deep because one is not enough: `.search-mic-note svg` is (0,1,1), the same as the rule that
   * caused this, and 73-pay-flow.css loads later. The first attempt at this fix changed nothing at all.
   */
  it('keeps the note’s own icons in their buttons, where they can be tapped', () => {
    expect(css).toMatch(/\.search-mic-note :is\(\.search-mic-how, \.search-mic-note-x\) svg \{\s*position: static;/);
    expect(css).toMatch(/\.search-mic-note :is\([^)]*\) svg \{[^}]*pointer-events: auto;/);
  });
});
