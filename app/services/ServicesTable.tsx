'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, formatMoney, type Service } from '../lib/api';
import { copy } from '../lib/copy';
import { servicePhotoUrl } from '../lib/service-photos';
import { PaginatedTable } from '../components/PaginatedTable';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Photo upload lives here (not the combo builder) — a service's photo is a
 * property of the service itself, reused everywhere it's pictured (builder
 * picker, previews), so it's set once at the source rather than per-combo.
 */
export function ServicesTable({ services: initial }: { services: Service[] }) {
  const router = useRouter();
  const [services, setServices] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const onPick = async (service: Service, file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_PHOTO_BYTES) {
      setError(`${service.name}: photo must be under 5MB.`);
      return;
    }
    setBusyId(service.id);
    try {
      const updated = await api.uploadServicePhoto(service.id, file);
      setServices((prev) => prev.map((s) => (s.id === service.id ? updated : s)));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusyId(null);
    }
  };

  const onRemove = async (service: Service) => {
    setError(null);
    setBusyId(service.id);
    try {
      const updated = await api.removeServicePhoto(service.id);
      setServices((prev) => prev.map((s) => (s.id === service.id ? updated : s)));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="card">
      {error && <div className="card-body field-error" style={{ padding: '10px 16px 0' }}>{error}</div>}
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
          </tr>
        }
      >
        {services.map((s) => (
              <tr key={s.id} data-row>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img className="picker-row-thumb" src={servicePhotoUrl(s)} alt="" width={36} height={36} />
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
                      <button type="button" className="btn btn-ghost btn-danger" disabled={busyId === s.id} onClick={() => onRemove(s)}>
                        Remove
                      </button>
                    )}
                  </div>
                </td>
                <td style={{ fontWeight: 620 }}>{s.name}</td>
                <td className="muted">{s.categoryName ?? '—'}</td>
                <td>{copy.services.minutes(s.durationMin)}</td>
                {/* "Cleanup time" instead of "buffer" — same data, words an owner uses. */}
                <td className="muted">{s.bufferAfterMin > 0 ? copy.services.minutes(s.bufferAfterMin) : copy.services.noCleanup}</td>
                <td>{formatMoney(s.priceMinor, s.currency)}</td>
              </tr>
        ))}
      </PaginatedTable>
    </div>
  );
}
