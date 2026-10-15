import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const bar = readFileSync(join(__dirname, 'BottomNav.tsx'), 'utf8');

describe('the plus on Home (owner, 2026-10-15)', () => {
  it('never steps aside on Home, which has no rows for it to cover', () => {
    expect(bar).toMatch(/const stays = pathname === '\/';/);
    expect(bar).toMatch(/if \(stays\) return;\s*setAway\(moved > 0 && y > NEAR_TOP\);/);
    expect(bar).toMatch(/\}, \[menuOpen, stays\]\);/);
  });
  it('is drawn on Home and nowhere else (owner, 2026-10-15)', () => {
    expect(bar).toMatch(/const centre = !stylist && onCentre && pathname === '\/';/);
  });
});
