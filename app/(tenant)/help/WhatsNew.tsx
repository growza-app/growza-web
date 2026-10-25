import AppLink from '../../shared/AppLink';
import { IconChevronRight, IconStar } from '../components/icons';
import { whatsNewFor, type NewThing } from './whats-new';
import type { HelpRole } from './links';

/** `help.new.*` as a translator; plain strings in, plain strings out. */
type Translate = (key: string) => string;

/**
 * What has been added lately, under the quick fixes.
 *
 * Collapsed by default like everything else on this screen, and for the same reason: somebody opening Help
 * usually has a problem, and a list of good news in front of the support number would be in the way. Open, it
 * is one line each — what it does, in the reader's own words, and a way in where there is one.
 *
 * The month, not the date. "25 October" invites the reader to work out whether that was before or after
 * something went wrong for them; the month is as precise as this needs to be.
 */
export function WhatsNew({ role, t, locale }: { role: HelpRole | null; t: Translate; locale: string }) {
  const things = whatsNewFor(role);
  if (things.length === 0) return null;

  const month = (thing: NewThing) =>
    new Date(`${thing.on}T00:00:00Z`).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <section className="help-fixes help-new" aria-labelledby="help-new-title">
      <h2 id="help-new-title" className="help-fixes-title">
        {t('heading')}
      </h2>
      <p className="help-fixes-lede">{t('lede')}</p>

      <details className="help-cat">
        <summary className="help-cat-head">
          <span className="help-cat-icon" aria-hidden="true">
            <IconStar />
          </span>
          <span className="help-cat-name">{t('open')}</span>
          <span className="help-cat-count">{things.length}</span>
          <span className="help-chevron" aria-hidden="true">
            <IconChevronRight />
          </span>
        </summary>
        <div className="help-cat-body">
          <ul className="help-new-list">
            {things.map((thing) => (
              <li key={thing.id} className="help-new-item">
                <p className="help-new-when">{month(thing)}</p>
                <p className="help-new-what">{t(`items.${thing.id}.title`)}</p>
                <p className="help-new-why">{t(`items.${thing.id}.body`)}</p>
                {/* Only where there is somewhere to go: a line with no link is a thing that happens by itself. */}
                {thing.href ? (
                  <AppLink className="help-new-go" href={thing.href}>
                    {t(`items.${thing.id}.go`)}
                    <IconChevronRight />
                  </AppLink>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </details>
    </section>
  );
}
