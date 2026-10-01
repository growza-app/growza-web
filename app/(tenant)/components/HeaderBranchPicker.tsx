'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useBranch } from './BranchProvider';
import { IconChevronDown, IconMapPin } from './icons';
import { branchInAddress, oneBranchOnly, wholeBusiness } from '../lib/branch-routes';
import { ALL_BRANCHES_PARAM } from '../lib/branch-url-sync';

/**
 * Jira GRW-395 — the one branch picker, in the header of every screen.
 *
 * Every screen already shared ONE branch choice (`BranchProvider`, GRW-377), but each picked it for itself:
 * tabs on a phone and a dropdown on a laptop on Home, Bookings, Clients, Services and Attendance, a dropdown on
 * Reports, a select on Free times, and nothing at all on Staff and Offers. The owner decided (2026-09-25) that
 * the app is branch-driven: pick a branch once, here, and the whole app is that branch. "All branches" is the
 * overview.
 *
 * - A business with one branch sees nothing (there is nothing to choose).
 * - A receptionist or stylist fixed to a branch sees its name, and no choice.
 * - A screen that can only ever show one branch (`oneBranchOnly`) offers only branches, never "All": on "All"
 *   it shows the branch that screen is actually showing (the main one), and picking one there picks it for
 *   every screen.
 * - A screen drawn on the server from `?branch=` (`branchInAddress`) gets the new branch in its address, so it
 *   redraws; the others follow the shared choice where they are.
 *
 * - Settings is a one-branch screen (Jira GRW-396); its whole-business pages (`wholeBusiness`) show no picker.
 */
/** When a branch was last picked — see the mount effect. Module-wide: the picker that reads it is a new one. */
let pickedAt = 0;

export function HeaderBranchPicker({ variant = 'pill' }: { variant?: 'pill' | 'line' } = {}) {
  const t = useTranslations('chrome.branchPicker');
  const branch = useBranch();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { pickerOpen: open, setPickerOpen: setOpen } = branch;

  /**
   * Back to the button, once the list has gone: whichever picker is on screen, found in the page rather than
   * through this instance. A header holds two (the laptop's pill and the phone's line, one hidden by CSS) and
   * only ONE of their Escape listeners ever runs — the first closes the list, React redraws between listeners,
   * and the second is removed before its turn. It was the hidden line's on every screen, so focus fell to the
   * page (GRW-395 QA).
   */
  const refocus = () => {
    const shownButton = [...document.querySelectorAll<HTMLElement>('.hbp .sbp-btn')].find((b) => b.getClientRects().length > 0);
    shownButton?.focus();
  };

  // A screen keyed by branch (Clients) draws a new header for the branch just picked, and the button that had
  // focus goes with the old one: the new picker takes it back, if the pick was a moment ago.
  useEffect(() => {
    if (Date.now() - pickedAt > 3000) return;
    pickedAt = 0;
    refocus();
  }, []);

  // Closes on a tap anywhere else, on Escape, or when focus leaves it (Tab past the last branch), handing focus
  // back to the button (Home's rules, Jira GRW-309). `pointerdown`, not `click`: it closes before the tap lands,
  // so the thing tapped still gets it.
  useEffect(() => {
    if (!open) return;
    // Any picker counts as inside: a header holds two (the laptop's pill and the phone's line, one hidden by
    // CSS), and they share one open state — a tap on either must not be read as a tap outside the other.
    const onPointer = (e: PointerEvent) => {
      if (!(e.target instanceof Element && e.target.closest('.hbp'))) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      refocus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  // The laptop's pill in the header's controls; the phone's line under the title, where a crowded header row
  // (a title, "Add", search and the avatar) has no room for it. CSS shows the one for the width.
  const where = variant === 'line' ? 'hbp-line' : 'hbp-pill';

  // A member held to a branch is told which, and offered nothing (their `branches` is that one alone).
  if (branch.pinned) {
    return branch.workBranchName ? (
      <div className={`sbp hbp ${where}`}>
        <span className="sbp-btn is-branch hbp-fixed" title={branch.workBranchName}>
          <IconMapPin />
          <span className="sbp-label">{branch.workBranchName}</span>
        </span>
      </div>
    ) : null;
  }
  if (!branch.multi || wholeBusiness(pathname)) return null;

  const oneOnly = oneBranchOnly(pathname);
  /*
   * A screen drawn from its address shows the address's branch, so the header names that one. Free times does not
   * make an address's branch everyone's (its form always sends one, and that undid an "All" chosen elsewhere), so
   * a link to Koramangala's free times, or Back onto one, showed Koramangala's times under "Indiranagar"
   * (GRW-395 QA).
   */
  const inAddress = branchInAddress(pathname) ? params.get('branch') : null;
  const addressed = inAddress && branch.branches.some((b) => b.id === inAddress) ? inAddress : null;
  const shownId =
    addressed ?? (inAddress === ALL_BRANCHES_PARAM && !oneOnly ? null : oneOnly ? branch.one : branch.choice);
  const shown = branch.branches.find((b) => b.id === shownId) ?? null;

  const go = (id: string | null) => {
    setOpen(false);
    refocus();
    pickedAt = Date.now();
    branch.setBranch(id);
    if (!branchInAddress(pathname)) return;
    const next = new URLSearchParams(params.toString());
    next.set('branch', id ?? ALL_BRANCHES_PARAM);
    router.replace(`${pathname}?${next.toString()}`);
  };

  return (
    <div
      className={`sbp hbp ${where}`}
      onBlur={(e) => {
        if (open && !(e.relatedTarget instanceof Element && e.relatedTarget.closest('.hbp'))) setOpen(false);
      }}
    >
      {/* A disclosure, not an ARIA menu: a menu promises arrow keys and type-ahead, and this is a short list of
          buttons Tab walks through (GRW-395 QA). The branch shown is marked `aria-current`. */}
      <button
        type="button"
        className={`sbp-btn ${shown ? 'is-branch' : ''}`}
        aria-expanded={open}
        aria-label={`${t('label')}: ${shown?.name ?? t('all')}`}
        title={shown?.name ?? t('all')}
        onClick={() => setOpen(!open)}
      >
        <IconMapPin />
        <span className="sbp-label">{shown?.name ?? t('all')}</span>
        <IconChevronDown />
      </button>
      {open ? (
        <div className="sbp-menu" role="group" aria-label={t('label')}>
          {oneOnly ? null : (
            <button type="button" aria-current={shown === null ? 'true' : undefined} onClick={() => go(null)}>
              <strong>{t('all')}</strong>
              <span>{t('allHint')}</span>
            </button>
          )}
          {branch.branches.map((b) => (
            <button key={b.id} type="button" aria-current={shown?.id === b.id ? 'true' : undefined} onClick={() => go(b.id)}>
              <strong>{b.name}</strong>
              <span>{t('thisBranch')}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
