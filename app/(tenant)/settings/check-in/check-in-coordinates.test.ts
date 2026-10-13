import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { pinFromText } from '../../lib/geo-fix';

const here = path.dirname(fileURLToPath(import.meta.url));
const form = readFileSync(path.join(here, 'CheckInForm.tsx'), 'utf-8');
const css = readFileSync(path.join(here, '../../styles/88-check-in.css'), 'utf-8');

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
