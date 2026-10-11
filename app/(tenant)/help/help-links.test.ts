import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isHelpRole, supportIntro, telHref, whatsappHref } from './links';

const here = fileURLToPath(new URL('.', import.meta.url));

describe('Jira GRW-564 — the WhatsApp link support actually receives', () => {
  it('strips everything that is not a digit from the number', () => {
    // All three are how a human might have typed the same number into
    // SUPPORT_WHATSAPP, and all three must reach the same chat. The last one
    // carries a national trunk prefix: wa.me takes an international number,
    // so a leading 0 is not a digit to keep, it is a wrong number.
    for (const typed of ['+919773533899', '+91 97735 33899', '091-97735-33899']) {
      expect(whatsappHref(typed, 'hi')).toBe('https://wa.me/919773533899?text=hi');
    }
  });

  it('percent-encodes the message, including the separator and Hindi', () => {
    expect(whatsappHref('+919773533899', 'Maya Unisex · Stylist')).toBe(
      'https://wa.me/919773533899?text=Maya%20Unisex%20%C2%B7%20Stylist',
    );
    // A Hindi message must survive the same trip — the copy ships in both.
    expect(whatsappHref('+911', 'नमस्ते')).toBe('https://wa.me/911?text=%E0%A4%A8%E0%A4%AE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%87');
  });

  it('no number, no link — never a wa.me/ with nothing after it', () => {
    expect(whatsappHref(undefined, 'hi')).toBeNull();
    expect(whatsappHref('', 'hi')).toBeNull();
    // A number of pure punctuation leaves no digits, which is also no link.
    expect(whatsappHref('+-- ', 'hi')).toBeNull();
  });
});

describe('the tel: link', () => {
  it('drops the spaces and keeps the plus — a tel: needs the country code', () => {
    expect(telHref('+91 95994 20210')).toBe('tel:+919599420210');
  });

  it('no number, no link', () => {
    expect(telHref(undefined)).toBeNull();
    expect(telHref('   ')).toBeNull();
  });
});

describe('the details the message carries', () => {
  it('names the salon, the branch and the role', () => {
    expect(supportIntro({ salon: 'Maya Unisex', branch: 'Indiranagar', roleName: 'Stylist' })).toBe(
      'Maya Unisex · Indiranagar · Stylist',
    );
  });

  it('leaves out what /me could not say rather than printing a gap', () => {
    expect(supportIntro({ salon: 'Maya Unisex', branch: null, roleName: 'Owner' })).toBe('Maya Unisex · Owner');
    expect(supportIntro({})).toBe('');
  });

  it('only the four roles /me can send are named', () => {
    for (const role of ['owner', 'manager', 'receptionist', 'staff']) expect(isHelpRole(role)).toBe(true);
    // A role added to the API and not here must read as unknown and be left
    // out, never interpolated raw into a message to support.
    expect(isHelpRole('accountant')).toBe(false);
    expect(isHelpRole(undefined)).toBe(false);
  });
});

describe('the screen itself', () => {
  const page = readFileSync(resolve(here, 'page.tsx'), 'utf8');

  it('renders nothing rather than throwing when /me is unreachable', () => {
    // The one failure this screen must not have: it is what somebody opens
    // when something is already broken.
    expect(page).toMatch(/} catch \{/);
    expect(page).toMatch(/\{!waHref && !tel \? <p className="help-none">/);
  });

  it('WhatsApp is the primary action, and opens in its own tab', () => {
    expect(page).toMatch(/className="help-action help-action-primary"[\s\S]*?rel="noopener noreferrer"/);
  });

  it('is in the stylesheet order, before the clay layers', () => {
    const globals = readFileSync(resolve(here, '../globals.css'), 'utf8');
    expect(globals.indexOf("@import './styles/99-help.css';")).toBeGreaterThan(-1);
    expect(globals.indexOf("@import './styles/99-help.css';")).toBeLessThan(
      globals.indexOf("@import './styles/100-clay-tabs.css';"),
    );
  });
});
