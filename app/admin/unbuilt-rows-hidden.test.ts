import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { builtRows } from './dashboard-config';

/** Jira GRW-691 — the admin portal shows what works, never a ticket number standing in for a control. */
describe('unbuilt features are left out of the admin screens', () => {
  it('keeps only rows with a real figure behind them', () => {
    const rows = [
      { key: 'payments_failed', available: true },
      { key: 'dunning', available: false },
      { key: 'cancellations', available: true },
    ];
    expect(builtRows(rows).map((r) => r.key)).toEqual(['payments_failed', 'cancellations']);
  });

  it('with nothing built, there is nothing to draw', () => {
    expect(builtRows([{ key: 'a', available: false }])).toEqual([]);
  });

  it('no admin screen prints a Jira number to the admin', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.tsx')) files.push(p);
      }
    };
    walk(join(__dirname));
    // Text a person sees: between tags, or in a string handed to one. Comments may name tickets; screens may not.
    const offenders = files.filter((f) => {
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');
      return /Not yet available|Not built yet|lands with Jira|Jira \{|Jira \$\{/.test(code);
    });
    expect(offenders).toEqual([]);
  });
});
