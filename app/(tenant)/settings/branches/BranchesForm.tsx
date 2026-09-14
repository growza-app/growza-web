'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BranchActionDialog } from './BranchActionDialog';
import { IconCheck, IconMapPin, IconStaff } from '../../components/icons';
import { ApiError, BookingConflictError, api, type BranchSettings } from '../../lib/api';

/**
 * Jira GRW-227 — Settings › Branches: every branch of the business, each its
 * own card with its own Save.
 *
 * One Save per card rather than one for the page, because a branch is one
 * thing an owner corrects at a time ("Indiranagar moved") and a refused save
 * ("another branch already has this name") has to point at the card it came
 * from. Adding, closing and reordering branches stays in the admin portal;
 * opening hours are still one set for the whole business (Jira GRW-64).
 */

const NAME_MAX = 50;
const ADDRESS_MAX = 100;

type Draft = { name: string; addressLine1: string; addressCity: string };
const draftOf = (b: BranchSettings): Draft => ({ name: b.name, addressLine1: b.addressLine1, addressCity: b.addressCity });

export function BranchesForm({ initial }: { initial: BranchSettings[] }) {
  return (
    <div className="bp-form">
      <div className="bp-intro">
        <h2 className="bp-title">Branches</h2>
        <p className="bp-sub">
          Your {initial.length} branches. Opening hours are the same for all of them — change them in Working hours.
        </p>
      </div>
      <div className="bp-branches">
        {initial.map((b) => (
          <BranchCard key={b.id} initial={b} />
        ))}
      </div>
      {/* Jira GRW-246 — the owner closes a branch or makes one main here; adding or reopening one raises the bill, so it goes through support. */}
      <p className="field-hint bp-foot">To add a branch, or open a closed one again, contact Growza support.</p>
    </div>
  );
}

function BranchCard({ initial }: { initial: BranchSettings }) {
  const router = useRouter();
  const [branch, setBranch] = useState(initial);
  const [action, setAction] = useState<'close' | 'make-main' | null>(null);
  const [d, setD] = useState<Draft>(() => draftOf(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const saved0 = draftOf(branch);
  const dirty = d.name !== saved0.name || d.addressLine1 !== saved0.addressLine1 || d.addressCity !== saved0.addressCity;
  const set = (key: keyof Draft, value: string) => {
    setD((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setError(null);
    if (key === 'name') setNameError(null);
  };

  const save = async () => {
    if (!d.name.trim()) {
      setNameError('Branch name cannot be empty');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { branch: next } = await api.updateBranch(branch.id, d);
      setBranch(next);
      setD(draftOf(next));
      setSaved(true);
    } catch (e) {
      // The client raises every 409 as BookingConflictError; here it can only be the name (BR-02).
      if (e instanceof BookingConflictError) setNameError(e.message);
      else setError(e instanceof ApiError && e.status === 400 ? e.message : 'Could not save — check the server is running.');
    } finally {
      setBusy(false);
    }
  };

  const id = (field: string) => `branch-${branch.id}-${field}`;

  return (
    <form
      className="card bp-card"
      aria-labelledby={id('title')}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="bp-card-head">
        <span className="bp-card-icon">
          <IconMapPin />
        </span>
        <div className="bp-branch-title">
          <div className="bp-card-title" id={id('title')}>
            {branch.name}
            {branch.isPrimary ? <span className="bp-badge">Main</span> : null}
          </div>
          <div className="bp-branch-meta">
            <IconStaff /> {branch.staffCount === 1 ? '1 staff member' : `${branch.staffCount} staff`}
          </div>
        </div>
        {branch.isPrimary ? null : (
          <div className="bp-branch-actions">
            <button type="button" className="btn btn-ghost bp-action-btn" onClick={() => setAction('make-main')}>
              Make main
            </button>
            <button type="button" className="btn btn-ghost btn-danger bp-action-btn" onClick={() => setAction('close')}>
              Close branch
            </button>
          </div>
        )}
      </div>
      {action ? (
        <BranchActionDialog
          action={action}
          branch={{ id: branch.id, name: branch.name }}
          onCancel={() => setAction(null)}
          onDone={() => {
            setAction(null);
            router.refresh();
          }}
        />
      ) : null}

      <div className="bp-grid">
        <div className="field">
          <label htmlFor={id('name')}>
            <span>Branch name</span>
            <span className="field-counter">
              {d.name.length}/{NAME_MAX}
            </span>
          </label>
          <input
            id={id('name')}
            type="text"
            value={d.name}
            maxLength={NAME_MAX}
            onChange={(e) => set('name', e.target.value)}
            className={nameError ? 'field-invalid' : ''}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? id('name-error') : undefined}
          />
          {nameError ? (
            <div className="field-error" id={id('name-error')}>
              {nameError}
            </div>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor={id('city')}>
            <span>City</span>
          </label>
          <input id={id('city')} type="text" value={d.addressCity} onChange={(e) => set('addressCity', e.target.value)} />
        </div>
        <div className="field bp-span">
          <label htmlFor={id('address')}>
            <span>Address</span>
            <span className="field-counter">
              {d.addressLine1.length}/{ADDRESS_MAX}
            </span>
          </label>
          <input id={id('address')} type="text" value={d.addressLine1} maxLength={ADDRESS_MAX} onChange={(e) => set('addressLine1', e.target.value)} placeholder="Shop number, street, area" />
        </div>
      </div>

      <div className="bp-card-actions" role="status" aria-live="polite">
        <span className={`bp-save-state ${error ? 'is-error' : ''}`}>
          {error ? (
            error
          ) : saved && !dirty ? (
            <>
              <IconCheck /> Saved
            </>
          ) : dirty ? (
            'Unsaved changes'
          ) : null}
        </span>
        <button type="submit" className="btn bp-save" disabled={busy || !dirty}>
          {busy ? 'Saving…' : 'Save branch'}
        </button>
      </div>
    </form>
  );
}
