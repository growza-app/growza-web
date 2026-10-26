import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { pinFromText } from '../../lib/geo-fix';

const here = path.dirname(fileURLToPath(import.meta.url));
const form = readFileSync(path.join(here, 'CheckInForm.tsx'), 'utf-8');
const css = readFileSync(path.join(here, '../../styles/88-check-in.css'), 'utf-8');

/*
 * A pin is only as good as the fix behind it. A phone indoors can answer from wifi or a cell tower,
 * hundreds of metres out and sounding certain — and a fence drawn around that point sends every stylist
 * who stands in the right place to the owner for approval. She is warned, never blocked: the rough pin
 * may be the best her phone will give her.
 */
describe('a pin the phone is not sure of', () => {
  const messages = (locale: string) => JSON.parse(readFileSync(path.join(here, `../../../../messages/${locale}.json`), 'utf-8')) as Record<string, Record<string, string>>;

  it('warns above 50 m, and says how rough the spot is', () => {
    expect(form).toContain('const VAGUE_PIN_M = 50;');
    expect(form).toMatch(/accuracyM != null && accuracyM > VAGUE_PIN_M/);
    expect(form).toContain("t('vaguePin', { m: accuracyM })");
  });

  it('does not block the save — there is no disabled, no refusal, only the line', () => {
    const warning = form.slice(form.indexOf('ci-vague'), form.indexOf('ci-pin-actions'));
    expect(warning).not.toMatch(/disabled|setError|return/);
  });

  it('is amber and readable, like the other thing that needs a look rather than a fix', () => {
    expect(css).toMatch(/\.ci-vague \{[^}]*background: #fdf6ec/);
    expect(css).toMatch(/\.ci-vague \{[^}]*color: var\(--amber-ink\)/);
  });

  it('is announced to a screen reader without stealing focus', () => {
    expect(form).toMatch(/className="ci-vague" role="status"/);
  });

  it('is written in both languages, and both carry the metres', () => {
    for (const locale of ['en', 'hi']) {
      const copy = messages(locale).settingsCheckIn?.vaguePin;
      expect(copy, locale).toBeTruthy();
      expect(copy, locale).toContain('{m}');
    }
  });
});

describe('Location check-in shows and accepts the pin as numbers', () => {
  it('prints the saved coordinates and the phone accuracy', () => {
    expect(form).toContain('pin.lat.toFixed(6)');
    expect(form).toContain("t('accuracy'");
  });

  it('has latitude and longitude boxes that feed the same pin', () => {
    expect(form).toContain("t('latLabel')");
    expect(form).toContain("t('lngLabel')");
    expect(form).toContain('coordsChanged(');
    expect(form).toContain("t('errors.badCoords')");
  });

  it('keeps both switches on the same line-height rule so they align', () => {
    expect(css).toMatch(/\.ci-switch-row \.switch \{[^}]*height: 1\.5rem/);
    expect(css).toMatch(/\.ci-switch-title \{[^}]*line-height: 1\.5rem/);
  });

  it('still reads "lat, lng" typed by hand', () => {
    expect(pinFromText('12.971599, 77.594566')).toEqual({ lat: 12.971599, lng: 77.594566 });
    expect(pinFromText('91, 10')).toBeNull();
  });
});
