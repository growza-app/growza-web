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
const table = readFileSync(fromDashboard('app/(tenant)/services/ServicesTable.tsx'), 'utf-8');
const rows = readFileSync(fromDashboard('app/(tenant)/services/ServiceRows.tsx'), 'utf-8');

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

/**
 * Owner, 2026-10-11 — the pack is reachable from the Services LIST, which is where an owner works.
 *
 * The picker shipped inside Edit service and nowhere else, while the list's ··· menu clicked the file input
 * directly. So an owner who only ever used the list met one thing, every time: a file dialog. They reported
 * the pack as missing, and from where they were standing it was.
 */
describe('the Services list', () => {
  it('opens the pack from the row menu, not the file chooser', () => {
    expect(table).toMatch(/const askPhoto = \(service: ServiceAdmin\) => setPackFor\(service\);/);
    expect(table).toContain('<PackPhotoSheet');
    expect(table).toMatch(/current=\{packFor\.catalogKey \?\? null\}/);
  });

  it('saves the pick against the service and moves the row’s own thumbnail with it', () => {
    expect(table).toMatch(/await api\.updateService\(service\.id, \{ catalogKey \}\)/);
    // The thumbnail reads `catalogKey`; without this the list keeps the old picture until a reload.
    expect(table).toMatch(/catalogKey: updated\.catalogKey \?\? catalogKey/);
  });

  it('still reaches the owner’s own upload, from inside the sheet', () => {
    expect(sheet).toMatch(/onUpload\?: \(\) => void;/);
    expect(sheet).toMatch(/\{t\('upload'\)\}/);
    // The sheet closes before the OS dialog opens, or the owner comes back to a modal over nothing.
    expect(table).toMatch(/setPackFor\(null\);\s*\n\s*setPhotoFor\(service\);\s*\n\s*photoInput\.current\?\.click\(\);/);
  });

  it('says Change, not Add, while a picture is already showing', () => {
    // Most services show one without any upload: the pack answers for the concept (GRW-560).
    expect(rows).toMatch(/hasServicePhoto\(service\) \? t\('menu\.changePhoto'\) : t\('menu\.addPhoto'\)/);
    expect(form).toMatch(/photo \|\| imageUrl \|\| shownKey \? t\('changePhoto'\) : t\('addPhoto'\)/);
  });

  it('has the upload label in both languages', () => {
    for (const messages of [en, hi]) {
      const pack = (messages as { services: { form: { pack: Record<string, unknown> } } }).services.form.pack;
      expect(typeof pack.upload).toBe('string');
      expect((pack.upload as string).trim()).not.toBe('');
    }
  });
});
