import { describe, expect, it } from 'vitest';
import { fieldLabel, renderDiffField } from './audit-fields';
import { KNOWN_ACTIONS } from '../components/AuditLogList';
import { AUDIT_ACTIONS } from '@growza-app/shared';

describe('renderDiffField', () => {
  // The exact case the story calls out: minor units misread as major ones.
  it('renders a declared money field from minor units, never as the raw number', () => {
    const rendered = renderDiffField('appointment', 'paidAmountMinor', 20000, 'Asia/Kolkata');
    expect(rendered.kind).toBe('money');
    expect(rendered.text).toBe('₹200');
    expect(rendered.text).not.toContain('20000');
    expect(rendered.text).not.toContain('20,000');
  });

  it('renders a declared date field in the given timezone', () => {
    const rendered = renderDiffField('appointment', 'startAt', '2026-09-15T04:30:00.000Z', 'Asia/Kolkata');
    expect(rendered.kind).toBe('date');
    expect(rendered.text).toContain('2026');
    expect(rendered.text).toMatch(/15 Sep/i);
    expect(rendered.text).toMatch(/10:00\s*am/i);
  });

  it('renders a declared status field as a chip with its color', () => {
    const rendered = renderDiffField('appointment', 'status', 'cancelled');
    expect(rendered.kind).toBe('status');
    expect(rendered.text).toBe('cancelled');
    expect(rendered.chip).toBeDefined();
  });

  it('renders a declared text field plainly', () => {
    const rendered = renderDiffField('appointment', 'paymentMode', 'upi');
    expect(rendered).toMatchObject({ kind: 'text', text: 'upi' });
  });

  it('never guesses money for a numeric field that is not in the map — the core risk the story calls out', () => {
    const rendered = renderDiffField('appointment', 'someFutureCount', 20000);
    expect(rendered.kind).not.toBe('money');
    expect(rendered.text).toBe('20000');
  });

  it('renders an unmapped boolean by its actual type, regardless of field name', () => {
    expect(renderDiffField('appointment', 'anything', true)).toMatchObject({ kind: 'boolean', text: 'On' });
    expect(renderDiffField('appointment', 'anything', false)).toMatchObject({ kind: 'boolean', text: 'Off' });
  });

  it('renders an unmapped array as a joined list, not raw JSON', () => {
    const rendered = renderDiffField('appointment', 'appointmentIds', ['a', 'b', 'c']);
    expect(rendered.kind).toBe('list');
    expect(rendered.text).toBe('a, b, c');
  });

  it('renders null/undefined as an em dash rather than the literal word', () => {
    expect(renderDiffField('appointment', 'paymentMode', null).text).toBe('—');
    expect(renderDiffField('appointment', 'paymentMode', undefined).text).toBe('—');
  });

  it('falls back to plain text for a field on an entity type with no map at all', () => {
    const rendered = renderDiffField('business', 'status', 'suspended');
    expect(rendered.kind).toBe('text');
    expect(rendered.text).toBe('suspended');
  });

  it('never crashes on an unknown entityType (null) — a deleted-entity row must still render', () => {
    expect(() => renderDiffField(null, 'status', 'confirmed')).not.toThrow();
  });
});

describe('fieldLabel', () => {
  it('splits camelCase and capitalises, dropping the minor-unit hint', () => {
    expect(fieldLabel('paidAmountMinor')).toBe('Paid amount');
    expect(fieldLabel('createdVia')).toBe('Created via');
    expect(fieldLabel('status')).toBe('Status');
  });
});

/**
 * QA pass — the audit screen's filter list had drifted to 3 of the 14 actions
 * the platform actually writes, so no admin action could be filtered for at
 * all. Pinning the two lists together is what stops it drifting again.
 */
describe('the audit filter offers every action the platform can write', () => {
  it('matches AUDIT_ACTIONS exactly', () => {
    expect([...KNOWN_ACTIONS].sort()).toEqual([...AUDIT_ACTIONS].sort());
  });
});
