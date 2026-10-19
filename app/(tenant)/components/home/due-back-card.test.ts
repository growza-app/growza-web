import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';
import { DUE_BACK_SHOWN } from './DueBackCard';

/**
 * Owner, 2026-10-19 — "Clients due back" replaces Sales by payment method on the owner's laptop Home (Today's revenue
 * already splits money by method). It is the What-to-do card, not a second source of truth: same call, same message.
 */
const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('Clients due back on the owner Home', () => {
  const card = read('DueBackCard.tsx');
  const owner = read('OwnerHome.tsx');

  it('reads the What-to-do card and sends the same typed-in WhatsApp message', () => {
    expect(card).toContain('api.reportsTodo(branch)');
    expect(card).toContain("c.kind === 'dueBack'");
    expect(card).toContain("t('dueBack.text', { name: client.name, business })");
    expect(card).toContain('whatsappHref(waDigits(c.waPhone), text(c))');
  });

  it('shows three people and opens the whole list in the same sheet Reports uses', () => {
    expect(DUE_BACK_SHOWN).toBe(3);
    expect(card).toContain('slice(0, DUE_BACK_SHOWN)');
    expect(card).toContain('<MessageClientsSheet');
  });

  it('says so when the read fails or nobody is due, and never shows zero for a failure', () => {
    expect(card).toContain("load.state === 'failed'");
    expect(card).toContain("h('none')");
  });

  it('only people who may open Reports get it', () => {
    expect(owner).toContain("canSee('/reports', p.role, p.reportTabs) ? <DueBackCard");
  });

  it('has its words in English and Hindi', () => {
    for (const lang of [en, hi]) {
      expect(Object.keys(lang.reports.todo.homeCard).sort()).toEqual(['failed', 'loading', 'none', 'retry', 'seeAll', 'title']);
    }
  });
});
