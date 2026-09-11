'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, type ProviderOverviewRow, type ProvidersOverview, type Service } from '../lib/api';
import { Pagination, PAGE_SIZE } from '../components/Pagination';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageHeader } from '../components/PageHeader';
import { toWeekdayRows } from '../components/WeekdayHoursEditor';
import { IconPlus, IconSearch } from '../components/icons';
import { StaffWizard } from './StaffWizard';
import { isWorkingToday, StaffActionSheet, StaffGroup, type RosterActions } from './StaffRoster';

type Tab = 'all' | 'working' | 'off' | 'inactive';

export function StaffClient({
  initialOverview,
  services,
  staffWord,
  maxProviders,
  orgHours,
}: {
  initialOverview: ProvidersOverview;
  services: Service[];
  staffWord: string;
  maxProviders: number;
  /** GRW-22 — the salon's own week, as stored. Expanded to seven editor rows here, on the client, because `toWeekdayRows` is a client module. */
  orgHours: Array<{ weekday: number; startTime: string; endTime: string }>;
}) {
  const router = useRouter();
  const [overview, setOverview] = useState(initialOverview);

  /**
   * `useState(initialOverview)` captures the FIRST value only. The app-wide
   * LiveRefresh calls router.refresh() every 15s, which re-runs the server
   * component and hands down a fresh `initialOverview` — but without this the
   * roster kept rendering the snapshot it mounted with, so a booking made
   * from WhatsApp never appeared until a full navigation. Local state still
   * wins between refreshes, which is what keeps the optimistic toggle smooth.
   */
  useEffect(() => {
    setOverview(initialOverview);
  }, [initialOverview]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [sheetFor, setSheetFor] = useState<ProviderOverviewRow | null>(null);
  /** Pending availability change awaiting confirmation — the roster switch applies instantly, so it asks first. */
  const [confirmAvail, setConfirmAvail] = useState<{ p: ProviderOverviewRow; available: boolean } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<ProviderOverviewRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Why a change was refused — most often the plan's seat cap (GRW-23). */
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const fresh = await api.providersOverview().catch(() => null);
    if (fresh) setOverview(fresh);
    router.refresh();
  };

  // No hard delete anywhere in this UI — provider rows are referenced by
  // appointment_allocation/working_hours/provider_service with no cascade, so
  // deleting anyone with real booking history would just fail at the database.
  // "Remove" means deactivate: they drop off the active list and out of
  // booking flows, but their history (and the option to restore them) is kept.
  const setActive = async (p: ProviderOverviewRow, active: boolean) => {
    if (!active) {
      setConfirmRemove(p);
      return;
    }
    /*
     * QA on GRW-23: this had no error handling at all, and un-retiring can now
     * be REFUSED — bringing somebody back takes a seat exactly as hiring them
     * does. An unhandled rejection here meant the switch appeared to do
     * nothing: the row stayed retired, no message, no reason.
     */
    setBusyId(p.id);
    setError(null);
    try {
      await api.updateProviderProfile(p.id, { active: true });
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? e.message : 'Could not bring them back. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const doRemove = async (p: ProviderOverviewRow) => {
    setBusyId(p.id);
    try {
      await api.updateProviderProfile(p.id, { active: false });
      await refresh();
    } finally {
      setBusyId(null);
      setConfirmRemove(null);
    }
  };

  /**
   * Optimistic: the switch is the whole point of the redesign, so it has to
   * move under the thumb immediately. The refresh that follows re-derives
   * group membership from the server, which is what actually moves the row
   * between the Working and Off sections.
   */
  const setAvailableToday = async (p: ProviderOverviewRow, available: boolean) => {
    setConfirmAvail({ p, available });
  };

  const doSetAvailableToday = async (p: ProviderOverviewRow, available: boolean) => {
    setBusyId(p.id);
    setOverview((prev) => ({
      ...prev,
      providers: prev.providers.map((r) => (r.id === p.id ? { ...r, unavailableToday: !available } : r)),
    }));
    try {
      await api.setProviderAvailabilityToday(p.id, !available);
      await refresh();
    } catch {
      await refresh();
    } finally {
      setBusyId(null);
      setConfirmAvail(null);
    }
  };

  const { providers, topPerformer } = overview;
  const activeCount = providers.filter((p) => p.active).length;
  const workingTodayCount = providers.filter((p) => p.active && isWorkingToday(p)).length;
  const offTodayCount = providers.filter((p) => p.active && !isWorkingToday(p)).length;
  const inactiveCount = providers.filter((p) => !p.active).length;
  const seatsLeft = Math.max(0, maxProviders - activeCount);

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
    const base = q
      ? tabbed.filter((p) => p.displayName.toLowerCase().includes(q) || (p.title ?? '').toLowerCase().includes(q))
      : tabbed;
    // On-shift first, so the grouping below stays coherent when a long roster
    // pages — page 1 is never "3 people who are off, 7 who are working".
    return [...base].sort((a, b) => Number(isWorkingToday(b)) - Number(isWorkingToday(a)));
  }, [tabbed, search]);

  // Standard scroll + numbered pagination, PAGE_SIZE 10 — the shared
  // Pagination renders nothing at all below one page, so a small team sees
  // the plain grouped roster with no footer.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clamped = Math.min(page, pageCount);
  const visible = filtered.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE);

  const working = visible.filter((p) => p.active && isWorkingToday(p));
  const off = visible.filter((p) => p.active && !isWorkingToday(p));
  const inactive = visible.filter((p) => !p.active);

  const actions: RosterActions = {
    onToggleAvailable: setAvailableToday,
    // Edit is a full screen now (design Turn 4), not the old right-hand drawer.
    onEdit: (p) => router.push(`/providers/${p.id}`),
    onSetActive: setActive,
    busyId,
  };

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: activeCount },
    { key: 'working', label: 'Working', count: workingTodayCount },
    { key: 'off', label: 'Off', count: offTodayCount },
    { key: 'inactive', label: 'Inactive', count: inactiveCount },
  ];

  /*
   * Memoised, and not for speed.
   *
   * `toWeekdayRows` builds a NEW array every call, and this component
   * re-renders on every LiveRefresh tick (15s) as well as on every local state
   * change. Handing the wizard a fresh array identity each time would reset the
   * week it is holding — under the owner's hands, mid-edit, every fifteen
   * seconds.
   */
  const orgHourRows = useMemo(() => toWeekdayRows(orgHours), [orgHours]);

  const changeTab = (key: Tab) => {
    setTab(key);
    setPage(1);
  };

  return (
    <>
      {/*
        Jira GRW-30 — the header moved in here so "Add staff" can live in it.

        `PageHeader`'s `actions` slot is the one primary-action position, and
        reaching it means the component that owns `setCreating` has to be the
        one that renders the header. Same shape `CustomersClient` already uses;
        the screen's `page.tsx` keeps the header only for its API-down state,
        where there is no client component at all.
      */}
      <PageHeader
        title={staffWord}
        actions={
          <button type="button" className="btn" onClick={() => setCreating(true)} disabled={seatsLeft === 0}>
            <IconPlus /> Add {staffWord.toLowerCase()}
          </button>
        }
      />
      <div className="page-body">
      <div className="staff-summary">
        <span>
          <strong>{workingTodayCount}</strong> working today
        </span>
        <span className="staff-summary-dot" />
        <span>
          <strong>{activeCount}</strong> {activeCount === 1 ? 'person' : 'people'}
        </span>
        <span className="staff-summary-dot" />
        <span className={seatsLeft === 0 ? 'staff-summary-warn' : ''}>
          {seatsLeft === 0 ? 'No seats left on your plan' : `${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left on your plan`}
        </span>
      </div>

      {/* Directly under the seat count, which is the number the message is
          about — a refusal shown far from the reason reads as a random fault. */}
      {error && (
        <div className="banner" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/*
        The row beneath the header FINDS things. It used to create one too —
        `[search][Add staff]` here, `[Add service][search][Export]` on Services
        — and neither order looked wrong, which is how they stayed different.
        Creating is the header's job now; this row is search and tabs.
      */}
      <div className="page-toolbar">
        <div className="staff-search-wrap">
          <IconSearch />
          <input
            type="search"
            placeholder={`Search ${staffWord.toLowerCase()}...`}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label={`Search ${staffWord.toLowerCase()}`}
          />
        </div>
      </div>

      <div className="page-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`page-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => changeTab(t.key)}
          >
            {t.label} <span className="page-tab-count">{t.count}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">No {staffWord.toLowerCase()} match here.</div>
      ) : (
        <>
          <StaffGroup
            title="Working today"
            tone="on"
            people={working}
            off={false}
            topPerformerId={topPerformer?.id ?? null}
            actions={actions}
            onOpenSheet={setSheetFor}
          />
          <StaffGroup
            title="Off today"
            tone="off"
            people={off}
            off
            topPerformerId={topPerformer?.id ?? null}
            actions={actions}
            onOpenSheet={setSheetFor}
          />
          <StaffGroup
            title="Inactive"
            tone="off"
            people={inactive}
            off
            topPerformerId={topPerformer?.id ?? null}
            actions={actions}
            onOpenSheet={setSheetFor}
          />
          <Pagination
            page={clamped}
            total={filtered.length}
            pageSize={PAGE_SIZE}
            noun={staffWord.toLowerCase()}
            onChange={setPage}
          />
        </>
      )}

      {confirmAvail && (
        <ConfirmDialog
          title={confirmAvail.available ? `Mark ${confirmAvail.p.displayName} available today?` : `Mark ${confirmAvail.p.displayName} off today?`}
          body={
            confirmAvail.available
              ? `Their remaining hours today become bookable again on WhatsApp.`
              : `Their remaining slots today stop being bookable on WhatsApp. This is for today only — their weekly schedule is unchanged.`
          }
          detail={
            // The number that actually decides this. Existing bookings are NOT
            // cancelled by blocking the day, so say so rather than leave the
            // owner guessing whether they just dropped four clients.
            !confirmAvail.available && confirmAvail.p.todayBookings > 0
              ? confirmAvail.p.todayBookings === 1
                ? '1 booking already on the books today stays put — you will need to move or cancel it yourself.'
                : `${confirmAvail.p.todayBookings} bookings already on the books today stay put — you will need to move or cancel them yourself.`
              : undefined
          }
          confirmLabel={confirmAvail.available ? 'Mark available' : 'Mark off today'}
          busy={busyId === confirmAvail.p.id}
          onConfirm={() => doSetAvailableToday(confirmAvail.p, confirmAvail.available)}
          onCancel={() => setConfirmAvail(null)}
        />
      )}

      {confirmRemove && (
        <ConfirmDialog
          title={`Remove ${confirmRemove.displayName} from the team?`}
          body="They stop appearing in booking flows and on the roster."
          detail="Their booking history is kept, and you can restore them any time from the Inactive tab."
          confirmLabel="Remove"
          tone="danger"
          busy={busyId === confirmRemove.id}
          onConfirm={() => doRemove(confirmRemove)}
          onCancel={() => setConfirmRemove(null)}
        />
      )}

      {sheetFor && (
        <StaffActionSheet
          p={providers.find((r) => r.id === sheetFor.id) ?? sheetFor}
          actions={actions}
          onClose={() => setSheetFor(null)}
        />
      )}

      {/*
        Jira GRW-22 — the 3-step wizard GRW-004 asked for.
        `StaffDetailPanel` used to serve this too, and on the create path it
        gated Skills and Working hours behind `detail &&` — behind already
        having saved. Editing an existing person goes to /providers/[id]; this
        is only ever the create.
      */}
      {creating && (
        <StaffWizard
          staffWord={staffWord}
          services={services}
          roster={providers}
          orgHours={orgHourRows}
          onClose={() => setCreating(false)}
          onCreated={refresh}
        />
      )}
      </div>
    </>
  );
}
