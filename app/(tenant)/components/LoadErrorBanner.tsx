import { useTranslations } from 'next-intl';
import { type LoadErrorKind } from '../lib/load-error';

/**
 * The words under a failed load: a "try again in a moment" for a busy server,
 * the developer hint for a genuinely unreachable one. No `'use client'` — it has
 * no state, so server pages and the Reports client both render it. The text
 * comes from `messages/<lang>.json` (Jira GRW-319), so it follows the language.
 */
export function LoadErrorHelp({ kind }: { kind: LoadErrorKind }) {
  const t = useTranslations('errors');
  return kind === 'busy' ? <>{t('busyHelp')}</> : <>{t.rich('downHelp', { code: (chunks) => <code>{chunks}</code> })}</>;
}

/**
 * The banner a page shows when the reads it needs to draw itself failed.
 *
 * ## It takes a `kind`, never the caught error
 *
 * The first version took `error` and rendered fine for a 429 — and returned a
 * 500 for a server that was genuinely down. In dev, React serialises a server
 * component's props into its debug stream, and a network failure's `cause` is
 * an `AggregateError` that the serialiser cannot walk (`frame.join is not a
 * function`). A 429's `ApiError` has no such cause, so the busy path hid it.
 *
 * Pass `loadErrorKind(error)`. A `'busy' | 'down'` string is always safe to
 * hand across a component boundary, and the type now refuses anything else.
 */
export function LoadErrorBanner({ kind }: { kind: LoadErrorKind }) {
  const t = useTranslations('errors');
  return (
    <div className="banner">
      <strong>{kind === 'busy' ? t('busy') : t('down')}</strong> <LoadErrorHelp kind={kind} />
    </div>
  );
}
