'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type { Customer } from '../../lib/api-types';
import { displayPhone, toNationalDigits, toStoredPhone } from '../../lib/phone';
import { useNewVisitCopy } from '../../lib/use-copy';
import { usePhoneProblem } from '../../lib/use-phone-problem';
import { opensSoftKeyboard } from '../../../shared/a11y/soft-keyboard';
import { useDialog } from '../../../shared/a11y/useDialog';
import { IconSearch, IconUserPlus } from '../../components/icons';
import { PhoneField } from '../../components/PhoneField';

/** What the sheet hands back: a client on file, or the one it just created. */
export type PickedClient = {
  /** null when only a name was given: no row exists yet, and the sale creates it. */
  id: string | null;
  name: string | null;
  waPhone: string | null;
};

/** The number box's id: `PhoneField` wires its own label and error to it, and the focus rule below reaches it by it. */
const PHONE_ID = 'pf-client-phone';
const NAME_ID = 'pf-client-name';


/**
 * "Who is paying?" — one sheet, one screen (owner, 2026-10-10).
 *
 * It was three views: search, then an add step with its own number pad, then back. Nothing is swapped out now.
 * A box at the top takes a name or a number, matches appear under it, and when none do, the row beneath them
 * offers to add what was typed. Tapping it opens two small fields IN PLACE, with the typed value already in
 * whichever one it belongs to, and Save beside them.
 *
 * No number pad here: the keyboard is already up for the search box, so a numeric field costs nothing and saves a
 * whole view. The pad stays on the total, which is the one figure nobody should have to open a keyboard for.
 */
export function ClientSheet({ location, onPick, onClose, startAdding = false }: { location: string | null; onPick: (c: PickedClient) => void; onClose: () => void; /** Open with the add row already expanded (the + beside the search bar). */ startAdding?: boolean }) {
  const t = useTranslations('payFlow');
  const nv = useNewVisitCopy();
  const checkPhone = usePhoneProblem();
  const ref = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLInputElement>(null);
  /** `PhoneField` owns its own input, so the number box is reached by the id given to it. */
  const focusPhone = () => document.getElementById(PHONE_ID)?.focus({ preventScroll: true });
  useDialog(ref, { onClose, initialFocus: 'container' });

  const [term, setTerm] = useState('');
  const [matches, setMatches] = useState<Customer[] | null>(null);
  const [adding, setAdding] = useState(startAdding);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPicker, setHasPicker] = useState(false);
  /** Set the first time either field is edited by hand: after that the search box stops writing into them. */
  const ownFields = useRef(false);

  /*
   * The search box takes focus, because tapping a search bar IS asking for the keyboard.
   *
   * The + is not: it asks to add somebody, and a phone that answered by throwing its keyboard over the sheet
   * is the defect the whole `soft-keyboard` helper exists to stop. On a desk, where focus costs nothing, the
   * number field still takes it.
   */
  useEffect(() => {
    if (!startAdding) box.current?.focus({ preventScroll: true });
    else if (!opensSoftKeyboard()) focusPhone();
  }, [startAdding]);

  /*
   * The field being typed in stays above Save client (owner's bug report, 2026-10-10).
   *
   * Save sits in a bar stuck to the bottom of this sheet (`.pf-client-links`), so it is on screen while the keyboard
   * is up. But a browser scrolling a focused field into view only keeps it inside the sheet — it does not know the
   * bar is covering the sheet's bottom — so the phone box landed half under Save, with its countdown and any error
   * under the box hidden completely.
   *
   * Two halves: the bar's height is written to `--pf-bar-h`, which the sheet's `scroll-padding-bottom` reads, so
   * every scroll into view stops above the bar; and the focused field is scrolled into view again when it takes
   * focus and whenever the sheet changes size — the keyboard opening after the tap is the case that hid it, because
   * the sheet shrinks AFTER the browser has already placed the field.
   */
  useEffect(() => {
    const sheet = ref.current;
    if (!sheet) return;
    const measure = () => {
      const bar = sheet.querySelector<HTMLElement>('.pf-client-links');
      sheet.style.setProperty('--pf-bar-h', `${bar?.offsetHeight ?? 0}px`);
    };
    const reveal = () => {
      measure();
      const el = document.activeElement;
      if (!(el instanceof HTMLElement) || !sheet.contains(el) || el === sheet || el.closest('.pf-client-links')) return;
      // The whole field — label, box and the line under it — not only the input.
      (el.closest<HTMLElement>('.field') ?? el).scrollIntoView({ block: 'nearest' });
    };
    // After the browser's own focus scroll, not instead of it. A timer rather than an animation frame: frames are
    // paused in a background tab, and the keyboard can finish opening while the page is still settling.
    const onFocus = () => setTimeout(reveal, 0);
    measure();
    sheet.addEventListener('focusin', onFocus);
    window.visualViewport?.addEventListener('resize', onFocus);
    // A resize callback already runs after layout, so it reveals at once.
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reveal);
    watch?.observe(sheet);
    const bar = sheet.querySelector('.pf-client-links');
    if (bar) watch?.observe(bar);
    return () => {
      sheet.removeEventListener('focusin', onFocus);
      window.visualViewport?.removeEventListener('resize', onFocus);
      watch?.disconnect();
    };
  }, [adding]);

  useEffect(() => {
    setHasPicker(typeof navigator !== 'undefined' && 'contacts' in navigator && typeof (navigator as ContactsNavigator).contacts?.select === 'function');
  }, []);

  const typed = term.trim();
  const enough = typed.length >= 2;
  const typedIsNumber = /^[\d\s()+-]+$/.test(typed);

  // Matches as the name or number goes in; a short term shows nothing rather than everybody.
  useEffect(() => {
    if (!enough) {
      setMatches(null);
      return;
    }
    let gone = false;
    const id = setTimeout(() => {
      void api
        .customers({ search: typed, location, limit: 6 })
        .then((page) => {
          if (!gone) setMatches(page.rows);
        })
        .catch(() => {
          if (!gone) setMatches([]);
        });
    }, 150);
    return () => {
      gone = true;
      clearTimeout(id);
    };
  }, [typed, enough, location]);

  const nobody = enough && matches !== null && matches.length === 0;

  /*
   * What was typed to look for somebody becomes what is typed to add them (owner, 2026-10-10).
   *
   * Opened from the +, the add row is already showing and the search box is still above it. Somebody who types a
   * number up there, finds nobody, and then has to type the same ten digits again into Phone number has been made
   * to do the work twice — and is the likeliest person to give up and leave the sale anonymous. So once the search
   * has come back empty, what they typed drops into whichever field it belongs in.
   *
   * It stops the moment they touch either field by hand: from then on the fields are theirs, not an echo.
   */
  useEffect(() => {
    if (!adding || !nobody || ownFields.current || !typed) return;
    if (typedIsNumber) setNewPhone(toNationalDigits(typed));
    else setNewName(typed);
  }, [adding, nobody, typed, typedIsNumber]);

  /** Open the two fields with what was typed already in the right one — digits to the number, anything else to the name. */
  const openAdd = () => {
    if (typedIsNumber && typed) setNewPhone(toNationalDigits(typed));
    else if (typed) setNewName(typed);
    setError(null);
    setAdding(true);
    // The number is what a client is, so that is where the hands land — but only where no keyboard follows them.
    if (!opensSoftKeyboard()) setTimeout(focusPhone, 0);
  };

  const fromContacts = async () => {
    try {
      const picked = await (navigator as ContactsNavigator).contacts!.select(['name', 'tel'], { multiple: false });
      const c = picked[0];
      if (!c) return;
      const tel = (c.tel?.[0] ?? '').replace(/\D/g, '');
      if (tel) setNewPhone(tel.slice(-10));
      if (c.name?.[0]) setNewName(c.name[0]);
      // Picked out of the phone's own contacts: as deliberate as typing it, so the search box stops writing here.
      ownFields.current = true;
      setAdding(true);
    } catch {
      /* dismissed, or not allowed: the fields are still there */
    }
  };

  /*
   * The name is what is required; the number is what is worth having (owner, 2026-10-10).
   *
   * This was the other way round — a number was compulsory and the name was marked optional — because a number
   * is the only thing that can identify one person across visits. The owner's decision is that no sale may be
   * recorded against nobody, and a counter cannot always get a number out of somebody who is already leaving.
   * So: a name alone saves, a number alone does not, and a number given alongside is still what dedupes them.
   */
  const named = newName.trim().length > 0;
  const problem = checkPhone(newPhone, { required: false });
  const save = async () => {
    if (!named || problem !== null || saving) return;
    const stored = toStoredPhone(newPhone);
    /*
     * No number, no request. A name on its own is not a row this screen can create — `POST /customers` is keyed
     * on the phone — and it does not need to be: the counter-sale route takes `customerName` and writes the
     * client as part of the sale. Returning it unsaved also means an abandoned sale leaves no stray client.
     */
    if (!stored) return onPick({ id: null, name: newName.trim(), waPhone: null });
    setSaving(true);
    setError(null);
    try {
      const made = await api.createCustomer({ phone: stored, name: newName.trim(), ...(location ? { locationId: location } : {}) });
      onPick({ id: made.id, name: made.name, waPhone: made.waPhone });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : nv.saveUnknown);
      setSaving(false);
    }
  };

  /*
   * The countdown runs from the first digit (owner, 2026-10-10).
   *
   * This used to wait for ten digits before saying anything, which silenced the one message written to help:
   * "4 more digits to go". Nine digits left Save grey with no reason given, and a counter that cannot read the
   * button's state has no way to find out. A number counting down is the one piece of feedback everybody reads.
   *
   * An empty box still says nothing — the person has not started, and "Enter a mobile number" under an untouched
   * field is a telling-off, not help. Save stays disabled until the number is real either way.
   */
  const shownProblem = newPhone.length > 0 ? problem : null;

  // A tap on the dimmed area closes it, as every other sheet in the app does (`sheet-backdrop`).
  return (
    <div className="pf-keypad-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="pf-keypad pf-client" role="dialog" aria-modal="true" aria-label={t('whoPays')} tabIndex={-1}>
        <div className="pf-keypad-head">
          <span className="pf-keypad-title">{t('whoPays')}</span>
          <button type="button" className="pf-keypad-clear" onClick={onClose}>
            {nv.close}
          </button>
        </div>

        <div className="pf-client-box">
          <IconSearch />
          <input ref={box} type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t('nameOrNumber')} aria-label={t('nameOrNumber')} autoComplete="off" autoCorrect="off" spellCheck={false} />
        </div>

        {matches && matches.length > 0 ? (
          <ul className="pf-client-matches">
            {matches.map((c) => (
              <li key={c.id}>
                <button type="button" className="pf-client-match" onClick={() => onPick({ id: c.id, name: c.name, waPhone: c.waPhone })}>
                  <span className="pf-face" aria-hidden="true">
                    {(c.name ?? '').trim().charAt(0).toUpperCase() || '?'}
                  </span>
                  <span className="pf-client-match-name">{c.name ?? nv.noName}</span>
                  <span className="pf-client-match-sub">{[c.waPhone ? displayPhone(c.waPhone) : null, c.totalBookings > 0 ? nv.visits(c.totalBookings) : null].filter(Boolean).join(' · ')}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {enough && matches === null ? <p className="pf-client-note">{t('looking')}</p> : null}
        {nobody && !adding ? <p className="pf-client-note">{t('noMatch')}</p> : null}

        {adding ? (
          /* The add row, opened in place under the matches: two small fields and Save. Not a second screen. */
          <div className="pf-client-add-row">
            {/* The app's own field markup, so this label and the number's below it are the same label. */}
            <div className="field">
              <label htmlFor={NAME_ID}>{t('nameOptional')}</label>
              <input
                id={NAME_ID}
                type="text"
                value={newName}
                onChange={(e) => {
                  ownFields.current = true;
                  setNewName(e.target.value);
                }}
                maxLength={80}
                autoComplete="off"
              />
            </div>
            {/*
              The app's own phone field, not a bare `<input type="tel">` (owner, 2026-10-10).
              The one here used `digits.slice(0, 10)`, which turned a pasted or autofilled "+91 98765 43210" into
              9198765432 — ten digits, a valid first digit, saved without a murmur as somebody else's number.
              `PhoneField` shows the +91 as chrome so there is nothing to type twice, and `toNationalDigits` takes
              the prefixes off instead of eating the number. It is also where the countdown under the box comes
              from, which is the whole of "is this long enough yet" said as a number.
            */}
            <div onKeyDown={(e) => e.key === 'Enter' && void save()}>
              <PhoneField
                id={PHONE_ID}
                label={t('phoneNumber')}
                required
                value={newPhone}
                onChange={(digits) => {
                  ownFields.current = true;
                  setNewPhone(digits);
                }}
                error={shownProblem}
              />
            </div>
            {/* The field says what is wrong with the number; this says what the server said about saving it. */}
            {error ? (
              <div role="alert" className="pf-error">
                {error}
              </div>
            ) : null}
            <div className="pf-client-links">
              {hasPicker ? (
                <button type="button" className="pf-mistake" onClick={() => void fromContacts()}>
                  {t('fromContacts')}
                </button>
              ) : null}
              <button type="button" className="btn pf-go pf-client-save" onClick={() => void save()} disabled={saving || !named || problem !== null}>
                {saving ? t('saving') : t('saveClient')}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={nobody ? 'btn pf-go pf-client-add' : 'pf-mistake pf-client-add'} onClick={openAdd}>
            <IconUserPlus />
            {nobody && typed ? t('addTyped', { what: typed }) : t('addClient')}
          </button>
        )}
      </div>
    </div>
  );
}

/** The Contact Picker API (Android Chrome, Samsung Internet): not in TypeScript's DOM types yet. */
interface ContactsNavigator extends Navigator {
  contacts?: { select: (props: string[], opts?: { multiple?: boolean }) => Promise<Array<{ name?: string[]; tel?: string[] }>> };
}
