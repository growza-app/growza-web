import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromDashboard } from '../lib/dashboard-root';
import { PACK_KEY_LIST } from '../lib/service-photos';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';

/**
 * The owner picks a service's picture from the supplied pack.
 *
 * A name the matcher does not know (a brand, a local word) gets no picture by itself, and a list of names will
 * never keep up. So the owner chooses, and the choice is saved as the service's `catalogKey`.
 */
const form = readFileSync(fromDashboard('app/(tenant)/services/ServiceForm.tsx'), 'utf-8');
const sheet = readFileSync(fromDashboard('app/(tenant)/services/PackPhotoSheet.tsx'), 'utf-8');

describe('every picture in the pack can be picked, in both languages', () => {
  it.each([
    ['en', en],
    ['hi', hi],
  ])('has a name for each one in %s', (_lang, messages) => {
    const labels = (messages as { services: { form: { pack: { labels: Record<string, string> } } } }).services.form.pack.labels;
    expect(Object.keys(labels).sort()).toEqual([...PACK_KEY_LIST].sort());
    for (const key of PACK_KEY_LIST) expect(labels[key]!.trim(), key).not.toBe('');
  });
});

describe('the service form', () => {
  it('sends the pick on save, and nothing when the owner did not touch it', () => {
    expect(form).toMatch(/pickedKey !== undefined \? \{ catalogKey: pickedKey \} : \{\}/);
  });

  it('puts the pick on a new service right after it is created, because create takes no key', () => {
    expect(form).toMatch(/!service && pickedKey\) saved = await api\.updateService\(saved\.id, \{ catalogKey: pickedKey \}\)/);
  });

  it('lets Save go live for a pick alone', () => {
    expect(form).toMatch(/hasNewPhoto: photo !== null \|\| pickedKey !== undefined/);
  });

  it('keeps the owner’s own upload ahead of a pick', () => {
    expect(form).toMatch(/imageUrl === null && pickedKey/);
  });
});

describe('the picking sheet', () => {
  it('shows only pictures the pack has', () => {
    expect(sheet).toContain('PACK_KEY_LIST.map');
    expect(sheet).toContain('packPhotoUrl(key)');
  });

  it('does not let a tap inside it reach the form behind', () => {
    expect(sheet).toContain('e.stopPropagation()');
  });
});
