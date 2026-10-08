import { notFound } from 'next/navigation';
import { screenTitle } from '../lib/page-title';
import { guardScreen } from '../lib/screen-guard';

export const metadata = screenTitle('Page not found');

/**
 * An address that matches no screen (a stale bookmark, a mistyped link) lands in the app's own "not found"
 * (`../not-found.tsx`: the shell, the page's language, a way Home). Without this catch-all Next answers an unmatched
 * URL itself with a bare black "404 | This page could not be found." that has neither.
 *
 * It asks the same question every screen does, so a role with a short menu is sent Home rather than told which
 * addresses exist.
 */
export default async function UnknownAddress() {
  await guardScreen('/[...rest]');
  notFound();
}
