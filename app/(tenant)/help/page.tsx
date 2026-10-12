import { getTranslations } from 'next-intl/server';
import { screenTitle } from '../lib/page-title';
import { api } from '../lib/api';
import type { Me } from '../lib/api-types';
import { PageHeader } from '../components/PageHeader';
import { IconPhone, IconWhatsApp } from '../components/icons';
import { helpOptions, isHelpRole, ROLE_KEY, supportIntro } from './links';

export const dynamic = 'force-dynamic';

export const metadata = screenTitle('Help');

/**
 * Jira GRW-564 — the one screen in the product that reaches a human.
 *
 * Offered to the owner, the receptionist AND the stylist, which is the whole
 * point of it: until now the only support number in the dashboard was on the
 * lockout screen an owner sees when the business is suspended. The two people
 * most likely to be stuck mid-booking, on a shared salon phone, had none.
 *
 * It is deliberately two buttons and one sentence. An owner who may not read
 * confidently is not helped by a page of troubleshooting, and the thing they
 * need is the thing a phone is already good at.
 *
 * WhatsApp is listed FIRST and styled as the primary action, against the
 * habit of leading with a phone number: the message carries the salon, the
 * branch and the person's role with it, so support starts the conversation
 * already knowing the three things a caller has to be asked for. It is also
 * the cheaper thing to do from a salon floor with a client in the chair.
 */
export default async function HelpPage() {
  /*
   * Jira GRW-556 · GRW-564 — every other screen below a closed one calls
   * `guardLive` and sends a business still being set up to /not-live-yet.
   * This one is `guardLive('/help')`'s exception by being listed as open:
   * the owner most likely to be stuck is the one half way through setting up,
   * and sending them from Help to "not live yet" is sending them away from
   * the only way to ask why.
   */
  const t = await getTranslations('help');

  let support: NonNullable<Me['support']> | undefined;
  /** What the pre-filled message names, so support need not ask. Empty when the API cannot say. */
  let salon: string | undefined;
  let branch: string | null | undefined;
  let role: string | undefined;
  try {
    const me = await api.me();
    support = me.support;
    salon = me.tenant?.name;
    /*
     * `member.locationName` FIRST, and not behind `branchCount > 1`.
     *
     * `/me` narrows `tenant.branchCount` to the branches this person sees
     * (GRW-393), so a stylist at a six-branch salon is sent 1 — and gating on
     * it dropped the branch from exactly the message that needs it most. The
     * member field is already "the branch this person works at, at a business
     * with more than one" (GRW-237 · GRW-251), so it answers on its own.
     *
     * `tenant.locationName` is the fallback for the owner, who has no member
     * branch; there it IS gated, because at a one-branch salon it is only the
     * salon's name said twice.
     */
    branch = me.member?.locationName ?? ((me.tenant?.branchCount ?? 1) > 1 ? me.tenant?.locationName : null);
    role = me.member?.role;
  } catch {
    // The buttons below simply do not render. A help screen that throws is the
    // one failure this screen must not have.
  }

  /* Built on the server so both links work with JavaScript still loading —
     this is the screen someone opens when something is already not working.
     The URL rules themselves live in ./links.ts, with their tests. */
  const roleName = isHelpRole(role) ? t(ROLE_KEY[role]) : null;
  const intro = supportIntro({ salon, branch, roleName });
  /*
   * Jira GRW-564 — each option is its own number to ring and its own number to message. The links are decided
   * in ./links.ts: a handset is offered once however many options name it, and an option with nothing left
   * to offer is dropped.
   */
  const options = helpOptions(support, intro ? t('message.withDetails', { details: intro }) : t('message.plain'));
  /* One option reads exactly as the screen always did — a heading for the only choice would be noise. */
  const numbered = options.length > 1;
  const firstChat = options.find((o) => o.whatsapp)?.n;

  return (
    <>
      <PageHeader title={t('title')} />
      <div className="page-body">
        <div className="help-card">
          <p className="help-lede">{t('lede')}</p>

          {options.map((o) => (
            <section key={o.n} className="help-option" aria-labelledby={numbered ? `help-option-${o.n}` : undefined}>
              {numbered ? (
                <h2 id={`help-option-${o.n}`} className="help-option-title">
                  {t('option', { n: o.n })}
                </h2>
              ) : null}
              <div className="help-option-actions">
                {/* One filled button on the screen: the first WhatsApp. Two would be two primary actions. */}
                {o.whatsapp ? (
                  <a
                    className={`help-action${o.n === firstChat ? ' help-action-primary' : ''}`}
                    href={o.whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <IconWhatsApp />
                    {t('whatsapp')}
                  </a>
                ) : null}

                {o.tel ? (
                  <a className="help-action" href={o.tel}>
                    <IconPhone />
                    {t('call')}
                  </a>
                ) : null}
              </div>
            </section>
          ))}

          {/* Nothing configured, or the API is unreachable. Says so plainly
              rather than showing an empty card the reader has to interpret. */}
          {options.length === 0 ? <p className="help-none">{t('none')}</p> : null}

          <p className="help-reply">{t('reply')}</p>
        </div>
      </div>
    </>
  );
}
