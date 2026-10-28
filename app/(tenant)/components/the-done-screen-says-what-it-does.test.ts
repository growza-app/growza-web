import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Owner, 2026-10-28, on the payment-received screen: "too many options and graphics card is never shared".
 *
 * Both halves were true and they were the same fault. "Copy receipt card" and "Copy text" put something on a
 * CLIPBOARD, and nothing on the screen told anyone to paste it — four buttons for two jobs, beside a Send that
 * already carried the text and a Share that already carried the picture.
 *
 * And Send itself ran `copyCardToClipboard()` on the way out, silently: the card went to the clipboard, `wa.me`
 * opened with text only, and nobody pasted it. That is the whole of "the graphic card is never shared" — a
 * `wa.me` link cannot carry an image, and the code was pretending otherwise rather than saying so.
 */
const share = readFileSync(join(process.cwd(), 'app/(tenant)/components/ReceiptShare.tsx'), 'utf8');
const copy = readFileSync(join(process.cwd(), 'app/(tenant)/lib/use-copy.ts'), 'utf8');
const en = JSON.parse(readFileSync(join(process.cwd(), 'messages/en.json'), 'utf8'));
const hi = JSON.parse(readFileSync(join(process.cwd(), 'messages/hi.json'), 'utf8'));

describe('the payment-received screen offers only what it can do', () => {
  it('no longer copies the card to a clipboard nobody was told about', () => {
    // The names may still appear in the comment that explains why they are gone; neither may be defined or called.
    for (const fn of ['copyCardToClipboard', 'copyTextToClipboard']) {
      expect(share, `${fn} is defined`).not.toMatch(new RegExp(`const ${fn} = `));
      expect(share, `${fn} is called`).not.toMatch(new RegExp(`${fn}\\(\\)`));
    }
  });

  it('Send carries the number and nothing else hidden', () => {
    expect(share).toMatch(/onClick=\{\(\) => \{\s*if \(onNumberGiven && !phone\) onNumberGiven\(toStoredPhone\(typed\)!\);\s*\}\}/);
  });

  it('keeps Share, which is the only route an image can take to WhatsApp', () => {
    // `wa.me` carries text only; `navigator.share({ files })` is the OS sheet, where WhatsApp is a choice.
    expect(share).toContain('shareReceipt');
    expect(share).toMatch(/navigator\.share\(\{ files: \[file\], text \}\)/);
  });

  it('keeps Print, which is its own job', () => {
    expect(share).toContain('window.print()');
  });

  it('leaves no copy key behind with nothing to read it', () => {
    for (const k of ['copyCard', 'cardCopied', 'copyText', 'textCopied']) {
      expect(copy, k).not.toContain(`${k}: t('${k}')`);
      expect(en.newVisit, `en ${k}`).not.toHaveProperty(k);
      expect(hi.newVisit, `hi ${k}`).not.toHaveProperty(k);
    }
  });
});
