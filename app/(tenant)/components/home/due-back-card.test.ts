import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';
import type { TodoClient } from '../../lib/report-types';
import { DUE_BACK_DESKTOP_QUERY, DUE_BACK_REFRESH_MS, DUE_BACK_SHOWN, dueBackOf, mayReadDueBack } from './due-back';

/**
 * Owner, 2026-10-19 — "Clients due back" replaces Sales by payment method on the owner's laptop Home (Today's revenue
 * already splits money by method). It is the What-to-do card, not a second source of truth: same call, same message.
 */
const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

const client = (id: string): TodoClient => ({
  customerId: id,
  name: id,
  initial: id[0]!,
  waPhone: null,
  optedOut: false,
  lastVisitDays: 40,
  intervalDays: 30,
  avgTicketMinor: null,
  usualService: null,
});

describe('who gets the card', () => {
  it('needs the What-to-do tab, not just any Reports tab', () => {
    expect(mayReadDueBack(true, undefined)).toBe(true); // the owner: every tab
    expect(mayReadDueBack(true, ['todo', 'staff'])).toBe(true);
    expect(mayReadDueBack(true, ['staff'])).toBe(false); // would only ever say "Could not load"
    expect(mayReadDueBack(true, ['sales'])).toBe(false);
  });

  it('is never shown to someone who cannot open Reports at all', () => {
    expect(mayReadDueBack(false, undefined)).toBe(false);
    expect(mayReadDueBack(false, ['todo'])).toBe(false);
  });
});

describe('reading the report', () => {
  it('takes the due-back card as it is', () => {
    const clients = [client('a'), client('b')];
    expect(dueBackOf({ cards: [{ kind: 'noShow', tone: 'warn', count: 1, clients: [client('x')] }, { kind: 'dueBack', tone: 'warn', count: 2, clients }] })).toEqual({ count: 2, clients });
  });

  it('says nobody is due when the report has no such card', () => {
    expect(dueBackOf({ cards: [] })).toEqual({ count: 0, clients: [] });
  });
});

describe('Clients due back on the owner Home', () => {
  const card = read('DueBackCard.tsx');
  const owner = read('OwnerHome.tsx');
  const css = read('../../styles/83-role-home.css');

  it('reads the What-to-do card and sends the same typed-in WhatsApp message', () => {
    expect(card).toContain('.reportsTodo(branch)');
    expect(card).toContain("t('dueBack.text', { name: client.name, business })");
    expect(card).toContain('whatsappHref(waDigits(c.waPhone), text(c))');
  });

  it('shows three people and opens the whole list in the same sheet Reports uses', () => {
    expect(DUE_BACK_SHOWN).toBe(3);
    expect(card).toContain('slice(0, DUE_BACK_SHOWN)');
    expect(card).toContain('<MessageClientsSheet');
  });

  it('reads nothing on a phone, where the laptop layout is only hidden by CSS', () => {
    expect(DUE_BACK_DESKTOP_QUERY).toBe('(min-width: 861px)');
    expect(card).toMatch(/if \(!desktop\) return;\s*let live = true;/);
  });

  it('stays fresh, keeps what is shown when a refresh fails, and starts clean on a new branch', () => {
    expect(DUE_BACK_REFRESH_MS).toBe(300000);
    expect(card).toContain("document.addEventListener('visibilitychange', onVisible)");
    expect(card).toContain("prev.state === 'ready' ? prev : { state: 'failed' }");
    expect(card).toMatch(/setLoad\(\{ state: 'loading' \}\);\s*setOpen\(false\);\s*\}, \[branch\]\)/);
  });

  it('says so when the read fails or nobody is due, and never shows zero for a failure', () => {
    expect(card).toContain("load.state === 'failed'");
    expect(card).toContain("h('none')");
  });

  it('is gated on the tab it reads, and the row gives up its third column without it', () => {
    expect(owner).toContain("mayReadDueBack(canSee('/reports', p.role, p.reportTabs), p.reportTabs)");
    expect(owner).toContain("hm-v3-mid${showDueBack ? '' : ' hm-v3-mid-two'}");
    expect(css).toMatch(/\.hm-v3-mid\.hm-v3-mid-two\s*\{\s*grid-template-columns:\s*minmax\(0, 1\.35fr\) minmax\(0, 0\.9fr\);/);
  });

  it('has its words in English and Hindi, and the "last visit" line reads as English', () => {
    for (const lang of [en, hi]) {
      expect(Object.keys(lang.reports.todo.homeCard).sort()).toEqual(['failed', 'loading', 'none', 'retry', 'seeAll', 'title']);
    }
    expect(en.reports.todo.sheet.lastIn).toBe('{n, plural, one {Last visit # day ago} other {Last visit # days ago}}');
  });
});
