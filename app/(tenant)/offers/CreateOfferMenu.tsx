'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { IconPlus } from '../components/icons';

const OFFER_TITLE_MAX = 60;
const OFFER_DESCRIPTION_MAX = 120;

/**
 * "Combo" and "Offer" are the same underlying row (migration 0003/0008) —
 * a combo is just an offer with a comboPriceMinor and linked services. The
 * combo builder wizard (services + pricing + rules) is the right shape for
 * that, but wrong for a plain wording-only offer, so this splits creation
 * into two paths at the point of intent rather than forcing every offer
 * through the wizard.
 */
export function CreateOfferMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, [open]);

  return (
    <div className="create-offer-menu" ref={menuRef}>
      <button type="button" className="btn" onClick={() => setOpen((v) => !v)}>
        {/* GRW-30 — a real icon, for the same reason as Clients'. */}
        <IconPlus /> Create offer
      </button>
      {open && (
        <div className="dropdown-panel">
          <button
            type="button"
            className="dropdown-item"
            onClick={() => {
              setOpen(false);
              setShowOfferModal(true);
            }}
          >
            <span className="dropdown-item-icon dropdown-item-icon-offer">🏷️</span>
            <span>
              <span className="dropdown-item-title">Offer</span>
              <span className="dropdown-item-desc">Discounts, special price or free service</span>
            </span>
          </button>
          <button
            type="button"
            className="dropdown-item"
            onClick={() => {
              setOpen(false);
              router.push('/offers/new');
            }}
          >
            <span className="dropdown-item-icon dropdown-item-icon-combo">🎁</span>
            <span>
              <span className="dropdown-item-title">Combo</span>
              <span className="dropdown-item-desc">Bundle services at a special price</span>
            </span>
          </button>
        </div>
      )}
      {showOfferModal && <CreateOfferModal onClose={() => setShowOfferModal(false)} />}
    </div>
  );
}

function CreateOfferModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!title.trim()) {
      setTitleError('Offer title is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createOffer({ title: title.trim(), description: description.trim() || null, active: true });
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the offer.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>New offer</h3>
        <p className="muted" style={{ margin: '2px 0 0', fontSize: 13.5 }}>
          Informational only — wording customers see, no linked services or price. For a bookable bundle, use Combo instead.
        </p>
        <div className="field">
          <label>
            <span>Offer title *</span>
            <span className="field-counter">
              {title.length}/{OFFER_TITLE_MAX}
            </span>
          </label>
          <input
            type="text"
            value={title}
            maxLength={OFFER_TITLE_MAX}
            autoFocus
            placeholder="e.g. 20% off Women's Hair Color"
            className={titleError ? 'field-invalid' : undefined}
            onChange={(e) => {
              setTitle(e.target.value);
              if (titleError && e.target.value.trim()) setTitleError(null);
            }}
          />
          {titleError && <div role="alert" className="field-error">{titleError}</div>}
        </div>
        <div className="field">
          <label>
            <span>Description (optional)</span>
            <span className="field-counter">
              {description.length}/{OFFER_DESCRIPTION_MAX}
            </span>
          </label>
          <input
            type="text"
            value={description}
            maxLength={OFFER_DESCRIPTION_MAX}
            placeholder="e.g. This week only — mention this offer when you arrive."
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {error && <div role="alert" className="field-error" style={{ marginTop: 12 }}>{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={save} disabled={busy}>
            {busy ? 'Creating…' : 'Create offer'}
          </button>
        </div>
      </div>
    </div>
  );
}
