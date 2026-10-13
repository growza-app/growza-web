import { describe, expect, it } from 'vitest';
import { EMPTY_ENROL_DISCOUNT, discountProblems, enrolDiscountBody, validate, type EnrolDiscountValues } from './enrol-validation';

/**
 * An offer agreed when the business is sold, typed on the enrol form.
 *
 * It belongs there because billing starts when a business goes live: a discount applied afterwards reaches the
 * NEXT bill, so one typed even a day after enrolment would miss the first — the bill it was sold as.
 */
const PLAN = 79900;
const on = (patch: Partial<EnrolDiscountValues> = {}): EnrolDiscountValues => ({ ...EMPTY_ENROL_DISCOUNT, enabled: true, reason: 'Signup offer', ...patch });

describe('an offer is optional', () => {
  it('switched off, nothing is checked and nothing is sent', () => {
    expect(discountProblems(EMPTY_ENROL_DISCOUNT, PLAN)).toEqual({});
    expect(enrolDiscountBody(EMPTY_ENROL_DISCOUNT)).toBeNull();
  });

  it('a half-filled section that is switched off again does not block the form', () => {
    expect(discountProblems({ ...EMPTY_ENROL_DISCOUNT, value: '', reason: '' }, PLAN)).toEqual({});
  });
});

describe('what an admin may type', () => {
  it('a percent over 100 is refused', () => {
    expect(discountProblems(on({ type: 'percent', value: '101' }), PLAN)['discount.value']).toBe('A percent discount cannot be more than 100');
    expect(discountProblems(on({ type: 'percent', value: '100' }), PLAN)).toEqual({});
  });

  it('an amount larger than the plan price is refused', () => {
    expect(discountProblems(on({ type: 'fixed', value: '900' }), PLAN)['discount.value']).toBe('That discount is larger than the plan price itself');
    expect(discountProblems(on({ type: 'fixed', value: '799' }), PLAN)).toEqual({});
  });

  it('a final price above the plan price is refused', () => {
    expect(discountProblems(on({ type: 'final', value: '900' }), PLAN)['discount.value']).toBe('The final price is above the plan price');
    expect(discountProblems(on({ type: 'final', value: '499' }), PLAN)).toEqual({});
  });

  it('an empty or negative figure is refused', () => {
    expect(discountProblems(on({ value: '' }), PLAN)['discount.value']).toBe('Enter the discount');
    expect(discountProblems(on({ value: '-5' }), PLAN)['discount.value']).toBe('Enter the discount');
  });

  it('a reason is required, and bounded', () => {
    expect(discountProblems(on({ reason: '  ' }), PLAN)['discount.reason']).toBe('Say why this business gets a discount');
    expect(discountProblems(on({ reason: 'x'.repeat(501) }), PLAN)['discount.reason']).toBe('Reason is too long (500 characters maximum)');
  });

  it('with no plan chosen yet, the range is not judged — only that something was typed', () => {
    expect(discountProblems(on({ type: 'fixed', value: '9999' }), 0)).toEqual({});
    expect(discountProblems(on({ value: '' }), 0)['discount.value']).toBe('Enter the discount');
  });
});

describe('what is sent to the API', () => {
  it('a percent goes as the percentage itself', () => {
    expect(enrolDiscountBody(on({ type: 'percent', value: '100', durationMonths: '1' }))).toEqual({
      type: 'percent',
      value: 100,
      reason: 'Signup offer',
      durationMonths: 1,
    });
  });

  it('rupees go as minor units', () => {
    expect(enrolDiscountBody(on({ type: 'fixed', value: '300', durationMonths: '3' }))).toMatchObject({ type: 'fixed', value: 30000, durationMonths: 3 });
    expect(enrolDiscountBody(on({ type: 'final', value: '499', durationMonths: '6' }))).toMatchObject({ type: 'final', value: 49900, durationMonths: 6 });
  });

  it('"until removed" is permanent — null, the spelling the API and the discount dialog use', () => {
    expect(enrolDiscountBody(on({ durationMonths: '0' }))?.durationMonths).toBeNull();
  });

  it('the reason is trimmed', () => {
    expect(enrolDiscountBody(on({ reason: '  Signup offer  ' }))?.reason).toBe('Signup offer');
  });
});

describe('the whole form', () => {
  const good = {
    name: 'Glow Salon',
    country: 'IN',
    typeCode: 'salon',
    planCode: 'prime',
    branches: [{ name: 'Main', line1: '', city: '', stylists: '5' }],
    ownerName: 'Meera Shah',
    nationalNumber: '9876543210',
    dialCode: '+91',
    reason: 'Pilot salon in Indiranagar',
  };

  it('passes with no discount at all', () => {
    expect(validate(good)).toEqual({});
  });

  it('a bad discount stops the form, against its own field', () => {
    expect(validate({ ...good, discount: on({ type: 'percent', value: '150' }), planPriceMinor: PLAN })).toEqual({
      'discount.value': 'A percent discount cannot be more than 100',
    });
  });

  it('a good discount passes', () => {
    expect(validate({ ...good, discount: on(), planPriceMinor: PLAN })).toEqual({});
  });
});
