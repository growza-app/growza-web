'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { Card, SecondaryButton } from '../components/primitives';
import { NeedsAttention, type NeedsAttentionRow } from '../components/NeedsAttention';
import { Pagination, type PaginationState } from '../components/Pagination';
import { INITIAL_PAGING, applyPageParams, mergeRows } from '../lib/paging';
import { ATTENTION_KINDS, ATTENTION_KIND_WORDS, type AttentionKind } from '../dashboard-config';
import { oklch } from '../tokens';

interface AttentionPage {
  rows: NeedsAttentionRow[];
  total: number;
  counts: Record<AttentionKind, number>;
}

type Filter = AttentionKind | 'all';
const isFilter = (v: string | null): v is Filter => v === 'all' || (ATTENTION_KINDS as readonly string[]).includes(v ?? '');

/** The empty line for each filter, so "nothing here" says what is clear. */
const EMPTY_TEXT: Record<Filter, string> = {
  all: 'All clear — no business needs you right now.',
  overdue: 'No business is behind on its bill.',
  payment_failed: 'No failed payments this month.',
  setup_stuck: 'No business is stuck in setup.',
  trial_ending: 'No trial ends in the next 2 days.',
};

/**
 * Owner, 11 Nov 2026 — Needs attention, its own page.
 *
 * The dashboard listed the first 20 and nothing said there were more. This is every business that needs an admin,
 * a page at a time, with one chip per reason (a reason with nobody in it is left out, so the row of chips stays short
 * on a phone). The reason is kept in the URL, so the tile, a shared link and Back all land on the same view.
 */
function NeedsAttentionScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get('kind');
  const filter: Filter = isFilter(raw) ? raw : 'all';
  const [paging, setPaging] = useState<PaginationState>(INITIAL_PAGING);
  const [data, setData] = useState<AttentionPage | null>(null);
  const [rows, setRows] = useState<NeedsAttentionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const q = new URLSearchParams({ kind: filter });
    applyPageParams(q, paging);
    adminFetch<AttentionPage>(`/needs-attention?${q.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setRows((prev) => mergeRows(prev, res.rows, paging.intent));
      })
      .catch((err) => !cancelled && setError(err instanceof AdminApiError ? err.message : 'Could not load the list.'));
    return () => {
      cancelled = true;
    };
  }, [filter, paging, retry]);

  const choose = (next: Filter) => {
    setPaging({ ...INITIAL_PAGING, pageSize: paging.pageSize });
    router.replace(next === 'all' ? '/admin/needs-attention' : `/admin/needs-attention?kind=${next}`);
  };

  if (error) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '24px 12px' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: oklch.textStrong, marginBottom: 10 }}>{error}</div>
          <SecondaryButton onClick={() => setRetry((n) => n + 1)}>Retry</SecondaryButton>
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} style={{ height: 56, borderRadius: 12, background: oklch.divider, animation: 'admin-fade 1.2s ease infinite alternate' }} />
          ))}
        </div>
      </Card>
    );
  }

  const all = ATTENTION_KINDS.reduce((sum, k) => sum + data.counts[k], 0);
  const chips: Array<{ key: Filter; label: string; count: number }> = [
    { key: 'all', label: 'All', count: all },
    ...ATTENTION_KINDS.filter((k) => data.counts[k] > 0 || k === filter).map((k) => ({ key: k, label: ATTENTION_KIND_WORDS[k], count: data.counts[k] })),
  ];

  return (
    <>
      <div className="admin-reason-chips" role="group" aria-label="Show by reason">
        {chips.map((c) => (
          <button key={c.key} type="button" className="admin-reason-chip" aria-pressed={c.key === filter} onClick={() => choose(c.key)}>
            {c.label} <span className="admin-reason-chip-count">{c.count}</span>
          </button>
        ))}
      </div>
      <NeedsAttention rows={rows} emptyText={EMPTY_TEXT[filter]} />
      <Pagination total={data.total} loaded={rows.length} state={paging} onChange={setPaging} />
    </>
  );
}

export default function NeedsAttentionPage() {
  return (
    <Suspense fallback={null}>
      <NeedsAttentionScreen />
    </Suspense>
  );
}
