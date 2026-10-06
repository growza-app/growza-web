import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PaymentsCard, type BusinessPayments } from './PaymentsCard';

/**
 * Jira GRW-556 (follow-up) — online payment is on each business's own page, in plain words, and says when switching it
 * on will do nothing because the server cannot collect yet.
 */
const draw = (payments: BusinessPayments, canManage = true) =>
  renderToStaticMarkup(createElement(PaymentsCard, { businessId: 'b1', businessName: 'Glow Salon', payments, canManage, onChanged: () => {} }));

describe('the Payments card on a business', () => {
  it('off: says what the owner is told instead, and that it follows the default', () => {
    const html = draw({ online: false, override: null, serverCanCollect: true });
    expect(html).toContain('Off');
    expect(html).toContain('pay by UPI');
    expect(html).toContain('Same as every business');
    expect(html).toContain('aria-pressed="false"');
  });

  it('on: says the owner sees Pay now, and that it was set for this business', () => {
    const html = draw({ online: true, override: true, serverCanCollect: true });
    expect(html).toContain('Pay now button');
    expect(html).toContain('Set for this business only');
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain('will not work yet');
  });

  it('on but the server cannot collect: warns, plainly, that the owner still sees nothing', () => {
    const html = draw({ online: true, override: true, serverCanCollect: false });
    expect(html).toContain('Switched on, but it will not work yet');
    expect(html).toContain('still sees no Pay now button');
  });

  it('off with no keys does not warn — there is nothing switched on to be disappointed by', () => {
    expect(draw({ online: false, override: null, serverCanCollect: false })).not.toContain('will not work yet');
  });

  it('without the permission the switch is disabled and says why', () => {
    const html = draw({ online: false, override: null, serverCanCollect: true }, false);
    expect(html).toContain('disabled');
    expect(html).toContain('You do not have permission');
  });
});

describe('where it sits', () => {
  const page = readFileSync(path.resolve(__dirname, '../businesses/[id]/page.tsx'), 'utf-8');
  it('on the business page itself, not behind a tab or a pasted id', () => {
    expect(page).toMatch(/<PaymentsCard\s+businessId=\{params\.id\}/);
    expect(page).toMatch(/admin\.feature_flag\.manage/);
  });
});
