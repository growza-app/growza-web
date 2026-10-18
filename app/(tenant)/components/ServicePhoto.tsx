import { servicePhotoUrl } from '../lib/service-photos';
import { IconScissors } from './icons';

/**
 * Owner, 2026-10-18 — a service's picture: its own upload, else the pack's photograph of the concept, else an
 * empty tile with a pair of scissors on it.
 *
 * The last step used to be a stock photograph by category, and under that a salon interior. A service the pack has
 * no concept for (or one outside Hair, Skin and Nails) then showed somebody else's room, and a Hair service with no
 * photograph showed a haircut that was not the service. A blank tile says "no picture yet" and is never wrong.
 *
 * `className` is the screen's own photo class (size and radius). Where a screen sizes the picture by attributes
 * instead, `size` gives the same box to the empty tile.
 */
export function ServicePhoto({
  service,
  className,
  size,
  eager = false,
}: {
  service: Parameters<typeof servicePhotoUrl>[0];
  className?: string;
  size?: number;
  eager?: boolean;
}) {
  const src = servicePhotoUrl(service);
  if (src) return <img className={className} src={src} alt="" width={size} height={size} loading={eager ? 'eager' : 'lazy'} />;
  return (
    <span className={`${className ? `${className} ` : ''}photo-none`} style={size ? { width: size, height: size } : undefined} aria-hidden="true">
      <IconScissors />
    </span>
  );
}
