'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { fieldLabel, renderDiffField } from '../lib/audit-fields';
import { formatDateTime } from '../lib/format';
import { Icon } from '../icons';
import { Card, EmptyState, Field, SecondaryButton, Select, TextInput } from './primitives';
import { Pagination, type PaginationState } from './Pagination';
import { INITIAL_PAGING, applyPageParams, mergeRows } from '../lib/paging';
import { oklch } from '../tokens';

/**
 * Mirrors AUDIT_ACTIONS in src/platform/ports/audit.ts. This list had drifted
 * to three of fourteen entries, so an admin opening the audit log to answer
 * "who suspended this business, and why" was offered a filter that could not
 * express the question. `audit-fields.test.ts` now fails if the two diverge.
 */
export const KNOWN_ACTIONS = [
  'appointment.create',
  'appointment.status_change',
  'appointment.checkout',
  'appointment.walk_in',
  // GRW-219 — a booking moved to another time. Its own entry because in the
  // table a move looks like a cancellation plus an unrelated new booking, and
  // an admin asked "did somebody lose this booking?" needs to be able to see
  // that nobody did.
  'appointment.rescheduled',
  'appointment.reclaimed',
  // the owner corrected a finished booking's amount or service
  'appointment.corrected',
  // Jira GRW-293 — a stylist named after the fact for a visit recorded with
  // none (epic GRW-283, "a paid visit with no stylist").
  'appointment.stylist_assigned',
  // GRW-202 — a client asked to be forgotten, and then was. Two entries
  // because they happen days apart: the request is reversible for the length
  // of the grace period, the completion is not.
  'customer.updated',
  'customer.erasure_requested',
  'customer.erasure_cancelled',
  'customer.erased',
  'business.create',
  'business.activate',
  'business.suspend',
  'business.reactivate',
  'business.branch_add',
  'business.branch_close',
  'business.branch_reopen',
  'business.branch_make_main',
  'plan.create',
  'plan.update',
  'plan.delete',
  'plan.version_create',
  'plan.entitlements_update',
  'subscription.create',
  'subscription.status_update',
  'subscription.entitlement_set',
  'subscription.entitlement_remove',
  'subscription.discount_set',
  'subscription.discount_remove',
  'subscription.branch_price_set',
  'tax_rule.create',
  'tax_rule.update',
  'subscription.cancel_at_period_end',
  'subscription.reenrol',
  'platform_role.create',
  'platform_role.update',
  'platform_role.delete',
  'platform_user.create',
  'platform_user.role_update',
  'platform_user.status_update',
  // GRW-165 — a reset hands somebody a credential for another person's
  // account, so it is filterable on its own rather than folded into a status
  // change.
  'platform_user.password_reset',
  'payment.record_offline',
  // Jira GRW-242 (third review) — an event named another subscription for a payment already placed; it was left where it was.
  'payment.attribution_conflict',
  'feature_flag.update',
  'feature_flag.override_set',
  'feature_flag.override_remove',
  // GRW-136 — impersonation is never silent. Both ends are filterable, because
  // "when did support stop looking at my account" is a question this trail has
  // to be able to answer on its own.
  'impersonation.start',
  'impersonation.end',
  // GRW-167 — the worker's own escalation, distinct from an admin's decision.
  'subscription.dunning_escalate',
  // Jira GRW-241 — who asked for a UPI AutoPay mandate and for how much, and
  // what the provider then said happened to it. Two actions because the second
  // has no human actor: it arrives on a webhook.
  'subscription.mandate_requested',
  'subscription.mandate_state_change',
  // Jira GRW-242 — the bill outgrew AutoPay: asked, reminded, approved, missed,
  // part-paid, withdrawn, and a mandate cancelled with the provider (BR-06).
  'subscription.mandate_reapproval_requested',
  'subscription.mandate_reapproval_reminded',
  'subscription.mandate_reapproved',
  'subscription.mandate_reapproval_expired',
  'subscription.mandate_reapproval_withdrawn',
  'subscription.mandate_shortfall',
  'subscription.mandate_cancelled',
  // Jira GRW-470 — an owner took a receptionist's or stylist's login away.
  'team.member_removed',
  // Jira GRW-477 — a day on the attendance register recorded, corrected or removed.
  'attendance.marked',
  'attendance.cleared',
] as const;

interface AuditLogRow {
  id: string;
  tenantId: string | null;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  actorPhone: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  diff: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
  reason: string | null;
  /** Jira GRW-184 — where the caller was. Null on every row written before that ticket, and on any row old enough to have been purged. */
  ip: string | null;
  impersonatedBy: string | null;
  impersonatedByName: string | null;
  createdAt: string;
}

interface AuditLogPage {
  rows: AuditLogRow[];
  total: number;
}

interface Filters {
  /**
   * Admin audit 2026-10-09, L9 — what was typed in the Admin box: a name, a phone number or an id; the API works
   * out which. The box used to take only a raw platform-user UUID, and every keystroke of one was a failed request
   * and an error card.
   */
  actor: string;
  action: string;
  entityType: string;
  /** The business an embedded list is locked to (`fixedTenantId`). */
  tenantId: string;
  /** What was typed in the Business box — a name or an id, like `actor`. */
  business: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { actor: '', action: '', entityType: '', tenantId: '', business: '', from: '', to: '' };

function filtersFromParams(params: URLSearchParams): Filters {
  return {
    // `actorId` / `tenantId` are what links into this screen used to carry; an id still works in either box.
    actor: params.get('actor') ?? params.get('actorId') ?? '',
    action: params.get('action') ?? '',
    entityType: params.get('entityType') ?? '',
    tenantId: '',
    business: params.get('business') ?? params.get('tenantId') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  };
}

/** The actor's display name — falls back to a shortened id so a row is never blank while still being distinguishable from another. */
function actorLabel(row: AuditLogRow): string {
  if (row.actorName) return row.actorName;
  if (row.actorId) return `${row.actorType} · ${row.actorId.slice(0, 8)}`;
  return row.actorType;
}

/**
 * GRW-99's Audit Log — a reusable list, not a screen. The standalone
 * `/admin/audit-logs` page renders it with every filter live; a `fixedTenantId`
 * locks it to one business so GRW-79's Audit tab can embed the identical
 * component pre-filtered, per this story's own Dependencies note, rather
 * than building a second list.
 */
export function AuditLogList({ fixedTenantId }: { fixedTenantId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<Filters>(() => ({ ...filtersFromParams(searchParams), ...(fixedTenantId ? { tenantId: fixedTenantId, business: '' } : {}) }));
  const [paging, setPaging] = useState<PaginationState>(INITIAL_PAGING);
  const [page, setPage] = useState<AuditLogPage | null>(null);
  /**
   * Jira GRW-140 — what is on screen, which is no longer the same thing as
   * the last response. A numbered page replaces this; "Load more" adds to it.
   */
  const [rows, setRows] = useState<AuditLogPage['rows']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);

  // URL sync — only for the standalone screen; an embedded tab (fixedTenantId
  // set) owns no URL of its own.
  useEffect(() => {
    if (fixedTenantId) return;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    if (filters.from && filters.to && filters.to < filters.from) {
      setRangeError('End date is before the start date.');
      return;
    }
    setRangeError(null);

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (filters.actor.trim()) params.set('actor', filters.actor.trim());
    if (filters.action) params.set('action', filters.action);
    if (filters.entityType) params.set('entityType', filters.entityType);
    if (filters.tenantId) params.set('tenantId', filters.tenantId);
    if (filters.business.trim()) params.set('business', filters.business.trim());
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    applyPageParams(params, paging);

    adminFetch<AuditLogPage>(`/audit?${params}`, { signal: controller.signal })
      .then((result) => {
        setPage(result);
        setRows((prev) => mergeRows(prev, result.rows, paging.intent));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof AdminApiError ? err.message : 'Could not load the audit log.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
     
  }, [filters, paging]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPaging((p) => ({ ...p, page: 1, intent: 'replace' }));
  }

  const hasActiveFilters = Object.entries(filters).some(([k, v]) => v && k !== 'tenantId') || (!fixedTenantId && filters.tenantId);
  const clearFilters = () => {
    setFilters(fixedTenantId ? { ...EMPTY_FILTERS, tenantId: fixedTenantId } : EMPTY_FILTERS);
    setPaging((p) => ({ ...p, page: 1, intent: 'replace' }));
  };

  const filterFields = (
    <>
      <Field label="Admin">
        <TextInput placeholder="Name or phone" value={filters.actor} onChange={(e) => updateFilter('actor', e.target.value)} />
      </Field>
      <Field label="Action">
        <Select options={['All', ...KNOWN_ACTIONS]} value={filters.action || 'All'} onChange={(e) => updateFilter('action', e.target.value === 'All' ? '' : e.target.value)} />
      </Field>
      <Field label="Entity type">
        <TextInput placeholder="e.g. appointment" value={filters.entityType} onChange={(e) => updateFilter('entityType', e.target.value)} />
      </Field>
      {fixedTenantId ? null : (
        <Field label="Business">
          <TextInput placeholder="Business name" value={filters.business} onChange={(e) => updateFilter('business', e.target.value)} />
        </Field>
      )}
      <Field label="From">
        <TextInput type="date" value={filters.from} onChange={(e) => updateFilter('from', e.target.value)} />
      </Field>
      <Field label="To">
        <TextInput type="date" value={filters.to} onChange={(e) => updateFilter('to', e.target.value)} />
      </Field>
    </>
  );

  return (
    <div>
      <div className="admin-desktop-only" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, position: 'sticky', top: 0, zIndex: 5, background: oklch.pageBg, paddingBottom: 4 }}>
        {filterFields}
        {hasActiveFilters ? (
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <SecondaryButton onClick={clearFilters}>Clear filters</SecondaryButton>
          </div>
        ) : null}
      </div>

      <div className="admin-mobile-only" style={{ marginBottom: 16 }}>
        <SecondaryButton onClick={() => setMobileFiltersOpen(true)} style={{ width: '100%', height: 44, justifyContent: 'center' }}>
          <Icon name="search" size={15} /> Filters{hasActiveFilters ? ' · active' : ''}
        </SecondaryButton>
      </div>

      {mobileFiltersOpen ? (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'flex-end', background: 'oklch(0.2 0.02 155 / 0.5)' }}
          onClick={() => setMobileFiltersOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxHeight: '85vh', overflowY: 'auto', background: 'white', borderRadius: '18px 18px 0 0', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            {filterFields}
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <SecondaryButton onClick={clearFilters} style={{ flex: 1, height: 44, justifyContent: 'center' }}>
                Clear
              </SecondaryButton>
              <SecondaryButton onClick={() => setMobileFiltersOpen(false)} style={{ flex: 1, height: 44, justifyContent: 'center' }}>
                Done
              </SecondaryButton>
            </div>
          </div>
        </div>
      ) : null}

      {rangeError ? (
        <div style={{ fontSize: 13, fontWeight: 600, color: oklch.danger, background: oklch.dangerBg, borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
          {rangeError}
        </div>
      ) : error ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '24px 12px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: oklch.textStrong, marginBottom: 10 }}>{error}</div>
            <SecondaryButton onClick={() => setPaging((p) => ({ ...p }))}>Retry</SecondaryButton>
          </div>
        </Card>
      ) : loading && !page ? (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} style={{ height: 62, borderRadius: 12, background: oklch.divider, animation: 'admin-fade 1.2s ease infinite alternate' }} />
            ))}
          </div>
        </Card>
      ) : !page || page.total === 0 ? (
        hasActiveFilters ? (
          <EmptyState icon="audit" title="No matches for these filters" sub="Try widening the date range or clearing a filter." />
        ) : (
          <EmptyState icon="audit" title="No audit activity yet" sub="Actions taken here will appear as soon as one happens." />
        )
      ) : (
        <>
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {rows.map((row, i) => {
                const expanded = expandedId === row.id;
                return (
                  <div key={row.id} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${oklch.divider}` : 'none' }}>
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : row.id)}
                      style={{ all: 'unset', display: 'flex', gap: 14, padding: '14px 0', width: '100%', cursor: 'pointer', flexWrap: 'wrap', boxSizing: 'border-box' }}
                    >
                      <span
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background: 'oklch(0.95 0.04 150)',
                          color: 'oklch(0.5 0.13 150)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flex: 'none',
                        }}
                      >
                        <Icon name="audit" size={17} />
                      </span>
                      <div style={{ flex: 1, minWidth: 200, textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: oklch.textStrong }}>{row.action}</span>
                          {row.entityType ? (
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'oklch(0.5 0.02 155)', background: oklch.divider, padding: '2px 8px', borderRadius: 6 }}>
                              {row.entityType}
                            </span>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 12.5, color: 'oklch(0.5 0.02 155)', marginTop: 4 }}>
                          {actorLabel(row)}
                          {row.impersonatedByName ? (
                            <span style={{ color: oklch.danger, fontWeight: 700 }}> · impersonated by {row.impersonatedByName}</span>
                          ) : null}
                          {row.reason ? ` · ${row.reason}` : ''}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: oklch.textFaint, fontWeight: 600, textAlign: 'right', flex: 'none' }}>
                        {formatDateTime(row.createdAt)}
                      </div>
                      <Icon name="chevronRight" size={15} />
                    </button>

                    {expanded ? (
                      <div style={{ padding: '0 0 16px 50px' }}>
                        {!row.diff || (!row.diff.before && !row.diff.after) ? (
                          <div style={{ fontSize: 12.5, color: oklch.textFaint }}>No diff recorded for this action.</div>
                        ) : (
                          <DiffTable entityType={row.entityType} before={row.diff.before} after={row.diff.after} />
                        )}
                        {/*
                          Jira GRW-184 — in the expanded detail, not the row.
                          An address is what you check once you have found the
                          action you are arguing about; it is never what you
                          scan a list by, and a column of them would push the
                          action and the actor off a narrow screen.

                          "Not recorded" is spelled out rather than left blank
                          (AC-03). Every row written before GRW-184 has a NULL
                          here, and so does every row old enough to have been
                          purged — an empty cell reads as an address of
                          nothing, which is the only reading that is wrong.
                        */}
                        <div style={{ fontSize: 12, color: oklch.textFaint, marginTop: 10 }}>
                          From{' '}
                          {row.ip ? (
                            <code style={{ fontSize: 12 }}>{row.ip}</code>
                          ) : (
                            <span style={{ fontStyle: 'italic' }}>not recorded</span>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>
          <Pagination total={page.total} loaded={rows.length} state={paging} onChange={setPaging} />
        </>
      )}
    </div>
  );
}

function DiffTable({ entityType, before, after }: { entityType: string | null; before?: Record<string, unknown>; after?: Record<string, unknown> }) {
  const keys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]));
  if (keys.length === 0) return <div style={{ fontSize: 12.5, color: oklch.textFaint }}>No fields changed.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 520 }}>
      {keys.map((key) => {
        const beforeVal = before ? renderDiffField(entityType, key, before[key]) : null;
        const afterVal = after ? renderDiffField(entityType, key, after[key]) : null;
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
            <span style={{ width: 130, flex: 'none', fontWeight: 700, color: oklch.textMuted }}>{fieldLabel(key)}</span>
            {beforeVal ? <ValueChip rendered={beforeVal} /> : <span style={{ color: oklch.textFaint }}>—</span>}
            {beforeVal && afterVal ? <Icon name="chevronRight" size={13} /> : null}
            {afterVal ? <ValueChip rendered={afterVal} /> : null}
          </div>
        );
      })}
    </div>
  );
}

function ValueChip({ rendered }: { rendered: ReturnType<typeof renderDiffField> }) {
  if (rendered.kind === 'status' && rendered.chip) {
    return (
      <span style={{ fontSize: 11.5, fontWeight: 700, color: rendered.chip[0], background: rendered.chip[1], padding: '3px 9px', borderRadius: 7 }}>
        {rendered.text}
      </span>
    );
  }
  return <span style={{ fontWeight: 600, color: oklch.text }}>{rendered.text}</span>;
}
