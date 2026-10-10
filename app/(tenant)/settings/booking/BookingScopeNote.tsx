'use client';

import type { SettingsSummary } from '../../lib/api';
import { useWhatsappLive } from '../../components/SessionProvider';
import { BranchScopeNote } from '../BranchScopeNote';
import { bookingRuleKeys } from '../branch-keys';

/**
 * The branch note under Booking settings, acting on exactly the rules the form draws.
 *
 * It reads `whatsappLive` from the session, as the form does. The page used to ask `/me` again for it, which cost a
 * second round trip on every load and could answer differently from the form: a timed-out page call made "Copy to
 * all branches" skip the minimum notice the owner had just changed (review, 2026-10-10).
 */
export function BookingScopeNote({ settings, branchName }: { settings: SettingsSummary; branchName: string | null }) {
  const whatsappLive = useWhatsappLive();
  return <BranchScopeNote settings={settings} branchName={branchName} keys={bookingRuleKeys(whatsappLive)} topic="bookingRules" />;
}
