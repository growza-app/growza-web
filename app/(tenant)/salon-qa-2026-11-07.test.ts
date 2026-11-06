import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { markAllInTime } from './attendance/mark-all';
import { nounsIn } from './lib/vertical-nouns';

/** The fixes for what the salon UI suite found on 2026-11-07 (e2e/salon in the API repo holds the browser side). */
const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');
const en = JSON.parse(readFileSync(join(__dirname, '..', '..', 'messages', 'en.json'), 'utf8'));
const hi = JSON.parse(readFileSync(join(__dirname, '..', '..', 'messages', 'hi.json'), 'utf8'));

describe('Mark all present, before the shift has started', () => {
  it('gives now as the in-time when the shift start is still ahead today', () => {
    expect(markAllInTime('09:00', '08:45')).toBe('08:45');
  });
  it('gives the shift start once it has passed, and always on a past day', () => {
    expect(markAllInTime('09:00', '09:00')).toBe('09:00');
    expect(markAllInTime('09:00', '13:10')).toBe('09:00');
    expect(markAllInTime('09:00', null)).toBe('09:00');
    expect(markAllInTime(null, '08:45')).toBeNull();
  });
  it('is what the register sends', () => {
    expect(read('attendance/AttendanceRegister.tsx')).toMatch(/inTime: markAllInTime\(row\.shiftStart, nowHm\)/);
  });
});

describe("the invoice page's Print", () => {
  it('opens the document without noopener, which would hand back null and read as a blocked pop-up', () => {
    const viewer = read('documents/[id]/DocumentViewer.tsx');
    expect(viewer).not.toMatch(/window\.open\([^)]*noopener/);
    expect(viewer).toMatch(/w\.opener = null/);
    expect(viewer).toMatch(/w\.print\(\)/);
  });
});

describe("the vertical's nouns in Hindi", () => {
  it('every vertical noun has a Hindi word, and English keeps its own', () => {
    expect(Object.keys(hi.verticalNouns).sort()).toEqual(Object.keys(en.verticalNouns).sort());
    for (const [word, said] of Object.entries(en.verticalNouns)) expect(said).toBe(word);
    for (const said of Object.values(hi.verticalNouns) as string[]) expect(said).toMatch(/[ऀ-ॿ]/);
  });
  it('a salon in Hindi says ग्राहक and स्टाइलिस्ट, and a word of the business’s own stays as typed', () => {
    const labels = { customer: 'Client', provider: 'Stylist', resource: 'Mirror station' };
    expect(nounsIn(labels, hi.verticalNouns)).toEqual({ customer: 'ग्राहक', provider: 'स्टाइलिस्ट', resource: 'Mirror station' });
    expect(nounsIn(labels, undefined)).toEqual(labels);
  });
  it('the layout hands the translated nouns to every screen', () => {
    expect(read('layout.tsx')).toMatch(/<LabelsProvider labels=\{nounsIn\(labels, /);
  });
});

describe('Record payment with points used', () => {
  it('says "To pay" for what is left, not a second "Total"', () => {
    const flow = read('appointments/new/PayFlow.tsx');
    expect(flow).toMatch(/<p className="pf-wide-due">[\s\S]{0,200}t\('toPay'\)/);
    expect(en.payFlow.toPay).toBe('To pay');
    expect(hi.payFlow.toPay).toBe('देना है');
  });
});

describe('the package preview', () => {
  it('draws the WhatsApp icon, not an emoji', () => {
    expect(JSON.stringify(en)).not.toContain('📲');
    expect(JSON.stringify(hi)).not.toContain('📲');
    expect(read('packages/PackageBuilder.tsx')).toMatch(/<div className="preview-caption">\s*<IconWhatsApp \/>/);
  });
});
