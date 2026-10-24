import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-634 — where the money came from, pinned at the source.
 *
 * What was checked in a browser at 344px is in the PR. These keep the rules that must not drift: the screen says these are BILLED figures
 * (the server's own caveat, in plain sight), a comparison that is not there is said to be absent and never given a percentage, a quiet channel
 * is a true zero, the chart is never the only way to read a number, the owner's screen is not the desk's, and the words are in both languages.
 */
const here = (f: string) => readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
const client = here('./ChannelsClient.tsx');
const page = here('./page.tsx');
const css = readFileSync(path.resolve(import.meta.dirname, '../../styles/99-stock-report.css'), 'utf8');
const messages = (lang: 'en' | 'hi') => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../../messages', `${lang}.json`), 'utf8')).products.channels as Record<string, unknown>;

describe('billed, not received (BR-01)', () => {
  it('shows the server’s own caveat, always, as text under the numbers — not behind a tooltip', () => {
    expect(client).toContain('localiseApiMessage(data.caveat, locale)');
    expect(client).toContain('className="ch-caveat" role="note"');
    expect(client).not.toMatch(/title=\{|aria-describedby/);
  });

  it('says "billed" and takes the amounts from the server — no arithmetic over money on the screen but the trend’s bar heights', () => {
    expect(client).toContain("t('billed')");
    expect(client).toContain('api.byChannel({ range, location: branch || undefined })');
  });
});

describe('a comparison that is not there is absent, a quiet channel is a true zero (BR-04)', () => {
  it('no previous period, and a previous period with nothing on this channel, each say so — and no percentage is made up', () => {
    expect(client).toContain("t('noPrevious')");
    expect(client).toContain("t('nothingBefore')");
    expect(client).toContain('pct === null');
  });

  it('no change at all is said as "the same", not "up 0%"; and the trend’s dates are the owner’s language, a week named as one', () => {
    expect(client).toContain("pct === 0 ? t('same')");
    expect(client).toContain("t('weekOf'");
    expect(client).not.toContain('{b.label}');
  });

  it('every channel the server lists is a card, whatever it sold — the server decides which exist', () => {
    expect(client).toContain('data.channels.map((c) =>');
    expect(client).not.toMatch(/\.filter\(\(c\) =>/);
  });

  it('shows how many came back beside a channel, so a channel with many returns reads honestly', () => {
    expect(client).toContain("t('cameBack'");
  });
});

describe('the chart is never the only way to read a number', () => {
  it('has the same figures in a list under the bars, and names the chart', () => {
    expect(client).toContain('className="ch-trend"');
    expect(client).toContain('role="img"');
    expect(css).toContain('.ch-bars');
  });
});

describe('states, who sees it, and the words', () => {
  it('has a loading, an empty and an error state', () => {
    expect(client).toContain("t('loading')");
    expect(client).toContain("t('noSales')");
    expect(client).toContain("t('loadError')");
  });

  it('the front desk is sent back to Stock: it is money', () => {
    expect(page).toContain("role === undefined || role === 'owner' || role === 'manager'");
    expect(page).toContain("redirect('/stock')");
  });

  it('every word the screen uses exists in English and Hindi, the caveat included (it is in the API sentences)', () => {
    const used = new Set([...client.matchAll(/\bt\('([A-Za-z]+)'/g)].map((m) => m[1]!));
    for (const lang of ['en', 'hi'] as const) {
      const have = messages(lang);
      for (const key of used) expect(have[key], `${lang}.${key}`).toBeTruthy();
      for (const r of ['last_7_days', 'this_month', 'last_month', 'last_3_months', 'this_year']) expect((have.range as Record<string, string>)[r], `${lang}.range.${r}`).toBeTruthy();
    }
    expect(Object.keys(messages('hi')).sort()).toEqual(Object.keys(messages('en')).sort());
    expect(readFileSync(path.resolve(import.meta.dirname, '../../lib/api-messages.ts'), 'utf8')).toContain(
      "'Fees kept by a marketplace or a delivery app are not taken off these numbers. This is what was billed, not what you were paid.'",
    );
  });
});
