import { defineConfig } from 'vitest/config';

/**
 * Jira GRW-420 — this repo's own test runner.
 *
 * It arrived carrying 78 `.test.ts` files and no way to run them: `vitest` was
 * a devDependency of the monorepo ROOT, and the split took only
 * `web/package.json`. They have therefore never run here, and they were also
 * failing the typecheck, because `vitest` and `node:*` had no types.
 *
 * No `@growza-app/shared` alias, unlike growza's config. There it is aliased to
 * `shared/src` so a change to shared is tested without a build; here it is a
 * real dependency installed from GitHub Packages, so the tests exercise the
 * published package — which is the thing this repo actually ships against.
 */
export default defineConfig({
  test: {
    include: ['app/**/*.test.ts', 'i18n/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/.next/**',
      /*
       * These two read growza's `e2e/matrix.ts`, which is not in this repo.
       * Jira GRW-374 is the story that moves the device matrix here; until it
       * does, they cannot run or typecheck, and excluding them is honest where
       * deleting them would lose the coverage growza still gets from them.
       */
      'app/admin/lib/list-tables-fit.test.ts',
      'app/(tenant)/settings/settings-fit.test.ts',
      /*
       * These nine read the dashboard's own files through MONOREPO paths —
       * 'web/app/...', 'web/messages', 'web/public/sw.js' — or scan growza's
       * `src/` and `test/devices/`. They were written to run from the root of
       * growza, where the dashboard sits at `web/`. Here it IS the root, so
       * every one of those paths is wrong by a directory.
       *
       * Excluded rather than edited, deliberately: the files themselves must
       * stay byte-identical to growza's copies or the drift GRW-419 just fixed
       * starts again. This config file exists only in this repo, so the
       * exclusion lives somewhere it cannot cause divergence. growza still runs
       * all nine, so no coverage is lost today.
       *
       * The real fix is to make the paths root-aware so one file works in both
       * repos — and it has to happen before GRW-373 deletes growza/web, or the
       * coverage goes with it.
       */
      'app/(tenant)/components/booking-sheet-actions.test.ts',
      'app/(tenant)/components/device-spec-locators.test.ts',
      'app/(tenant)/lib/api-messages.test.ts',
      'app/(tenant)/lib/i18n-guard.test.ts',
      'app/(tenant)/lib/service-worker.test.ts',
      'app/(tenant)/lib/title-coverage.test.ts',
      'app/(tenant)/lib/ui-actions.test.ts',
      'app/(tenant)/providers/create-saves-everything.test.ts',
      'i18n/i18n.test.ts',
    ],
    environment: 'node',
  },
});
