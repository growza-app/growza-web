import { getTranslations } from 'next-intl/server';
import type { ChannelOrdersLine } from '../lib/api-types';
import { bringInLine } from '../lib/channel-keys-state';
import type { Lang } from '../lib/lang';

/**
 * Jira GRW-623 — one quiet line per connected marketplace, above the list: when its orders were last brought in, why not if they could
 * not be, and how many are waiting for a size. So the owner can see it is working without reading a log.
 *
 * A server component: it is read once with the page and holds no state. Says nothing for a marketplace nothing is asking yet.
 */
export async function OrdersBringIn({ lines, lang, timezone }: { lines: ChannelOrdersLine[]; lang: Lang; timezone: string }) {
  const t = await getTranslations('orders');
  const name = (c: ChannelOrdersLine['channel']) => t(`channels.${c}`);
  const when = (iso: string) =>
    new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: timezone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  const shown = lines.flatMap((l) => {
    const line = bringInLine(l);
    return line ? [{ l, line }] : [];
  });
  if (shown.length === 0) return null;
  return (
    <ul className="ord-bringin" aria-label={t('bringIn.title')}>
      {shown.map(({ l, line }) => {
        const text = {
          updated: t('bringIn.updated', { channel: name(l.channel), when: l.lastBroughtInAt ? when(l.lastBroughtInAt) : '' }),
          nothing: t('bringIn.nothing', { channel: name(l.channel) }),
          refused: t('bringIn.refused', { channel: name(l.channel) }),
          unreadable: t('bringIn.unreadable', { channel: name(l.channel) }),
          slow: t('bringIn.slow', { channel: name(l.channel) }),
          unreachable: t('bringIn.unreachable', { channel: name(l.channel) }),
        }[line.key];
        return (
          <li key={l.channel} className={`ord-bringin-row ord-bringin-${line.tone}`}>
            <span>{text}</span>
            {line.tone === 'bad' && l.lastBroughtInAt ? <span className="ord-bringin-last">{t('bringIn.lastWorked', { when: when(l.lastBroughtInAt) })}</span> : null}
            {l.held > 0 ? (
              <a className="ord-bringin-link" href="/orders/held">
                {t('bringIn.held', { count: l.held })}
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
