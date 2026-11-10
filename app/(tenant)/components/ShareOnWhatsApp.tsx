'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { whatsappShareUrl, type ShareItem } from '@growza-app/shared';
import { useDialog } from '../../shared/a11y/useDialog';
import { IconCheck, IconWhatsApp } from './icons';
import { useAreas, useSession, useWhatsappLive } from './SessionProvider';
import { shareMessage, type ShareSession } from '../lib/share-on-whatsapp';

/**
 * Jira GRW-671 — Share on WhatsApp: one button, used on Offers, Packages, Menu and Products.
 *
 * It owns the whole act, so the four screens only say WHAT is shared and WHERE it is sold: the words
 * (`shareTextFor`), then the way out to WhatsApp, in this order —
 *
 *  1. a phone's share sheet (`navigator.share` on a touch screen — the test `ReceiptShare` uses), with the photo when
 *     there is one and the phone can take a file. A cancel is the owner's answer and ends it;
 *  2. otherwise `wa.me/?text=…` in a new tab: WhatsApp with the text typed and no chat chosen;
 *  3. and when the browser blocks that tab, the text in a dialog with a Copy button. Copy is always a button the owner
 *     presses, never done silently on the way out: a silent copy is never pasted (ReceiptShare, 2026-10-28).
 *
 * Growza sends nothing and records nothing (BR-01). Not inside the ⋯ menu: a share hidden in a menu is never found,
 * and ⋯ keeps Edit and Delete.
 */

const PHOTO_WAIT_MS = 2000;

/** Everything the words need that the session already holds. */
export function useShareSession(): ShareSession {
  const session = useSession();
  const areas = useAreas();
  const whatsappLive = useWhatsappLive();
  return useMemo(
    () => ({
      lang: session?.lang === 'hi' ? 'hi' : 'en',
      tone: session?.share?.tone ?? 'neutral',
      businessName: session?.businessName ?? '',
      businessPhone: session?.share?.businessPhone ?? null,
      timezone: session?.timezone ?? 'Asia/Kolkata',
      branches: session?.branches ?? [],
      bookingLive: whatsappLive && areas.bookings,
    }),
    [session, areas.bookings, whatsappLive],
  );
}

/** A phone's share sheet: a touch screen whose browser can hand things to another app. */
function hasShareSheet(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

/**
 * The photo as a file a share sheet can carry, or null within two seconds.
 *
 * Fetched BEFORE the tap (on the finger landing, a hover or a focus — see `usePhotoReady`), never between the tap and
 * the share: a browser only lets `navigator.share` open in answer to a tap, and Safari stops counting it as one after
 * about a second. A photo fetched in that gap made every photo share on an iPhone fall through to the Copy dialog.
 * The row already shows this same URL, so the fetch is usually the browser's own cached copy.
 */
export async function photoFile(url: string): Promise<File | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PHOTO_WAIT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    const ext = blob.type.split('/')[1]?.split('+')[0] || 'jpg';
    return new File([blob], `photo.${ext}`, { type: blob.type });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const isCancel = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

/**
 * Opens WhatsApp with `text`, and `photo` when it is already in hand. Resolves to the text when it could not (the
 * caller shows it to copy), else null. Nothing is awaited before the share sheet is asked for, so the tap still
 * counts. Exported for the tests, which drive it with a fake `navigator` and `window.open`.
 */
export async function openWhatsApp(text: string, photo?: File | null): Promise<string | null> {
  if (hasShareSheet()) {
    if (photo && (!navigator.canShare || navigator.canShare({ files: [photo] }))) {
      try {
        await navigator.share({ files: [photo], text });
        return null;
      } catch (error) {
        if (isCancel(error)) return null;
        /* the phone would not take the photo: try the words alone */
      }
    }
    try {
      await navigator.share({ text });
      return null;
    } catch (error) {
      if (isCancel(error)) return null;
      /* no sheet after all: fall through to wa.me */
    }
  }
  // Not `noopener` in the features: with it `window.open` always answers null, and a blocked tab could not be told
  // from an opened one. The opener is cut by hand instead.
  const tab = window.open(whatsappShareUrl(text), '_blank');
  if (!tab) return text;
  try {
    tab.opener = null;
  } catch {
    /* a cross-origin tab may refuse; it has already navigated away from us */
  }
  return null;
}

/** The text to paste, when WhatsApp could not be opened. */
function CopyShareDialog({ text, onClose }: { text: string; onClose: () => void }) {
  const t = useTranslations('share');
  const ref = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  useDialog(ref, { onClose });
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      return;
    } catch {
      /* an older browser, or no permission: select it and use the old command */
    }
    area.current?.select();
    try {
      if (document.execCommand('copy')) setCopied(true);
    } catch {
      /* the text is selected; the owner can copy it themselves */
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-fit share-copy-modal" role="dialog" aria-modal="true" aria-label={t('copyTitle')} ref={ref} onClick={(e) => e.stopPropagation()}>
        <h3>{t('copyTitle')}</h3>
        <div className="modal-body">
          <p className="muted share-copy-note">{t('copyNote')}</p>
          <textarea ref={area} className="share-copy-text" readOnly value={text} rows={8} aria-label={t('copyTitle')} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('close')}
          </button>
          <button type="button" className="btn" onClick={() => void copy()} aria-live="polite">
            {copied ? (
              <>
                <IconCheck /> {t('copied')}
              </>
            ) : (
              t('copy')
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface ShareTarget {
  item: ShareItem;
  /** The branch it is sold at — the row's own. */
  branchId: string | null | undefined;
  /** An offer or package is booked; a product or dish is not (no booking link for it). */
  bookable: boolean;
  photoUrl?: string | null;
}

/**
 * The photo, fetched ahead of the tap. `warm` starts it (once) when the button comes on screen, and again on any sign
 * the owner is about to tap (the finger landing, a hover, a keyboard focus) in case it was missed — and only on a
 * phone with a share sheet, since nothing else can carry a photo to WhatsApp. The row beside the button already shows
 * this photo, so the fetch is the browser's cached copy, not a second download.
 *
 * `ready()` is whatever has arrived by the tap, without waiting: a photo still loading is left out and the words go
 * alone, rather than costing the share sheet the tap it needs. Warming only on the finger landing was measured in a
 * real Chromium (2026-11-05): the first tap on a row went out words-only, the second with the photo.
 */
function usePhotoReady(url: string | null | undefined, button: RefObject<HTMLElement | null>) {
  const file = useRef<File | null>(null);
  const started = useRef<string | null>(null);
  const warm = useCallback(() => {
    if (!url || started.current === url || !hasShareSheet()) return;
    started.current = url;
    file.current = null;
    void photoFile(url).then((f) => {
      if (started.current === url) file.current = f;
    });
  }, [url]);
  useEffect(() => {
    const el = button.current;
    if (!url || !el || typeof IntersectionObserver === 'undefined' || !hasShareSheet()) return;
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        warm();
        seen.disconnect();
      }
    });
    seen.observe(el);
    return () => seen.disconnect();
  }, [url, button, warm]);
  return { warm, ready: () => (started.current === url ? file.current : null) };
}

/** The act itself, for a button that is not the icon (the after-save banner). */
function useShare(target: ShareTarget, onFinished?: () => void) {
  const session = useShareSession();
  const [copyText, setCopyText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A ref, not the state above: two taps inside one frame both read the state as "not busy" and opened two tabs.
  const inFlight = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const photo = usePhotoReady(target.photoUrl, button);
  const share = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const text = shareMessage(target.item, { branchId: target.branchId, bookable: target.bookable }, session);
      const toCopy = await openWhatsApp(text, photo.ready());
      // Finished only once WhatsApp has the text: a blocked tab leaves the Copy dialog open, and finishing then would
      // take the dialog away with whatever drew it.
      if (toCopy) setCopyText(toCopy);
      else onFinished?.();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const closeCopy = () => {
    setCopyText(null);
    onFinished?.();
  };
  const dialog = copyText ? <CopyShareDialog text={copyText} onClose={closeCopy} /> : null;
  return { share, busy, dialog, warm: photo.warm, button };
}

/**
 * The icon button on a row. Drawn at 32px beside ⋯, with a 44px target (the HIG's minimum) that does not grow the
 * row. Named with the item, so ten of them on one screen are ten different buttons to a screen reader.
 */
export function ShareOnWhatsAppButton(props: ShareTarget & { className?: string }) {
  const t = useTranslations('share');
  const { share, busy, dialog, warm, button } = useShare(props);
  return (
    <>
      <button
        ref={button}
        type="button"
        className={`share-wa-btn ${props.className ?? ''}`}
        aria-label={t('buttonFor', { name: props.item.name })}
        title={t('button')}
        aria-busy={busy || undefined}
        onPointerDown={warm}
        onPointerEnter={warm}
        onFocus={warm}
        onClick={(e) => {
          // The rows open the item on a tap; this tap is the share's alone.
          e.stopPropagation();
          void share();
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <IconWhatsApp />
      </button>
      {dialog}
    </>
  );
}

/**
 * Above the list, after a new offer or package is saved: "Offer saved. Tell your clients now?" — Share on WhatsApp
 * or Later. Not on a timer: a button must not vanish under a finger. Later, Share, or leaving the screen ends it.
 */
export function JustCreatedShareBanner({ kind, onDone, ...target }: ShareTarget & { kind: 'offer' | 'package'; onDone: () => void }) {
  const t = useTranslations('share');
  const { share, busy, dialog } = useShare(target, onDone);
  return (
    <div className="banner banner-info share-saved-banner" role="status">
      <span className="share-saved-text">
        <IconCheck />
        {t(kind === 'package' ? 'savedPackage' : 'savedOffer')}
      </span>
      <span className="share-saved-actions">
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          {t('later')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void share()}
        >
          <IconWhatsApp /> {t('button')}
        </button>
      </span>
      {dialog}
    </div>
  );
}
