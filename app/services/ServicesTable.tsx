'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, formatMoney, type ServiceAdmin, type ServiceCategory } from '../lib/api';
import { copy } from '../lib/copy';
import { servicePhotoUrl } from '../lib/service-photos';
import { PaginatedTable } from '../components/PaginatedTable';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { IconEdit, IconPlus, IconSearch } from '../components/icons';
import { ServiceForm } from './ServiceForm';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * The catalogue screen. Until now this was read-only apart from photos, which
 * meant an owner could not change their own prices, durations or service list
 * without someone editing Postgres for them.
 *
 * Photo upload still lives here (not the combo builder) — a service's photo is
 * a property of the service itself, reused everywhere it's pictured, so it's
 * set once at the source rather than per-combo.
 */
export function ServicesTable({
  services: initial,
  categories,
}: {
  services: ServiceAdmin[];
  categories: ServiceCategory[];
}) {
  const router = useRouter();
  const [services, setServices] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | 'all'>('all');
  const [editing, setEditing] = useState<ServiceAdmin | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState<{ service: ServiceAdmin; bookings: number } | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const replace = (saved: ServiceAdmin) => {
    setServices((prev) => (prev.some((s) => s.id === saved.id) ? prev.map((s) => (s.id === saved.id ? saved : s)) : [saved, ...prev]));
    router.refresh();
  };

  const onPick = async (service: ServiceAdmin, file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_PHOTO_BYTES) {
      setError(`${service.name}: photo must be under 5MB.`);
      return;
    }
    setBusyId(service.id);
    try {
      const updated = await api.uploadServicePhoto(service.id, file);
      setServices((prev) => prev.map((s) => (s.id === service.id ? { ...s, imageUrl: updated.imageUrl } : s)));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusyId(null);
    }
  };

  const onRemovePhoto = async (service: ServiceAdmin) => {
    setError(null);
    setBusyId(service.id);
    try {
      const updated = await api.removeServicePhoto(service.id);
      setServices((prev) => prev.map((s) => (s.id === service.id ? { ...s, imageUrl: updated.imageUrl } : s)));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed.');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * "Retire", never delete. `service.id` is referenced by appointment,
   * provider_service and offer_service with no cascade, so a hard delete on
   * anything with history would fail at the database — and the history is
   * worth keeping regardless. Asks first, with the booking count, so the owner
   * knows what they're pulling out of the booking flows.
   */
  const askRetire = async (service: ServiceAdmin) => {
    setBusyId(service.id);
    try {
      const usage = await api.serviceUsage(service.id).catch(() => ({ bookings: 0, providers: 0, offers: 0 }));
      setConfirmRetire({ service, bookings: usage.bookings });
    } finally {
      setBusyId(null);
    }
  };

  const setActive = async (service: ServiceAdmin, active: boolean) => {
    setBusyId(service.id);
    setError(null);
    try {
      replace(await api.updateService(service.id, { active }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusyId(null);
      setConfirmRetire(null);
    }
  };

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of services) if (s.categoryId) map.set(s.categoryId, (map.get(s.categoryId) ?? 0) + 1);
    return map;
  }, [services]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter(
      (s) =>
        (categoryId === 'all' || s.categoryId === categoryId) &&
        (!q || s.name.toLowerCase().includes(q) || (s.categoryName ?? '').toLowerCase().includes(q)),
    );
  }, [services, search, categoryId]);

  const exportCsv = () => {
    const header = ['Name', 'Type', 'Takes (min)', 'Cleanup after (min)', 'Price', 'Status'];
    const rows = filtered.map((s) => [
      s.name,
      s.categoryName ?? '',
      String(s.durationMin),
      String(s.bufferAfterMin),
      s.priceMinor ? String(Number(s.priceMinor) / 100) : '',
      s.active ? 'Active' : 'Retired',
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'services.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="staff-toolbar">
        <button type="button" className="btn" onClick={() => setCreating(true)}>
          <IconPlus /> Add service
        </button>
        <div className="staff-search-wrap">
          <IconSearch />
          <input
            type="search"
            placeholder={`Search ${services.length} services...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search services"
          />
        </div>
        <button type="button" className="btn btn-ghost" onClick={exportCsv}>
          Export
        </button>
      </div>

      <div className="staff-segmented" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={categoryId === 'all'}
          className={`staff-seg ${categoryId === 'all' ? 'active' : ''}`}
          onClick={() => setCategoryId('all')}
        >
          All <span className="staff-seg-count">{services.length}</span>
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={categoryId === c.id}
            className={`staff-seg ${categoryId === c.id ? 'active' : ''}`}
            onClick={() => setCategoryId(c.id)}
          >
            {c.name} <span className="staff-seg-count">{counts.get(c.id) ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="card">
        {error && <div className="card-body field-error" style={{ padding: '10px 16px 0' }}>{error}</div>}
        {filtered.length === 0 ? (
          <div className="empty">No services match here.</div>
        ) : (
          <PaginatedTable
            noun="services"
            head={
              <tr>
                <th>Photo</th>
                <th>{copy.services.name}</th>
                <th>{copy.services.type}</th>
                <th>{copy.services.takes}</th>
                <th>{copy.services.cleanupTime}</th>
                <th>{copy.services.price}</th>
                <th>Actions</th>
              </tr>
            }
          >
            {filtered.map((s) => (
              <tr key={s.id} data-row className={s.active ? undefined : 'is-retired'}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Says whether a photo EXISTS — previously every row looked
                        identical whether one had been uploaded or not. */}
                    {s.imageUrl ? (
                      <img className="picker-row-thumb" src={servicePhotoUrl(s)} alt="" width={36} height={36} />
                    ) : (
                      <span className="svc-photo-empty">ADD</span>
                    )}
                    <input
                      ref={(el) => {
                        inputRefs.current[s.id] = el;
                      }}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      style={{ display: 'none' }}
                      onChange={(e) => onPick(s, e.target.files?.[0])}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busyId === s.id}
                      onClick={() => inputRefs.current[s.id]?.click()}
                    >
                      {busyId === s.id ? '…' : s.imageUrl ? 'Change' : 'Upload'}
                    </button>
                    {s.imageUrl && (
                      <button type="button" className="btn btn-ghost btn-danger" disabled={busyId === s.id} onClick={() => onRemovePhoto(s)}>
                        Remove
                      </button>
                    )}
                  </div>
                </td>
                <td style={{ fontWeight: 620 }}>
                  {s.name}
                  {!s.active && <span className="chip chip-completed" style={{ marginLeft: 8 }}>Retired</span>}
                </td>
                <td className="muted">{s.categoryName ?? '—'}</td>
                <td>{copy.services.minutes(s.durationMin)}</td>
                {/* "Cleanup time" instead of "buffer" — same data, words an owner uses. */}
                <td className="muted">{s.bufferAfterMin > 0 ? copy.services.minutes(s.bufferAfterMin) : copy.services.noCleanup}</td>
                <td>{formatMoney(s.priceMinor, s.currency)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button type="button" className="staff-edit-btn" onClick={() => setEditing(s)}>
                      <IconEdit /> Edit
                    </button>
                    {s.active ? (
                      <button type="button" className="btn btn-ghost btn-danger" disabled={busyId === s.id} onClick={() => askRetire(s)}>
                        Retire
                      </button>
                    ) : (
                      <button type="button" className="btn btn-ghost" disabled={busyId === s.id} onClick={() => setActive(s, true)}>
                        Restore
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </PaginatedTable>
        )}
      </div>

      {(creating || editing) && (
        <ServiceForm
          service={editing}
          categories={categories}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(saved) => {
            replace(saved);
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {confirmRetire && (
        <ConfirmDialog
          title={`Retire ${confirmRetire.service.name}?`}
          body="It stops being bookable on WhatsApp and in the dashboard straight away."
          detail={
            confirmRetire.bookings > 0
              ? `${confirmRetire.bookings} past booking${confirmRetire.bookings === 1 ? '' : 's'} keep${confirmRetire.bookings === 1 ? 's' : ''} this service and its price — nothing in your history changes. Already-booked future appointments are not cancelled. You can restore it any time.`
              : 'You can restore it any time.'
          }
          confirmLabel="Retire"
          tone="danger"
          busy={busyId === confirmRetire.service.id}
          onConfirm={() => setActive(confirmRetire.service, false)}
          onCancel={() => setConfirmRetire(null)}
        />
      )}
    </>
  );
}
