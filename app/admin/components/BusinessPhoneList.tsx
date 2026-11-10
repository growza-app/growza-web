'use client';

import Link from '../../shared/AppLink';
import { Icon, TypeIcon } from '../icons';
import { oklch, typeColor } from '../tokens';
import { StatusPill } from './primitives';

export interface BusinessPhoneRow {
  tenantId: string;
  name: string;
  status: string;
  vertical: string;
  planName: string;
  ready: boolean | null;
}

/**
 * Jira GRW-694 — the Businesses list on a phone, as one inset list.
 *
 * The table's phone cards were ~180px each — name, then owner, branches, users, plan, status and created as labelled
 * pairs — so three or four fitted on a screen. A support admin on a phone is looking for one business: name, plan and
 * status are what pick it out, and the rest is one tap away on its own page. Each row is one link, at least 60px.
 */
export function BusinessPhoneList({ rows, statusLabel }: { rows: BusinessPhoneRow[]; statusLabel: (s: string) => string }) {
  return (
    <ul className="admin-phone-list" aria-label="Businesses">
      {rows.map((b) => {
        const tc = typeColor(b.vertical);
        return (
          <li key={b.tenantId}>
            <Link href={`/admin/businesses/${b.tenantId}`} className="admin-phone-row">
              <span className="admin-phone-row-icon" style={{ background: tc.bg, color: tc.fg }}>
                <TypeIcon type={b.vertical} />
              </span>
              <span className="admin-phone-row-text">
                <span className="admin-phone-row-name">{b.name}</span>
                <span className="admin-phone-row-sub">
                  {b.planName} · {b.vertical}
                </span>
              </span>
              <span className="admin-phone-row-end">
                <StatusPill status={statusLabel(b.status)} />
                {b.ready ? <span className="admin-phone-row-ready">Ready</span> : null}
              </span>
              <span aria-hidden style={{ color: oklch.textFaint, display: 'flex', flex: 'none' }}>
                <Icon name="chevronRight" size={15} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
