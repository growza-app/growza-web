import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Jira GRW-373 — where the dashboard is rooted, in whichever repo this is.
 *
 * The dashboard's source lives in two places until `growza/web` is retired: at
 * `web/` inside the growza monorepo, and at the root of growza-web. Tests that
 * read a component's source had the monorepo's answer written into them —
 * `'web/app/(tenant)'`, `'web/messages'`, `'web/public/sw.js'` — and were
 * relative to the working directory besides, so they passed in growza and
 * could not run at all in growza-web, where they were nine of the ninety-three
 * files excluded to get that repo's first CI green.
 *
 * This is computed from THIS file's own location rather than from `cwd`, so it
 * is the same answer however the suite is invoked: three levels up from
 * `app/(tenant)/lib/` is the directory holding `app/`. In growza that is
 * `web/`; in growza-web it is the repository root. Nothing needs to know which
 * it is in, which is the point — the same test file serves both, and keeps
 * serving after GRW-373 deletes one of them.
 *
 * Importable from any depth: it reports where IT is, not where the caller is.
 */
export const DASHBOARD_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** A path inside the dashboard, e.g. `fromDashboard('public/sw.js')`. */
export const fromDashboard = (...segments: string[]): string => path.join(DASHBOARD_ROOT, ...segments);
