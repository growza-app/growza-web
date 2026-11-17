import { guardScreen } from '../lib/screen-guard';
import { screenTitle } from '../lib/page-title';
import { KitchenClient } from './KitchenClient';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Kitchen');

/**
 * Jira GRW-714 — the kitchen screen. A Kitchen login lands here and is offered nothing else; the owner, a manager and the counter can open
 * it too (a branch without a kitchen tablet). The API answers 403 for a business with no kitchen (one that counts stock).
 */
export default async function KitchenPage() {
  await guardScreen('/kitchen');
  return (
    <div className="page-body kd-page">
      <KitchenClient />
    </div>
  );
}
