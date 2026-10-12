import type { ReactNode } from 'react';
import { IconCalendarPlus, IconChevronRight, IconClipboardCheck, IconPhone, IconRupee, IconStaff, IconUserPlus } from '../components/icons';
import { fixesFor, type FixCategory, type FixRole, type FixSectionId } from './quick-fixes';

/** `help.fixes.*` as a translator; plain strings in, plain strings out. */
type Translate = (key: string) => string;

const ICON: Record<FixCategory['id'], () => ReactNode> = {
  phone: () => <IconPhone />,
  checkin: () => <IconClipboardCheck />,
  bookings: () => <IconCalendarPlus />,
  payments: () => <IconRupee />,
  clients: () => <IconUserPlus />,
  team: () => <IconStaff />,
};

const SECTION_LABEL: Record<Exclude<FixSectionId, 'main'>, string> = { iphone: 'labels.iphone', android: 'labels.android' };

/**
 * Jira GRW-564 — quick fixes: groups of problems, each a collapsed card that opens to its problems, each of
 * which opens to a few numbered steps.
 *
 * Native `<details>`, so it needs no JavaScript and works while the page is still loading — this is the screen
 * somebody opens when something is already not working. Closed by default: the page shows six lines, not
 * twenty-three problems.
 */
export function QuickFixes({ role, t }: { role: FixRole | null; t: Translate }) {
  const groups = fixesFor(role);
  if (groups.length === 0) return null;
  return (
    <section className="help-fixes" aria-labelledby="help-fixes-title">
      <h2 id="help-fixes-title" className="help-fixes-title">
        {t('heading')}
      </h2>
      <p className="help-fixes-lede">{t('lede')}</p>
      {groups.map((group) => (
        <details key={group.id} className="help-cat">
          <summary className="help-cat-head">
            <span className="help-cat-icon" aria-hidden="true">
              {ICON[group.id]()}
            </span>
            <span className="help-cat-name">{t(`cats.${group.id}.title`)}</span>
            <span className="help-cat-count">{group.topics.length}</span>
            <span className="help-chevron" aria-hidden="true">
              <IconChevronRight />
            </span>
          </summary>
          <div className="help-cat-body">
            {group.topics.map((topic) => (
              <details key={topic.id} className="help-topic">
                <summary className="help-topic-head">
                  <span className="help-topic-name">{t(`topics.${topic.id}.title`)}</span>
                  <span className="help-chevron" aria-hidden="true">
                    <IconChevronRight />
                  </span>
                </summary>
                <div className="help-steps">
                  {topic.sections.map((section) => (
                    <div key={section.id} className="help-steps-group">
                      {section.id !== 'main' ? <p className="help-steps-label">{t(SECTION_LABEL[section.id])}</p> : null}
                      <ol className="help-steps-list">
                        {Array.from({ length: section.steps }, (_, i) => (
                          <li key={i}>{t(`topics.${topic.id}.${section.id}.s${i + 1}`)}</li>
                        ))}
                      </ol>
                    </div>
                  ))}
                  {topic.note ? <p className="help-note">{t(`topics.${topic.id}.note`)}</p> : null}
                </div>
              </details>
            ))}
          </div>
        </details>
      ))}
    </section>
  );
}
