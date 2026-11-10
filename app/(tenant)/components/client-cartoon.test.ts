import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cartoonFor } from './ClientCartoon';

/** Owner, 10 Nov 2026 — clients get a cartoon face instead of initials, chosen from their id and never from a guess at gender. */
const src = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('a client cartoon', () => {
  it('is the same face for the same client, every time', () => {
    expect(cartoonFor('c3a1f0d2-5b7e-4c1a-9f00-1a2b3c4d5e6f')).toEqual(cartoonFor('c3a1f0d2-5b7e-4c1a-9f00-1a2b3c4d5e6f'));
  });

  it('a page of clients is not all one face', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `0000000${i}-aaaa-4bbb-8ccc-${String(i * 7919).padStart(12, '0')}`);
    const faces = new Set(ids.map((id) => JSON.stringify(cartoonFor(id))));
    expect(faces.size).toBeGreaterThanOrEqual(8);
    const hair = new Set(ids.map((id) => cartoonFor(id).hair));
    expect(hair.size).toBeGreaterThanOrEqual(3);
  });

  it('is picked from the id alone — nothing reads the name', () => {
    const cartoon = src('ClientCartoon.tsx');
    expect(cartoon).toContain('export function ClientCartoon({ id, className }: { id: string; className: string })');
    expect(cartoon.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/\bname\b/);
  });

  it('replaces the initials on the Customers list, the desk table and the client card', () => {
    const list = src('../customers/CustomersClient.tsx');
    expect(list).toContain('<ClientCartoon id={c.id} className="cust-avatar" />');
    expect(list).toContain('<ClientCartoon id={c.id} className="avatar" />');
    expect(src('ClientProfileCard.tsx')).toContain('<ClientCartoon id={clientId} className="cpc-avatar" />');
  });
});
