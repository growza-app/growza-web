'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { IconChevronDown, IconMapPin } from '../components/icons';

/**
 * Jira GRW-230 — which branch Settings is showing.
 *
 * Lives in the page header so it costs the laptop layout no height (GRW-228
 * fits every tab on one screen), and in the URL (`?branch=`) so a refresh, a
 * shared link and moving between tabs all keep the branch. Only rendered for a
 * business with more than one active branch.
 */
export function SettingsBranchPicker({ branches }: { branches: Array<{ id: string; name: string }> }) {
  const t = useTranslations('settingsHub.branchPicker');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get('branch');
  const picked = branches.find((b) => b.id === current) ?? null;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const go = (id: string | null) => {
    setOpen(false);
    const next = new URLSearchParams(params.toString());
    if (id) next.set('branch', id);
    else next.delete('branch');
    const q = next.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  };

  return (
    <div className="sbp" ref={ref}>
      <button type="button" className={`sbp-btn ${picked ? 'is-branch' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <IconMapPin />
        <span className="sbp-label">{picked ? picked.name : t('all')}</span>
        <IconChevronDown />
      </button>
      {open ? (
        <div className="sbp-menu" role="menu">
          <button type="button" role="menuitemradio" aria-checked={!picked} onClick={() => go(null)}>
            <strong>{t('all')}</strong>
            <span>{t('defaults')}</span>
          </button>
          {branches.map((b) => (
            <button key={b.id} type="button" role="menuitemradio" aria-checked={picked?.id === b.id} onClick={() => go(b.id)}>
              <strong>{b.name}</strong>
              <span>{t('thisOnly')}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Carry `?branch=` onto a settings link. */
export function withBranch(href: string, branch: string | null): string {
  return branch ? `${href}?branch=${encodeURIComponent(branch)}` : href;
}
