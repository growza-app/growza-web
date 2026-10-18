import { readFileSync } from 'node:fs';
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
    const files = [
      '../appointments/new/DeskServiceGrid.tsx',
      '../appointments/new/PayFlow.tsx',
      '../components/ServiceSheet.tsx',
      '../products/ProductsList.tsx',
      '../products/ProductSheet.tsx',
      '../products/StockTake.tsx',
    ];
    for (const f of files) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8');
      expect(src, f).not.toMatch(/productPhotoUrl|default\.jpg/);
    }
  });
});
