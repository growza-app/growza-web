import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-314 — Mark as done: a combo is one row, and every row can come off and go back.
 *
 * Reported from a visit of Haircut + Facial (a combo) + Women's Hair Color: the combo showed as separate
 * service rows, a service could not be taken off, and a removed one could not be got back. The rules
 * run in lib/checkout-lines.test.ts and the API in test/integration/checkout.integration.test.ts;
 * these pin how the sheet uses them.
 */
const code = (p: string) => readFileSync(resolve(__dirname, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const sheet = code('CheckoutSheet.tsx');
const css = code('../styles/14-checkout-sheet.css');

describe('a combo is one row', () => {
  it('drawn once, with its services underneath, not as a row per service', () => {
    expect(sheet).toMatch(/l\.kind === 'combo' \? \(\s*<ComboRow/);
    expect(sheet).toMatch(/legs\.map\(\(l\) => l\.name\)\.join\(' \+ '\)/);
    expect(sheet).toMatch(/Combo · \{legs\.map/);
    expect(sheet).not.toMatch(/checkout-combo-chip/);
  });

  it('is taken off whole: one button, named for the combo, on a 44px target', () => {
    expect(sheet).toMatch(/aria-label=\{`Remove \$\{title\}`\}/);
    expect(sheet).toMatch(/onRemove=\{\(\) => takeOff\(l\.key, true\)\}/);
    expect(css).toMatch(/\.checkout-combo-legs select\s*\{[^}]*min-height:\s*44px;/);
  });

  it('has its price as one input; the pencil opens who did each service', () => {
    expect(sheet).toMatch(/aria-label=\{`\$\{title\} price`\}/);
    expect(sheet).toMatch(/className="checkout-combo-legs"/);
  });
});

describe('the way back', () => {
  it('a "Taken off" list names each line, a combo by its name, with Put back for the whole of it', () => {
    expect(sheet).toMatch(/aria-label="Taken off"/);
    expect(sheet).toMatch(/l\.kind === 'combo' \? l\.title : l\.leg\.name/);
    expect(sheet).toMatch(/onClick=\{\(\) => takeOff\(l\.key, false\)\}/);
  });

  it('its buttons are 44px targets and read as an action, not a struck-through label', () => {
    expect(css).toMatch(/\.checkout-removed-row button\s*\{[^}]*min-height:\s*44px;/);
    expect(css).toMatch(/\.checkout-removed-row > span\s*\{\s*text-decoration:\s*line-through;/);
  });

  it('an empty bill says how to get out of it, and Save stays off', () => {
    expect(sheet).toMatch(/Nothing left to save\. Add a service or a combo, or put one back\./);
    expect(sheet).toMatch(/const valid = hasAnyService && amountsAreValid/);
  });
});

describe('adding a combo', () => {
  it('the list offers the combos that are running and whole, above the services', () => {
    expect(sheet).toMatch(/o\.active && o\.comboPriceMinor && o\.serviceIds\.length > 0 && o\.serviceIds\.every/);
    expect(sheet).toMatch(/<optgroup label="Combos">/);
    expect(sheet).toMatch(/<optgroup label="Services">/);
  });

  it('a chosen combo becomes one added row, whole, at its price, with every service in it', () => {
    expect(sheet).toMatch(/offer\.serviceIds\.map\(\(id\) =>/);
    expect(sheet).toMatch(/comboPriceMinor: Number\(offer\.comboPriceMinor\)/);
  });

  it('both places that open the till hand it the offers', () => {
    expect(code('BookingSheet.tsx')).toMatch(/offers=\{offers\}/);
    expect(code('NewVisitSheet.tsx')).toMatch(/offers=\{offers \?\? \[\]\}/);
  });
});

describe('what is saved', () => {
  it('is built by the tested request builder, from the lines', () => {
    expect(sheet).toMatch(/api\.checkout\(appointment\.id, buildCheckoutRequest\(\{ originalId: appointment\.id, lines, addedServices, addedCombos, paymentMode \}\)\)/);
    expect(code('../lib/api.ts')).toMatch(/cancelMemberIds\?: string\[\];/);
  });

  it('the header names what is still on the bill: a combo once, and nothing taken off', () => {
    expect(sheet).toMatch(/l\.kind === 'combo' \? l\.title : l\.leg\.name\)\), \.\.\.addedCombos\.map/);
    expect(sheet).toMatch(/summarizeServices\(billNames\)/);
  });
});
