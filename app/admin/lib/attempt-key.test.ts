import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { newAttemptKey } from './attempt-key';

describe('attempt key', () => {
  it('fits what the API accepts and differs each time', () => {
    const a = newAttemptKey();
    expect(a).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(newAttemptKey()).not.toBe(a);
  });

  it('both payment forms make one per opening, never from crypto.randomUUID (undefined on plain http)', () => {
    for (const file of ['RecordPaymentModal.tsx', 'ReenrolModal.tsx']) {
      const src = readFileSync(new URL(`../components/${file}`, import.meta.url), 'utf8');
      expect(src, file).not.toContain('randomUUID');
      expect(src, file).toContain('newAttemptKey()');
      expect(src, file).toMatch(/reference\.trim\(\) === '' && method !== 'cash'/);
    }
  });
});
