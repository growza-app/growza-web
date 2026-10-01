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
    /*
     * `deploy/` is Jira GRW-372: this repository's own deploy workflow, which
     * has no counterpart in growza's `web/` and so deliberately lives outside
     * `app/` — like the Dockerfile, .npmrc and ci.yml.
     */
    include: ['app/**/*.test.ts', 'i18n/**/*.test.ts', 'deploy/**/*.test.ts'],
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
       * Seven of the nine are GONE from this list as of Jira GRW-373: a
       * `dashboard-root.ts` helper made them compute the dashboard's location
       * from their own, so the same file now serves both repos. These two
       * cannot follow yet:
       *
       *   device-spec-locators  reads test/devices/*.spec.ts — portable once
       *                         GRW-374 moves the device specs here
       *   api-messages          reads the API's src/. It asserts the dashboard
       *                         and the API agree, so after growza/web is
       *                         deleted it has a home in NEITHER repo. That is
       *                         a decision, not a path fix.
       */
      'app/(tenant)/components/device-spec-locators.test.ts',
      'app/(tenant)/lib/api-messages.test.ts',
    ],
    environment: 'node',
  },
});
