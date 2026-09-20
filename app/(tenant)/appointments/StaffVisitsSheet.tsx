'use client';

import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatTime } from '../lib/api';
import type { StaffVisit } from '../lib/staff-summary';
import { IconClose } from '../components/icons';
import { useDialog } from '../../shared/a11y/useDialog';

/**
 * Jira GRW-343 — who a person's bookings are for, in a sheet that slides up from the bottom.
 *
 * Opened by the number in the staff table. A sheet rather than a list opened out inside the table: the table stays
 * the size it was, and the names get the whole width. Portalled to the body so no ancestor's scrolling or stacking
 * can trap it under the header or the bottom bar. Escape, the backdrop and the close button all shut it, and focus
 * goes back to the number that opened it.
 */
export interface StaffVisitsLabels {
  /** "3 bookings" */
  count: (n: number) => string;
  nothing: string;
  close: string;
}

export function StaffVisitsSheet({
  title,
  visits,
  timezone,
  showStaff,
  labels,
  onClose,
}: {
  title: string;
  visits: readonly StaffVisit[];
  timezone: string;
  /** "Everyone": each line also says who the visit is with. */
  showStaff: boolean;
  labels: StaffVisitsLabels;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, { onClose });
  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div className="sheet-backdrop sheet-backdrop-fade" onClick={onClose} />
      <div className="sheet sheet-rise bk-visits-sheet" role="dialog" aria-modal="true" aria-labelledby="bk-visits-title" ref={dialogRef}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sheet-title" id="bk-visits-title">
              {title}
            </div>
            <div className="sheet-sub">{labels.count(visits.length)}</div>
          </div>
          <button type="button" className="wi-close" aria-label={labels.close} onClick={onClose}>
            <IconClose />
          </button>
        </div>

        {visits.length === 0 ? (
          <p className="bk-staff-nothing">{labels.nothing}</p>
        ) : (
          <ul className="bk-staff-visits">
            {visits.map((v) => (
              <li key={v.key} className={`is-${v.status}`}>
                <span className="bk-visit-time">{formatTime(v.startAt, timezone)}</span>
                <span className="bk-visit-who">
                  {/* No name when the salon withholds it from staff: the service leads instead. */}
                  {v.client ? <strong>{v.client}</strong> : null}
                  <span className={v.client ? 'bk-visit-service' : 'bk-visit-service is-lead'}>
                    {v.service}
                    {showStaff && v.staff ? ` · ${v.staff}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>,
    document.body,
  );
}
