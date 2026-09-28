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
    ],
    environment: 'node',
  },
});
