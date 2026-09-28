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
    exclude: ['**/node_modules/**', '**/.next/**'],
    environment: 'node',
  },
});
