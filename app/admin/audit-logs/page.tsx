'use client';

import { Suspense } from 'react';
import { AuditLogList } from '../components/AuditLogList';

/**
 * GRW-78/GRW-99's Audit Log screen. Every sensitive admin action lands here
 * with who, what changed, and — where the action needed one — a reason.
 * Read only: there is no edit or delete control on an audit row
 * (13-platform-administration.md §8). The list itself is `AuditLogList`,
 * built reusable so GRW-79's business-detail Audit tab can embed the same
 * component pre-filtered rather than building a second one.
 *
 * `useSearchParams()` inside AuditLogList needs the Suspense boundary
 * (Next's own requirement — see the tenant Reports screen for the same
 * pattern).
 */
export default function AdminAuditLogsPage() {
  return (
    <Suspense>
      <AuditLogList />
    </Suspense>
  );
}
