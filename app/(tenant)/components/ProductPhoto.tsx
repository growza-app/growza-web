import type { Product } from '../lib/api-types';
import { IconProducts } from './icons';

export type ProductGraphicKind =
  | 'shirt'
  | 'blazer'
  | 'trousers'
  | 'tie'
  | 'belt'
  | 'backpack'
  | 'handbag'
  | 'shoes'
  | 'socks'
  | 'bottle';

export type ProductGraphicTone = 'green' | 'blue' | 'amber' | 'purple' | 'rose';

const TONES: readonly ProductGraphicTone[] = ['green', 'blue', 'amber', 'purple', 'rose'];

/**
 * Matches a product's name and category to an illustrated inline SVG graphic and a soft colour family,
 * so a shelf or till with no uploaded photographs still looks visual and scannable at a glance.
 * Vertical-neutral: covers apparel, bags, accessories, footwear, bottles/cosmetics, and general retail.
 */
export function resolveProductGraphic(product: {
  name?: string | null;
  categoryName?: string | null;
}): { kind: ProductGraphicKind; tone: ProductGraphicTone } {
  const hay = `${product.name ?? ''} ${product.categoryName ?? ''}`.toLowerCase();

  if (/\b(belt|strap|buckle)s?\b/.test(hay)) return { kind: 'belt', tone: 'amber' };
  if (/\b(tie|necktie|cravat|lanyard|ribbon)s?\b/.test(hay)) return { kind: 'tie', tone: 'rose' };
  if (/\b(fancy\s*bag|hand\s*bag|tote|purse|pouch|clutch|duffel)s?\b/.test(hay)) return { kind: 'handbag', tone: 'purple' };
  if (/\b(bag|backpack|rucksack|satchel|kitbag)s?\b/.test(hay)) return { kind: 'backpack', tone: 'blue' };
  if (/\b(blazer|coat|jacket|sweater|cardigan|hoodie|vest|waistcoat)s?\b/.test(hay)) return { kind: 'blazer', tone: 'purple' };
  if (/\b(trouser|pant|jean|short|skirt|chino|legging|bottom|lower|trackpant)s?\b/.test(hay)) return { kind: 'trousers', tone: 'blue' };
  if (/\b(shoe|sneaker|boot|sandal|loafer|footwear|slipper|canvas)(es|s)?\b/.test(hay)) return { kind: 'shoes', tone: 'amber' };
  if (/\b(sock|stocking|anklet|cap|hat|badge|crest|glove|scarf|scarves)s?\b/.test(hay)) return { kind: 'socks', tone: 'rose' };
  if (/\b(bottle|flask|sipper|shampoo|conditioner|serum|oil|cream|lotion|wash|gel|spray|toner|mask)s?\b/.test(hay)) {
    return { kind: 'bottle', tone: 'blue' };
  }
  if (/\b(shirt|t-shirt|tee|top|kurta|kurti|blouse|tunic|polo|jersey|uniform)s?\b/.test(hay)) return { kind: 'shirt', tone: 'green' };

  // Deterministic colour fallback from the product's name so unphotographed items stay distinct
  let hash = 0;
  for (let i = 0; i < hay.length; i += 1) {
    hash = (hash * 31 + hay.charCodeAt(i)) >>> 0;
  }
  const tone = hay.trim().length > 0 ? TONES[hash % TONES.length]! : 'green';
  return { kind: 'bottle', tone };
}

function GraphicSvg({ kind }: { kind: ProductGraphicKind }) {
  const base = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.85,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (kind) {
    case 'shirt':
      return (
        <svg {...base}>
          <path d="M8 4h8l4 4-2.5 3L15 9v11H9V9L6.5 11 4 8l4-4Z" fill="currentColor" fillOpacity="0.16" />
          <path d="M9.5 4 12 7l2.5-3" />
          <line x1="12" y1="7" x2="12" y2="16" />
        </svg>
      );
    case 'blazer':
      return (
        <svg {...base}>
          <path d="M7.5 4h9L20 8.5l-2.5 2.5L16 9.5V20H8V9.5L6.5 11 4 8.5 7.5 4Z" fill="currentColor" fillOpacity="0.16" />
          <path d="M9.5 4 12 10.5 14.5 4" />
          <line x1="12" y1="10.5" x2="12" y2="20" />
          <circle cx="10.5" cy="14" r="0.6" fill="currentColor" />
          <circle cx="10.5" cy="16.5" r="0.6" fill="currentColor" />
        </svg>
      );
    case 'trousers':
      return (
        <svg {...base}>
          <path d="M7 4h10l1 16h-4.2L12 10.5 10.2 20H6L7 4Z" fill="currentColor" fillOpacity="0.16" />
          <line x1="7" y1="7" x2="17" y2="7" />
          <line x1="12" y1="4" x2="12" y2="7" />
        </svg>
      );
    case 'tie':
      return (
        <svg {...base}>
          <path d="M9.5 4h5l-1 3.5h-3L9.5 4Z" fill="currentColor" fillOpacity="0.2" />
          <path d="M10.5 7.5h3L15 17l-3 3.5L9 17l1.5-9.5Z" fill="currentColor" fillOpacity="0.15" />
          <line x1="10.2" y1="12" x2="13.8" y2="10.5" />
          <line x1="9.8" y1="15.5" x2="14.2" y2="14" />
        </svg>
      );
    case 'belt':
      return (
        <svg {...base}>
          <rect x="2" y="9" width="20" height="6" rx="1.5" fill="currentColor" fillOpacity="0.16" />
          <rect x="7.5" y="7.5" width="6" height="9" rx="1.5" />
          <line x1="10.5" y1="12" x2="13.5" y2="12" />
          <circle cx="16.8" cy="12" r="0.7" fill="currentColor" />
          <circle cx="19" cy="12" r="0.7" fill="currentColor" />
        </svg>
      );
    case 'backpack':
      return (
        <svg {...base}>
          <rect x="5" y="6" width="14" height="15" rx="4" fill="currentColor" fillOpacity="0.16" />
          <path d="M9 6V4.5a3 3 0 0 1 6 0V6" />
          <rect x="8" y="13" width="8" height="5" rx="1.5" />
          <line x1="9" y1="10" x2="15" y2="10" />
        </svg>
      );
    case 'handbag':
      return (
        <svg {...base}>
          <path d="M5 8h14l-1.2 12a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z" fill="currentColor" fillOpacity="0.16" />
          <path d="M8.5 8V6a3.5 3.5 0 0 1 7 0v2" />
          <path d="M9 12h6" />
        </svg>
      );
    case 'shoes':
      return (
        <svg {...base}>
          <path d="M4 15.5V9l4 1 3.5 3.5L18 14a2.5 2.5 0 0 1 2.5 2.5V18H4v-2.5Z" fill="currentColor" fillOpacity="0.16" />
          <line x1="4" y1="18" x2="20.5" y2="18" />
          <line x1="8.5" y1="11.5" x2="10" y2="10" />
          <line x1="10.5" y1="13" x2="12" y2="11.5" />
        </svg>
      );
    case 'socks':
      return (
        <svg {...base}>
          <path d="M10 4h5v8.5c0 2-1.2 3.2-3 4.2l-2.5 1.3a2.5 2.5 0 0 1-3.5-2.2c0-1 .6-1.9 1.5-2.3L10 12V4Z" fill="currentColor" fillOpacity="0.16" />
          <line x1="10" y1="7" x2="15" y2="7" />
        </svg>
      );
    case 'bottle':
    default:
      return <IconProducts />;
  }
}

/**
 * Owner, 2026-10-18 — a product's picture: its own upload, or a plain tile with a bottle on it.
 *
 * It used to fall back to `/service-photos/default.jpg`, a photograph of a salon's interior, so a shelf of twenty
 * products that nobody had photographed showed the same room twenty times, on the till and in production. A
 * product has no pack and no category photo to fall back on; an honest empty tile says "no picture yet".
 *
 * Owner, 2026-10-22 — when no photo is uploaded and the product has a name or category, `resolveProductGraphic`
 * picks an illustrated inline SVG graphic and a soft colour backdrop so the shelf and POS grid stay scannable.
 *
 * `className` is the screen's own photo class (it carries the size and the radius), so the empty tile and the
 * picture take exactly the same room. Lists and tiles load their pictures lazily; a header that is on screen the
 * moment its sheet opens passes `eager`.
 */
export function ProductPhoto({
  product,
  className,
  eager = false,
}: {
  product: Pick<Product, 'imageUrl'> & { name?: string | null; categoryName?: string | null };
  className: string;
  eager?: boolean;
}) {
  if (product.imageUrl) return <img className={className} src={product.imageUrl} alt="" loading={eager ? 'eager' : 'lazy'} />;
  const { kind, tone } = resolveProductGraphic(product);
  const hasName = Boolean(product.name?.trim() || product.categoryName?.trim());
  const toneClass = hasName ? ` photo-tone-${tone} photo-kind-${kind}` : '';
  return (
    <span className={`${className} photo-none${toneClass}`} aria-hidden="true">
      <GraphicSvg kind={kind} />
    </span>
  );
}
