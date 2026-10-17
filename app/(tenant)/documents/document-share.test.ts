import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { daysUntil, sharedDocumentUrl } from '../lib/share-document';

/**
 * Jira GRW-582 — sending a customer their document as a link.
 *
 * What is pinned is what a later edit would quietly undo: that the window is opened inside the tap (or phones block
 * it and the owner taps twice, making two links), that the address is the short public one, and that the message
 * actually contains line breaks rather than the two characters backslash and n.
 */
const root = resolve(__dirname, '../../..');
const helper = readFileSync(resolve(__dirname, '../lib/share-document.ts'), 'utf8');
const action = readFileSync(resolve(__dirname, '../components/DocumentAction.tsx'), 'utf8');
const viewer = readFileSync(resolve(__dirname, '[id]/DocumentViewer.tsx'), 'utf8');
const nextConfig = readFileSync(resolve(root, 'next.config.ts'), 'utf8');

describe('the address the customer opens', () => {
  it('is short, on the dashboard’s own origin, and carries only the token', () => {
    expect(sharedDocumentUrl('https://app.growza.in', 'abc_DEF-123')).toBe('https://app.growza.in/d/abc_DEF-123');
  });

  it('is rewritten to the API’s public page, and to nothing else', () => {
    expect(nextConfig).toMatch(/source: '\/d\/:token', destination: `\$\{API_ORIGIN\}\/api\/v1\/share\/:token`/);
  });
});

describe('how long it says the link works', () => {
  const now = new Date('2026-10-18T10:00:00.000Z').getTime();

  it('counts whole days, and never says 0', () => {
    expect(daysUntil('2026-10-25T10:00:00.000Z', now)).toBe(7);
    expect(daysUntil('2026-10-18T14:00:00.000Z', now)).toBe(1);
    expect(daysUntil('2026-10-17T10:00:00.000Z', now)).toBe(1);
  });
});

describe('opening WhatsApp', () => {
  it('opens its window inside the tap, before anything is awaited', () => {
    const opened = helper.indexOf("window.open('', '_blank')");
    const awaited = helper.indexOf('await api.shareDocument');
    expect(opened, 'the window is opened').toBeGreaterThan(-1);
    expect(awaited, 'the link is requested').toBeGreaterThan(-1);
    expect(opened, 'a window opened after an await is a pop-up, and is blocked').toBeLessThan(awaited);
  });

  it('closes the window it opened when the link could not be made', () => {
    expect(helper).toMatch(/catch \(error\) \{\s*win\?\.close\(\);\s*throw error;/);
  });

  it('shares to a chosen chat when the client has no number, instead of refusing', () => {
    expect(helper).toMatch(/\(opts\.phone \?\? ''\)\.replace/);
  });
});

describe('where it is offered', () => {
  it('on the Done screen, once the document exists and its details are known', () => {
    expect(action).toContain('sendDocumentOnWhatsApp');
    expect(action).toMatch(/\{summary \? \(/);
  });

  it('keeps every hook above the early returns (the PayFlow crash, once)', () => {
    const lastHook = Math.max(action.lastIndexOf('useEffect('), action.lastIndexOf('useState('), action.lastIndexOf('useRef('));
    const firstReturn = action.indexOf('if (blocked)');
    expect(lastHook).toBeGreaterThan(-1);
    expect(lastHook).toBeLessThan(firstReturn);
  });

  it('on the document screen, but never for a cancelled document', () => {
    expect(viewer).toContain("status === 'issued'");
    expect(viewer).toContain('sendDocumentOnWhatsApp');
  });
});

describe('the message', () => {
  it.each([
    ['en', en],
    ['hi', hi],
  ] as const)('%s: has real line breaks, a link and a number of days', (_lang, messages) => {
    const d = messages.documents;
    for (const key of ['shareText', 'shareLine'] as const) {
      expect(d[key], `${key} has a literal backslash-n`).not.toContain('\\n');
    }
    expect(d.shareText).toContain('\n');
    expect(d.shareLine).toContain('{link}');
    expect(d.shareLine).toMatch(/\{days, plural,/);
    expect(d.sharing.length).toBeGreaterThan(0);
  });
});
