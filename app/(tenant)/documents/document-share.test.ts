import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { DIARY_AREAS } from '../lib/areas';
import { canSee } from '../lib/nav-policy';
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

describe('where on the Done screen the invoice button sits', () => {
  const done = readFileSync(resolve(__dirname, '../components/PaymentDone.tsx'), 'utf8');
  const receipt = readFileSync(resolve(__dirname, '../components/ReceiptShare.tsx'), 'utf8');

  it('under Send on WhatsApp and above Print, in the receipt’s own column — not in the grid under Next customer', () => {
    expect(done).toMatch(/afterSend=\{<DocumentAction visitKey=\{appointmentId\} \/>\}/);
    // It was half a button wide in the Done / Fix-a-mistake grid, under the fold on a phone: present and not findable.
    const minor = done.slice(done.indexOf('pf-done-minor'), done.indexOf('pf-sound'));
    expect(minor).not.toContain('<DocumentAction');
    // The slot sits after the hint under Send and before the Print/Share row.
    const hint = receipt.indexOf('<p className="wi-receipt-hint">');
    const slot = receipt.indexOf('{afterSend}');
    const more = receipt.indexOf('className="wi-receipt-more"');
    expect(hint).toBeGreaterThan(-1);
    expect(slot).toBeGreaterThan(hint);
    expect(more).toBeGreaterThan(slot);
  });

  it('says which document it sends, so it is not a second "Send on WhatsApp" beside the receipt’s', () => {
    expect(action).toContain("t('shareTitle', { title })");
    expect(en.documents.shareTitle).toContain('{title}');
    expect(hi.documents.shareTitle).toContain('{title}');
  });

  it('is full width at the weight of Print, not a half-width ghost', () => {
    expect(action).not.toContain('pf-go-alt');
    const css = readFileSync(resolve(__dirname, '../styles/99-document.css'), 'utf8');
    expect(css).toMatch(/\.pf-doc \{[^}]*flex-direction: column/);
    expect(css).toMatch(/\.pf-doc \.btn \{[^}]*min-height: 3rem[^}]*justify-content: center/);
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

  it.each([
    ['the Done screen', action],
    ['the document screen', viewer],
  ])('%s: a double tap cannot make two links (the guard is a ref, because state is stale until the next render)', (_where, src) => {
    expect(src).toMatch(/const sharingNow = useRef\(false\)/);
    expect(src).toMatch(/if \(.*sharingNow\.current\) return/);
    expect(src).toMatch(/sharingNow\.current = true;\s*setSharing\(true\)/);
    // And it is let go again whichever way the share ended.
    expect(src).toMatch(/finally \{\s*sharingNow\.current = false;/);
  });

  it('on the document screen, but never for a cancelled document', () => {
    expect(viewer).toContain("status === 'issued'");
    expect(viewer).toContain('sendDocumentOnWhatsApp');
  });
});

describe('Download PDF', () => {
  it('is offered only when the server says it can make one, so it is never a button that can only fail', () => {
    expect(viewer).toMatch(/\{pdfAvailable \? \(\s*<button[^>]*onClick=\{\(\) => void download\(\)\}/);
    const page = readFileSync(resolve(__dirname, '[id]/page.tsx'), 'utf8');
    // Strictly true: an older API that does not send the field must read as "no", not as "yes".
    expect(page).toContain('pdfAvailable={doc.pdfAvailable === true}');
  });
});

describe('the sentences the server can answer with', () => {
  const messages = readFileSync(resolve(__dirname, '../lib/api-messages.ts'), 'utf8');
  it.each([
    'That bill was not found',
    'There is nothing on this bill to put on a document',
    'Add the client to this bill first',
    'This bill has not been paid yet. Take payment first, then make the document.',
    'This document was cancelled, so it cannot be sent',
  ])('has Hindi for %s', (sentence) => {
    expect(messages).toContain(`'${sentence}'`);
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

describe('opening /documents/[id] from the Done screen in a shop or a salon', () => {
  const page = readFileSync(resolve(__dirname, '[id]/page.tsx'), 'utf8');
  const SHOP_AREAS = { bookings: false, services: false, shop: true, stock: true };

  it('guards /documents (not /sales, which is closed in a shop and redirects the user Home)', () => {
    expect(page).toContain("await guardScreen('/documents');");
    expect(page).not.toContain("guardScreen('/sales')");
  });

  it('allows owner, manager and receptionist in both a shop and a salon, and refuses staff', () => {
    for (const areas of [SHOP_AREAS, DIARY_AREAS]) {
      expect(canSee('/documents', 'owner', [], true, areas)).toBe(true);
      expect(canSee('/documents', 'manager', [], true, areas)).toBe(true);
      expect(canSee('/documents', 'receptionist', [], true, areas)).toBe(true);
      expect(canSee('/documents', 'staff', [], true, areas)).toBe(false);
    }
  });
});
