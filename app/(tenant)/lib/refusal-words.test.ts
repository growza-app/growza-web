import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ApiError, BookingConflictError, reasonOr } from './api';
import { bareRefusalMessage } from './api-messages';

/**
 * Jira GRW-478 — what a person reads when the server says no.
 */
describe('reasonOr (B-7 / U-12)', () => {
  it('a 4xx is the server’s own sentence', () => {
    expect(reasonOr(new ApiError(409, 'Has bookings coming up', 'has_upcoming_bookings'), 'Could not save')).toBe('Has bookings coming up');
    expect(reasonOr(new BookingConflictError('That number is already on this team'), 'Could not save')).toBe('That number is already on this team');
    expect(reasonOr(new ApiError(400, 'Pick a branch'), 'Could not save')).toBe('Pick a branch');
  });

  it('a 5xx or a dropped connection is the screen’s own sentence, never "Failed to fetch"', () => {
    expect(reasonOr(new ApiError(500, '/api/v1/providers failed: 500'), 'Could not save')).toBe('Could not save');
    expect(reasonOr(new TypeError('Failed to fetch'), 'Could not save')).toBe('Could not save');
  });
});

describe('the guard’s bare codes (R-12)', () => {
  it('are words, in the page’s language', () => {
    expect(bareRefusalMessage('forbidden', 'en')).toBe('You do not have access to this.');
    expect(bareRefusalMessage('unauthorized', 'hi')).toMatch(/साइन इन/);
    expect(bareRefusalMessage('slot_taken', 'en')).toBeNull();
  });
});

describe('screens that used to swallow or misread a refusal', () => {
  const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8');

  it('retire, availability, the wizard, the edit page and Free times all say the server’s reason', () => {
    for (const rel of ['providers/StaffClient.tsx', 'providers/StaffWizard.tsx', 'providers/[id]/StaffEditClient.tsx', 'availability/SlotGrid.tsx', 'components/MoveBookingSheet.tsx']) {
      expect(read(rel), rel).toMatch(/reasonOr\(/);
      expect(read(rel), rel).not.toMatch(/e\.status === 403 \? e\.message/);
    }
  });

  it('the visit sheet treats only a lost slot as a slot to re-pick', () => {
    expect(read('components/NewVisitSheet.tsx')).toMatch(/error instanceof BookingConflictError && error\.code === 'slot_taken'/);
  });
});
