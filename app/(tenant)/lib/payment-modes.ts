import type { PaymentMode } from './api-types';

/**
 * The four ways a salon takes money, in the order every screen shows them.
 *
 * Lived in `CheckoutSheet` while that was the app's only money-entry UI. It outlived the component: the till
 * a booking used to open is now the same Record payment flow a walk-in uses (owner, 2026-10-10/11), and this
 * is the one thing two screens still wanted from the file. A constant is not a reason to keep a dead
 * component importable.
 *
 * The words are `chrome.pay.<value>`; `value` is what the API stores.
 */
export const PAYMENT_MODES: Array<{ value: PaymentMode }> = [
  { value: 'cash' },
  { value: 'card' },
  { value: 'upi' },
  { value: 'other' },
];
