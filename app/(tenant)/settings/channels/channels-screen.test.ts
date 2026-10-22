import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SETTINGS_GROUPS } from '../nav-data';

/**
 * Jira GRW-641 — Settings › Online selling, pinned at the source.
 *
 * What was checked in a browser at 344px (a picker per marketplace, a switch saved on choosing, the old branch's orders named) is in the
 * PR. These keep the rules: a one-branch shop is never asked, a diary business never sees it, a closed branch is said plainly, and the
 * change says how many online orders are still to be sent from the old shop.
 */
const here = (f: string) => readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
const form = here('./ChannelsForm.tsx');
const page = here('./page.tsx');
const css = readFileSync(path.resolve(import.meta.dirname, '../../styles/99-channels.css'), 'utf8');
const messages = (lang: 'en' | 'hi') => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../../messages', `${lang}.json`), 'utf8')).settingsChannels as Record<string, string>;

describe('a one-branch shop is never asked, and a diary business never sees it', () => {
  it('shows the shop and says it is already set when there is nothing to choose between — no picker', () => {
    expect(form).toContain('row.changeable && writable ?');
    expect(form).toContain("t('single')");
  });

  it('is a shop-only row in Settings, and the page sends a business with a diary back to Settings', () => {
    const row = SETTINGS_GROUPS.flatMap((g) => g.rows).find((r) => r.key === 'channels');
    expect(row).toMatchObject({ href: '/settings/channels', shopOnly: true });
    expect(page).toContain("me.surface !== 'shop'");
    expect(page).toContain("redirect('/settings')");
  });
});

describe('the change says what it did', () => {
  it('saves the moment a shop is chosen, once (a double tap is one request), and says how many online orders are still to be sent from the old shop', () => {
    expect(form).toContain('if (inFlight.current || locationId');
    expect(form).toContain('api.setChannelBranch(row.channel, locationId)');
    expect(form).toContain("t('inFlight'");
    expect(form).toContain('res.inFlightAtOld > 0');
  });

  it('says plainly when the shop chosen has since closed, with the picker still there to choose another', () => {
    expect(form).toContain("t('gone'");
    expect(form).toContain('row.locationId === null ?');
  });

  it('shows a server fault as a plain line, never its own words', () => {
    expect(form).toContain("e instanceof ApiError && e.status < 500 ? e.message : t('failed')");
  });
});

describe('review of GRW-641', () => {
  it('shows the shop just chosen while the request is out instead of snapping back, and says an unchosen channel follows the main shop', () => {
    expect(form).toContain("value={pending[row.channel] || (row.locationId ?? '')}");
    expect(form).toContain("t('followsMain')");
  });
});

describe('the order says which shop it is booked at', () => {
  it('a marketplace order shows its branch as a quiet line — not a badge competing with the state; a counter sale does not', () => {
    const order = readFileSync(path.resolve(import.meta.dirname, '../../orders/[id]/OrderClient.tsx'), 'utf8');
    expect(order).toContain('!isCounter && order.branchName ?');
    expect(order).toContain("t('detail.bookedAt'");
    expect(order).toContain('className="ord-d-quiet ord-d-branch"');
  });
});

describe('UX', () => {
  it('has English and Hindi with the same keys and placeholders, and says "shop" and "shelves", never "variant", "SKU" or "stock pool"', () => {
    const en = messages('en');
    const hi = messages('hi');
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
    const slots = (s: string) => [...new Set([...s.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]))].sort();
    for (const k of Object.keys(en)) {
      expect(hi[k], k).toBeTruthy();
      expect(slots(hi[k]!), k).toEqual(slots(en[k]!));
    }
    for (const [k, v] of Object.entries(en)) expect(v, k).not.toMatch(/\b(variant|SKU|pool|FSN|ASIN)\b/i);
    expect(en.explain).toBe('Online orders come off this shop’s shelves.');
  });

  it('draws a full-width control a thumb tall with 16px type, tokens and rem, no animation', () => {
    expect(css).toMatch(/\.stc-select\s*\{[^}]*width:\s*100%;[^}]*min-height:\s*2\.75rem;[^}]*font-size:\s*16px/);
    expect(css.replace(/font-size:\s*16px/g, '')).not.toMatch(/font-size:\s*\d+px/);
    expect(css).not.toMatch(/transition|animation|@keyframes/);
  });
});
