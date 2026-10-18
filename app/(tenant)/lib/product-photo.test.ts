import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProductPhoto } from '../components/ProductPhoto';

/**
 * Owner, 2026-10-18 — "on the sell product page, where do these images come from, this is not good". A product with
 * no photo drew `/service-photos/default.jpg`, a picture of a salon's interior, on every tile of the till.
 */
describe('a product with no photo', () => {
  it('draws an empty tile with a bottle, not a stock photograph', () => {
    const html = renderToStaticMarkup(createElement(ProductPhoto, { className: 'pf-tile-photo', product: { imageUrl: null } }));
    expect(html).not.toContain('<img');
    expect(html).not.toContain('service-photos');
    expect(html).toContain('class="pf-tile-photo photo-none"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('<svg');
  });

  it('draws its own upload when it has one', () => {
    const html = renderToStaticMarkup(createElement(ProductPhoto, { className: 'prd-photo', product: { imageUrl: '/uploads/p/abc.webp' } }));
    expect(html).toContain('<img');
    expect(html).toContain('src="/uploads/p/abc.webp"');
  });

  it('is the only way a product picture is drawn: no screen reaches for the placeholder file', () => {
    // Every source file under app/, not a list of the ones that exist today: a new screen is covered the day it lands.
    const root = fileURLToPath(new URL('../..', import.meta.url));
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = join(dir, e.name);
        if (e.isDirectory()) return e.name === 'node_modules' || e.name === '.next' ? [] : walk(full);
        return /\.tsx?$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [full] : [];
      });
    const offenders = walk(root).filter((f) => !f.endsWith(join('lib', 'service-photos.ts')) && !f.endsWith('ProductPhoto.tsx') && /productPhotoUrl|default\.jpg/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('keeps the product sheet\'s header picture eager, since it is on screen when the sheet opens', () => {
    const html = renderToStaticMarkup(createElement(ProductPhoto, { className: 'prd-sheet-photo', product: { imageUrl: '/uploads/p/a.webp' }, eager: true }));
    expect(html).toContain('loading="eager"');
  });
});
