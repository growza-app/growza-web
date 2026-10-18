import Link from 'next/link';
import type { ComponentProps } from 'react';

/**
 * Every link in the dashboard — `next/link` with prefetching OFF.
 *
 * `next/link` prefetches the page it points to as soon as the link scrolls into view, and for these pages that is not
 * a cheap static file: each one is a server render of the target route's layouts, which reads `/api/v1/me` and the
 * live-version probe from the database — for a page nobody has opened. Measured on a phone-size load: the account
 * menu alone (Profile, Try WhatsApp), present on every screen, fired five to six of them per page, and the
 * notification feed fired nine for `/appointments`. One screen that costs 20 queries to open was costing 60 more to
 * sit on.
 *
 * Navigation still works exactly as before; the page is fetched when it is tapped, which is when it is needed.
 * A link that earns its prefetch can say `prefetch` itself — it is passed through after the default.
 *
 * Use this and not `next/link`: `shared/app-link.test.ts` fails if any file imports `next/link` directly.
 */
export default function AppLink(props: ComponentProps<typeof Link>) {
  return <Link prefetch={false} {...props} />;
}
