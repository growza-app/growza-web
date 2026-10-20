import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { returnReasonKey } from '../../lib/return-reasons';

/**
 * Jira GRW-635 — a return says why, pinned at the source.
 *
 * What was checked in a browser at 344px is in the PR. These keep the rules that must not drift: a parcel that came back undelivered is never
 * inside the customer returns, a return with no reason is counted and not dropped, the trade's short name is on no screen, the reason is optional at
 * the counter and "other" needs words, and the words are in both languages.
 */
const here = (f: string) => readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
const client = here('./ReturnsClient.tsx');
const page = here('./page.tsx');
const sheet = readFileSync(path.resolve(import.meta.dirname, '../../sales/ReturnProductSheet.tsx'), 'utf8');
const order = readFileSync(path.resolve(import.meta.dirname, '../[id]/OrderClient.tsx'), 'utf8');
const messages = (lang: 'en' | 'hi') => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../../messages', `${lang}.json`), 'utf8')).orders as Record<string, Record<string, unknown>>;

describe('an undelivered parcel is not a customer return (BR-02)', () => {
  it('has its own card, apart from the customer returns and their reasons', () => {
    expect(client).toContain("t('undeliveredTitle')");
    expect(client).toContain('data.undelivered.returns');
    expect(client).toContain('data.byReason.map(');
    // The reasons list is the customer returns' alone: nothing about undelivered parcels is drawn inside it.
    const list = client.slice(client.indexOf('data.byReason.map('), client.indexOf('</ul>', client.indexOf('data.byReason.map(')));
    expect(list).not.toMatch(/undelivered/i);
  });

  it('on the order, an undelivered parcel is named as that and carries no customer reason', () => {
    expect(order).toContain("r.kind === 'undelivered' ? t('detail.undelivered') : t('detail.customerReturn')");
    expect(order).toContain("r.kind === 'customer' ? <span");
  });
});

describe('a reason, never a missing word', () => {
  it('no reason is "no reason given" and an unknown code is "something else"', () => {
    expect(returnReasonKey(null)).toBe('not_said');
    expect(returnReasonKey(undefined)).toBe('not_said');
    expect(returnReasonKey('size')).toBe('size');
    expect(returnReasonKey('a_newer_reason')).toBe('other');
  });

  it('is optional at the counter, and "other" needs the words before the return is confirmed', () => {
    expect(sheet).toContain('setReasonCode((cur) => (cur === c ? null : c))');
    expect(sheet).toContain("(reasonCode === 'other' && !reason.trim())");
    expect(sheet).toContain('...(reasonCode ? { reasonCode,');
  });
});

describe('who sees it, and the words', () => {
  it('the front desk is sent back to Orders', () => {
    expect(page).toContain("role === undefined || role === 'owner' || role === 'manager'");
    expect(page).toContain("redirect('/orders')");
  });

  it('says "came back undelivered" and never the trade’s short name, in either language', () => {
    for (const lang of ['en', 'hi'] as const) {
      expect(JSON.stringify(messages(lang).returns) + JSON.stringify(messages(lang).returnReasons)).not.toMatch(/\bRTO\b/i);
    }
  });

  it('every reason has its word in both languages', () => {
    for (const lang of ['en', 'hi'] as const) {
      const w = messages(lang).returnReasons as Record<string, string>;
      for (const k of ['size', 'not_as_described', 'faulty', 'wrong_item', 'changed_mind', 'other', 'not_said']) expect(w[k], `${lang}.${k}`).toBeTruthy();
    }
    expect(Object.keys(messages('hi').returns).sort()).toEqual(Object.keys(messages('en').returns).sort());
  });

  it('every word the Returns screen uses exists in English and Hindi', () => {
    const used = new Set([...client.matchAll(/\bt\('([A-Za-z]+)'/g)].map((m) => m[1]!));
    for (const lang of ['en', 'hi'] as const) for (const key of used) expect((messages(lang).returns as Record<string, unknown>)[key], `${lang}.${key}`).toBeTruthy();
  });
});
