'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { OfferBranchField, useDefaultOfferBranch } from './OfferBranchField';
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
  const t = useTranslations('offers.menu');
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
        <IconPlus /> {t('create')}
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
              <span className="dropdown-item-title">{t('offerTitle')}</span>
              <span className="dropdown-item-desc">{t('offerDesc')}</span>
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
              <span className="dropdown-item-title">{t('comboTitle')}</span>
              <span className="dropdown-item-desc">{t('comboDesc')}</span>
            </span>
          </button>
        </div>
      )}
      {showOfferModal && <CreateOfferModal onClose={() => setShowOfferModal(false)} />}
    </div>
  );
}

function CreateOfferModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations('offers.modal');
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Jira GRW-381 — the branch it runs at (the header's until changed here), or every branch.
  const defaultBranch = useDefaultOfferBranch();
  const [pickedBranch, setPickedBranch] = useState<string | null>(null);
  const atBranch = pickedBranch ?? defaultBranch;
  const [allBranches, setAllBranches] = useState(false);

  const save = async () => {
    if (!title.trim()) {
      setTitleError(t('titleRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createOffer({
        title: title.trim(),
        description: description.trim() || null,
        active: true,
        ...(atBranch ? { locationId: atBranch } : {}),
        ...(allBranches ? { allBranches: true } : {}),
      });
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('createFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t('title')}</h3>
        <p className="muted" style={{ margin: '2px 0 0', fontSize: 13.5 }}>
          {t('note')}
        </p>
        <div className="field">
          <label>
            <span>{t('titleLabel')}</span>
            <span className="field-counter">
              {title.length}/{OFFER_TITLE_MAX}
            </span>
          </label>
          <input
            type="text"
            value={title}
            maxLength={OFFER_TITLE_MAX}
            autoFocus
            placeholder={t('titlePlaceholder')}
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
            <span>{t('descLabel')}</span>
            <span className="field-counter">
              {description.length}/{OFFER_DESCRIPTION_MAX}
            </span>
          </label>
          <input
            type="text"
            value={description}
            maxLength={OFFER_DESCRIPTION_MAX}
            placeholder={t('descPlaceholder')}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <OfferBranchField value={atBranch} onChange={setPickedBranch} allBranches={allBranches} onAllBranches={setAllBranches} disabled={busy} />
        {error && <div role="alert" className="field-error" style={{ marginTop: 12 }}>{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </button>
          <button type="button" className="btn" onClick={save} disabled={busy}>
            {busy ? t('creating') : t('create')}
          </button>
        </div>
      </div>
    </div>
  );
}
