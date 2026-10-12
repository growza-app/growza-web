import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { genericFailureMessage } from './api-messages';

/**
 * A response that comes back with no sentence — a proxy's 502, a dropped connection's empty body — used to be
 * shown to the owner as the request path and status (`/api/v1/service-categories/… failed: 502`), inside their
 * own sheet. It is a sentence now, in the language of the page.
 */
describe('the sentence for a failure that came back with none', () => {
  it('is a sentence in both languages, never a request path', () => {
    for (const lang of ['en', 'hi']) {
      const said = genericFailureMessage(lang);
      expect(said).not.toMatch(/\/api\/|failed: \d/);
      expect(said.length).toBeGreaterThan(10);
    }
    expect(genericFailureMessage('hi')).not.toBe(genericFailureMessage('en'));
  });

  it('is what the request wrapper falls back to', () => {
    const api = readFileSync(join(__dirname, 'api.ts'), 'utf8');
    expect(api).toContain('genericFailureMessage(lang)');
    expect(api).not.toMatch(/\$\{path\} failed: \$\{res\.status\}/);
  });
});
