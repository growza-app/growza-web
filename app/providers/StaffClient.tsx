'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type ProviderOverviewRow, type ProvidersOverview, type Service } from '../lib/api';
import { PaginatedTable } from '../components/PaginatedTable';
import { IconBan, IconCheck, IconClock, IconEdit, IconFilter, IconPlus, IconSearch, IconStaff, IconStar, IconTrash } from '../components/icons';
import { StaffDetailPanel } from './StaffDetailPanel';

type Tab = 'all' | 'working' | 'off' | 'inactive';

function formatTime12h(hhmmss: string): string {
  const [h, m] = hhmmss.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function statusOf(p: ProviderOverviewRow): { label: string; cls: string } {
  if (!p.active) return { label: 'Inactive', cls: 'staff-status-off' };
  if (p.unavailableToday) return { label: 'Unavailable today', cls: 'staff-status-off' };
  if (p.workingHoursTodayStart) return { label: 'Working', cls: 'staff-status-working' };
  return { label: 'Off today', cls: 'staff-status-off' };
}

export function StaffClient({
  initialOverview,
  services,
  staffWord,
}: {
  initialOverview: ProvidersOverview;
  services: Service[];
  staffWord: string;
}) {
  const router = useRouter();
  const [overview, setOverview] = useState(initialOverview);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    const fresh = await api.providersOverview().catch(() => null);
    if (fresh) setOverview(fresh);
    router.refresh();
  };

  const setActive = async (p: ProviderOverviewRow, active: boolean) => {
    if (active) {
      await api.updateProviderProfile(p.id, { active: true });
      await refresh();
      return;
    }
    // No hard delete anywhere in this UI — provider rows are referenced by
    // appointment_allocation/working_hours/provider_service with no cascade,
    // so deleting anyone with real booking history would just fail at the
    // database. "Remove" means deactivate: they drop off the active list
    // and out of booking flows, but their history (and the option to
    // restore them) is kept.
    if (!window.confirm(`Remove ${p.displayName} from active staff? Their booking history is kept, and you can restore them anytime from the Inactive tab.`)) {
      return;
    }
    await api.updateProviderProfile(p.id, { active: false });
    await refresh();
  };

  const setUnavailableToday = async (p: ProviderOverviewRow, unavailable: boolean) => {
    await api.setProviderAvailabilityToday(p.id, unavailable);
    await refresh();
  };

  const { providers, topPerformer } = overview;
  // A manual "unavailable today" override counts as off-today regardless of the recurring schedule.
  const isWorkingToday = (p: ProviderOverviewRow) => Boolean(p.workingHoursTodayStart) && !p.unavailableToday;
  const activeCount = providers.filter((p) => p.active).length;
  const workingTodayCount = providers.filter((p) => p.active && isWorkingToday(p)).length;
  const offTodayCount = providers.filter((p) => p.active && !isWorkingToday(p)).length;
  const inactiveCount = providers.filter((p) => !p.active).length;

  const tabbed = useMemo(() => {
    switch (tab) {
      case 'working':
        return providers.filter((p) => p.active && isWorkingToday(p));
      case 'off':
        return providers.filter((p) => p.active && !isWorkingToday(p));
      case 'inactive':
        return providers.filter((p) => !p.active);
      default:
        return providers.filter((p) => p.active);
    }
  }, [providers, tab]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tabbed;
    return tabbed.filter((p) => p.displayName.toLowerCase().includes(q) || (p.title ?? '').toLowerCase().includes(q));
  }, [tabbed, search]);

  return (
    <>
      <div className="staff-toolbar">
        <div className="staff-search-wrap">
          <IconSearch />
          <input
            type="search"
            placeholder={`Search ${staffWord.toLowerCase()}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={`Search ${staffWord.toLowerCase()}`}
          />
        </div>
        <button type="button" className="btn btn-ghost" disabled title="Filter by role, coming soon">
          <IconFilter /> Filters
        </button>
        <button type="button" className="btn" onClick={() => setCreating(true)}>
          <IconPlus /> Add staff
        </button>
      </div>

      <div className="staff-tiles">
        <div className="tile">
          <div className="staff-tile-icon total">
            <IconStaff />
          </div>
          <div className="label">Total staff</div>
          <div className="value">{activeCount}</div>
          <div className="delta">Active</div>
        </div>
        <div className="tile">
          <div className="staff-tile-icon working">
            <IconClock />
          </div>
          <div className="label">Working today</div>
          <div className="value">{workingTodayCount}</div>
          <div className="delta">Out of {activeCount}</div>
        </div>
        <div className="tile">
          <div className="staff-tile-icon top">
            <IconStar />
          </div>
          <div className="label">Top performer</div>
          {topPerformer ? (
            <>
              <div className="staff-tile-top">{topPerformer.displayName}</div>
              <div className="delta">{topPerformer.bookingsCount} bookings (30d)</div>
            </>
          ) : (
            <div className="staff-tile-top">—</div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="staff-tabs">
          <button type="button" className={`staff-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
            All staff
          </button>
          <button type="button" className={`staff-tab ${tab === 'working' ? 'active' : ''}`} onClick={() => setTab('working')}>
            Working today ({workingTodayCount})
          </button>
          <button type="button" className={`staff-tab ${tab === 'off' ? 'active' : ''}`} onClick={() => setTab('off')}>
            Off today ({offTodayCount})
          </button>
          <button type="button" className={`staff-tab ${tab === 'inactive' ? 'active' : ''}`} onClick={() => setTab('inactive')}>
            Inactive ({inactiveCount})
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="empty">No {staffWord.toLowerCase()} match here.</div>
        ) : (
          <PaginatedTable
            noun={staffWord.toLowerCase()}
            head={
              <tr>
                <th>{staffWord === 'Staff' ? 'Staff member' : staffWord}</th>
                <th>Role</th>
                <th>Working hours</th>
                <th>Today&apos;s bookings</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            }
          >
            {filtered.map((p) => {
              const status = statusOf(p);
              return (
                <tr key={p.id} data-row>
                  <td>
                    <div className="staff-row-main" onClick={() => setOpenId(p.id)}>
                      <div className="avatar">
                        {p.displayName
                          .split(' ')
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((w) => w[0]!.toUpperCase())
                          .join('')}
                      </div>
                      <div>
                        <div className="staff-row-name">{p.displayName}</div>
                        {p.phone && <div className="staff-row-phone">{p.phone}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="muted">{p.title ?? '—'}</td>
                  <td className="muted">
                    {p.unavailableToday
                      ? 'Unavailable today'
                      : p.workingHoursTodayStart && p.workingHoursTodayEnd
                        ? `${formatTime12h(p.workingHoursTodayStart)} – ${formatTime12h(p.workingHoursTodayEnd)}`
                        : 'Off today'}
                  </td>
                  <td>{p.todayBookings}</td>
                  <td>
                    <span className={`staff-status-dot ${status.cls}`}>{status.label}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="staff-icon-btn" aria-label={`Edit ${p.displayName}`} onClick={() => setOpenId(p.id)}>
                        <IconEdit />
                      </button>
                      {p.active &&
                        (p.unavailableToday ? (
                          <button
                            type="button"
                            className="staff-icon-btn staff-icon-btn-positive"
                            aria-label={`Mark ${p.displayName} available today`}
                            title="Mark available today"
                            onClick={() => setUnavailableToday(p, false)}
                          >
                            <IconCheck />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="staff-icon-btn"
                            aria-label={`Mark ${p.displayName} unavailable today`}
                            title="Mark unavailable today"
                            onClick={() => setUnavailableToday(p, true)}
                          >
                            <IconBan />
                          </button>
                        ))}
                      {p.active ? (
                        <button
                          type="button"
                          className="staff-icon-btn"
                          aria-label={`Remove ${p.displayName}`}
                          title="Remove from active staff"
                          onClick={() => setActive(p, false)}
                        >
                          <IconTrash />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="staff-icon-btn"
                          aria-label={`Restore ${p.displayName}`}
                          title="Restore to active staff"
                          onClick={() => setActive(p, true)}
                        >
                          <IconCheck />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </PaginatedTable>
        )}
      </div>

      {(openId || creating) && (
        <StaffDetailPanel
          providerId={openId}
          services={services}
          onClose={() => {
            setOpenId(null);
            setCreating(false);
          }}
          onSaved={refresh}
        />
      )}
    </>
  );
}
