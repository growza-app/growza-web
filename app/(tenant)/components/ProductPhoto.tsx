import type { Product } from '../lib/api-types';
import { IconProducts } from './icons';

/**
 * Owner, 2026-10-18 — a product's picture: its own upload, or a plain tile with a bottle on it.
 *
 * It used to fall back to `/service-photos/default.jpg`, a photograph of a salon's interior, so a shelf of twenty
 * products that nobody had photographed showed the same room twenty times, on the till and in production. A
 * product has no pack and no category photo to fall back on; an honest empty tile says "no picture yet".
 *
 * `className` is the screen's own photo class (it carries the size and the radius), so the empty tile and the
 * picture take exactly the same room. Lists and tiles load their pictures lazily; a header that is on screen the
 * moment its sheet opens passes `eager`.
 */
export function ProductPhoto({ product, className, eager = false }: { product: Pick<Product, 'imageUrl'>; className: string; eager?: boolean }) {
  if (product.imageUrl) return <img className={className} src={product.imageUrl} alt="" loading={eager ? 'eager' : 'lazy'} />;
  return (
    <span className={`${className} photo-none`} aria-hidden="true">
      <IconProducts />
    </span>
  );
}
