'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type Offer } from '../lib/api';
import { markJustCreated } from '../lib/just-created';
import { OfferBranchField, useDefaultOfferBranch } from './OfferBranchField';
import { IconPlus } from '../components/icons';
import { useWritable } from '../components/SessionProvider';
import { autoFocusField } from '../../shared/a11y/soft-keyboard';

const OFFER_TITLE_MAX = 60;
const OFFER_DESCRIPTION_MAX = 120;

/**
 * Creating an announcement — the wording-only offer a customer reads.
 *
 * Jira GRW-438 — this used to be a two-way menu: an announcement, or a package. Packages moved to their own
 * screen with their own Build button, which left this dropdown with exactly one row in it. A menu of one is
 * a tap the owner has to make for no reason, so the button opens the modal directly now.
 */
export function CreateOfferMenu() {
  const t = useTranslations('offers.menu');
  const [showOfferModal, setShowOfferModal] = useState(false);
  // Jira GRW-556 (follow-up) — a business suspended for non-payment reads its offers and makes none.
  if (!useWritable()) return null;

  return (
    <div className="create-offer-menu">
      <button type="button" className="btn" onClick={() => setShowOfferModal(true)}>
        {/* GRW-30 — a real icon, for the same reason as Clients'. */}
        <IconPlus /> {t('create')}
      </button>
      {showOfferModal && <OfferModal onClose={() => setShowOfferModal(false)} />}
    </div>
  );
}

/**
 * The offer box: a new announcement, or — given `offer` — the same box filled in to change one.
 *
 * QA 2026-11-14 — Edit on an offer's ⋮ menu (and a double-click on the row) went to `/offers/<id>/edit`, which
 * GRW-438 had moved to `/packages/<id>/edit` along with the builder it held. Announcements were left with no
 * editor at all and the owner landed on "This page is not here". Wording is all an announcement has, so it is
 * changed where it was written. The branch is not offered: an offer stays at its branch (the API refuses to
 * move it — GRW-381 FR-04), and another branch gets its own copy.
 */
export function OfferModal({ offer, onClose }: { offer?: Offer; onClose: () => void }) {
  const t = useTranslations('offers.modal');
  const router = useRouter();
  const editing = offer !== undefined;
  const [title, setTitle] = useState(offer?.title ?? '');
  const [description, setDescription] = useState(offer?.description ?? '');
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
      if (offer) {
        await api.updateOffer(offer.id, { title: title.trim(), description: description.trim() || null });
        router.refresh();
        onClose();
        return;
      }
      const created = await api.createOffer({
        title: title.trim(),
        description: description.trim() || null,
        active: true,
        ...(atBranch ? { locationId: atBranch } : {}),
        ...(allBranches ? { allBranches: true } : {}),
      });
      // Jira GRW-671 — the list beside this modal asks once: "Offer saved. Tell your clients now?"
      markJustCreated(created.id, 'offer');
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(editing ? 'saveFailed' : 'createFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t(editing ? 'editTitle' : 'title')}</h3>
        <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
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
            autoFocus={autoFocusField()}
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
        {editing ? null : <OfferBranchField value={atBranch} onChange={setPickedBranch} allBranches={allBranches} onAllBranches={setAllBranches} disabled={busy} />}
        {error && <div role="alert" className="field-error" style={{ marginTop: 12 }}>{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </button>
          <button type="button" className="btn" onClick={save} disabled={busy}>
            {editing ? (busy ? t('saving') : t('save')) : busy ? t('creating') : t('create')}
          </button>
        </div>
      </div>
    </div>
  );
}
