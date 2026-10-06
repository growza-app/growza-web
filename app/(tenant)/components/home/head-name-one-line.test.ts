import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-509 — the business name in Home's header is one line ending in an ellipsis, on a phone.
 * It was clamped to two lines (GRW-306); the owner asked for truncation, like every screen title.
 */
const css = readFileSync(resolve(__dirname, '../../styles/83-role-home.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe("Home's business name", () => {
  it('stays on one line and ends in an ellipsis', () => {
    expect(css).toMatch(/\.hm-head-business \{\s*display: block;[^}]*white-space: nowrap;\s*overflow: hidden;\s*text-overflow: ellipsis;/);
  });

  it('is no longer a two-line clamp', () => {
    expect(css).not.toMatch(/-webkit-line-clamp/);
  });
});
