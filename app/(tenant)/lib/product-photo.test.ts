import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProductPhoto } from '../components/ProductPhoto';
import { ServicePhoto } from '../components/ServicePhoto';

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

  it('is the only way a product or service picture is drawn: no screen reaches for a stock photo file', () => {
    // Every source file under app/, not a list of the ones that exist today: a new screen is covered the day it lands.
    const root = fileURLToPath(new URL('../..', import.meta.url));
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = join(dir, e.name);
        if (e.isDirectory()) return e.name === 'node_modules' || e.name === '.next' ? [] : walk(full);
        return /\.tsx?$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [full] : [];
      });
    const offenders = walk(root).filter((f) => !f.endsWith(join('lib', 'service-photos.ts')) && !f.endsWith('ProductPhoto.tsx') && /productPhotoUrl|default\.jpg|\/service-photos\//.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
    expect(existsSync(join(root, '../public/service-photos'))).toBe(false);
  });

  it('keeps the product sheet\'s header picture eager, since it is on screen when the sheet opens', () => {
    const html = renderToStaticMarkup(createElement(ProductPhoto, { className: 'prd-sheet-photo', product: { imageUrl: '/uploads/p/a.webp' }, eager: true }));
    expect(html).toContain('loading="eager"');
  });
});

describe('a service with no photo (owner, 2026-10-18)', () => {
  it('draws an empty tile with scissors, not a stock photograph', () => {
    const html = renderToStaticMarkup(createElement(ServicePhoto, { className: 'pf-tile-photo', service: { imageUrl: null, catalogKey: null } }));
    expect(html).not.toContain('<img');
    expect(html).toContain('class="pf-tile-photo photo-none"');
    expect(html).toContain('<svg');
  });

  it('gives the empty tile the same box a sized picture takes', () => {
    const html = renderToStaticMarkup(createElement(ServicePhoto, { service: { imageUrl: null, catalogKey: null }, size: 44 }));
    expect(html).toContain('width:44px;height:44px');
  });

  it('draws the pack\'s photograph, and the owner\'s upload over it', () => {
    expect(renderToStaticMarkup(createElement(ServicePhoto, { className: 'x', service: { imageUrl: null, catalogKey: 'haircut' } }))).toContain('src="/catalog/haircut.webp"');
    expect(renderToStaticMarkup(createElement(ServicePhoto, { className: 'x', service: { imageUrl: '/uploads/a.webp', catalogKey: 'haircut' } }))).toContain('src="/uploads/a.webp"');
  });
});

/**
 * Owner, 2026-10-19 — the empty tile moves a little. It has to stay cheap and stay quiet: finite, off for reduced
 * motion, compositor-only, drawn from code (no image file, so nothing per business), and in a sheet of its own that
 * loads after the screens' photo classes.
 */
describe('the empty tile\'s animation', () => {
  const css = readFileSync(new URL('../styles/99-photo-none.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('plays a few times and stops — never infinite', () => {
    expect(css).toMatch(/animation:\s*photo-sweep\b[^;]*\s\d+;/);
    expect(css).not.toMatch(/animation:[^;]*infinite/);
  });

  it('has an answer for reduced motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.photo-none::after \{\s*animation: none;/);
  });

  it('moves only transform, so nothing is laid out again', () => {
    const frames = /@keyframes photo-sweep \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    const props = [...frames.matchAll(/^\s*([a-z-]+):/gm)].map((m) => m[1] ?? '').filter((p) => !['to', 'from'].includes(p));
    expect([...new Set(props)]).toEqual(['transform']);
  });

  it('is an inline icon, not a file: the component never names an image path', () => {
    for (const f of ['../components/ProductPhoto.tsx', '../components/ServicePhoto.tsx']) {
      expect(readFileSync(new URL(f, import.meta.url), 'utf8')).not.toMatch(/\.(png|jpe?g|gif|webp|svg)['"]/);
    }
  });

  it('is loaded after every screen sheet, so its display:flex beats a photo class that says display:block', () => {
    const globals = readFileSync(new URL('../globals.css', import.meta.url), 'utf8');
    const imports = [...globals.matchAll(/@import '\.\/styles\/([^']+)';/g)].map((m) => m[1]);
    expect(imports.at(-1)).toBe('99-photo-none.css');
    expect(readFileSync(new URL('../styles/96-products.css', import.meta.url), 'utf8')).not.toContain('.photo-none');
  });
});
