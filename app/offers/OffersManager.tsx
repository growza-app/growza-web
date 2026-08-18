'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type Offer } from '../lib/api';

/**
 * Admin CRUD for the Offers section — informational content only (no
 * discount/pricing logic, see migration 0003). Built for a daily-edit
 * workflow: add, tweak wording, toggle on/off, delete when stale.
 */
export function OffersManager({ offers }: { offers: Offer[] }) {
  const router = useRouter();
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [busy, setBusy] = useState<string | null>(null); // offer id currently being mutated, or 'new'
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const addOffer = async () => {
    if (!newTitle.trim()) return;
    setBusy('new');
    try {
      await api.createOffer({ title: newTitle.trim(), description: newDescription.trim() || undefined });
      setNewTitle('');
      setNewDescription('');
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const toggleActive = async (offer: Offer) => {
    setBusy(offer.id);
    try {
      await api.updateOffer(offer.id, { active: !offer.active });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const startEdit = (offer: Offer) => {
    setEditingId(offer.id);
    setEditTitle(offer.title);
    setEditDescription(offer.description ?? '');
  };

  const saveEdit = async (offerId: string) => {
    if (!editTitle.trim()) return;
    setBusy(offerId);
    try {
      await api.updateOffer(offerId, { title: editTitle.trim(), description: editDescription.trim() || null });
      setEditingId(null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const removeOffer = async (offerId: string) => {
    setBusy(offerId);
    try {
      await api.deleteOffer(offerId);
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="card">
        <div className="card-head">
          <span>Add a new offer</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <label htmlFor="new-offer-title">Title</label>
            <input
              id="new-offer-title"
              type="text"
              placeholder="e.g. 20% off Women's Hair Color"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              disabled={busy === 'new'}
            />
          </div>
          <div className="field">
            <label htmlFor="new-offer-description">Description (optional)</label>
            <input
              id="new-offer-description"
              type="text"
              placeholder="e.g. This week only — mention it when you arrive."
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              disabled={busy === 'new'}
            />
          </div>
          <div>
            <button className="btn" onClick={addOffer} disabled={busy === 'new' || !newTitle.trim()}>
              {busy === 'new' ? 'Adding…' : 'Add offer'}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span>Your offers</span>
          <span className="muted" style={{ fontWeight: 550, fontSize: 14 }}>
            {offers.filter((o) => o.active).length} active of {offers.length}
          </span>
        </div>
        {offers.length === 0 ? (
          <div className="empty">No offers yet — add one above.</div>
        ) : (
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {offers.map((offer) => (
              <div key={offer.id} className="offer-row">
                {editingId === offer.id ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} disabled={busy === offer.id} />
                    <input
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Description (optional)"
                      disabled={busy === offer.id}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn" onClick={() => saveEdit(offer.id)} disabled={busy === offer.id || !editTitle.trim()}>
                        Save
                      </button>
                      <button className="btn btn-ghost" onClick={() => setEditingId(null)} disabled={busy === offer.id}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 620 }}>{offer.title}</span>
                        <span className={`chip ${offer.active ? 'chip-confirmed' : 'chip-cancelled'}`}>
                          {offer.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      {offer.description && <div className="muted" style={{ marginTop: 3 }}>{offer.description}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button className="btn btn-ghost" onClick={() => startEdit(offer)} disabled={busy === offer.id}>
                        Edit
                      </button>
                      <button className="btn btn-ghost" onClick={() => toggleActive(offer)} disabled={busy === offer.id}>
                        {offer.active ? 'Turn off' : 'Turn on'}
                      </button>
                      <button className="btn btn-ghost" onClick={() => removeOffer(offer.id)} disabled={busy === offer.id}>
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
