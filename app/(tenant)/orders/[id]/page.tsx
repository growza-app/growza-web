import { getTranslations } from 'next-intl/server';
import { screenTitle } from '../../lib/page-title';
import { guardScreen } from '../../lib/screen-guard';
import { api, ApiError } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { homeCopy } from '../../lib/home-copy';
import { serverLang } from '../../lib/lang';
import { DEFAULT_PRODUCT_RETURN_WINDOW_DAYS } from '../../sales/sales-helpers';
import { OrderClient } from './OrderClient';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-615 — an order's own screen: what is in it, where it is, and the one next move.
 *
 * The whole screen is ONE read (`api.order`): the lines, the history, who it is for, and the moves it may be offered,
 * which the API computes from the state machine. Guarded like the list it is reached from, so a role that is not offered
 * Orders lands Home rather than on a screen whose read answers 403.
 *
 * An order that is not there — another branch's, another business's, a mistyped address — is told so in a sentence with a
 * way back, never an empty screen. A read that FAILS is a different sentence, with a retry in the client.
 */
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  await guardScreen('/orders');
  const { id } = await params;
  const t = await getTranslations('orders');

  let order = null;
  let missing = false;
  try {
    order = await api.order(id);
  } catch (error) {
    // 404 is "there is no such order"; anything else is "could not load", and the client offers the retry.
    if (error instanceof ApiError && error.status === 404) missing = true;
  }

  let me = null;
  try {
    me = await api.me();
  } catch {
    me = null;
  }
  const lang = await serverLang();
  const heading = homeCopy(lang, me?.labels ?? {}).nav.orders;

  if (missing) {
    return (
      <>
        <PageHeader title={heading} />
        <div className="page-body ord-page">
          <div className="ord-state">
            <strong>{t('detail.notFound')}</strong>
            <a className="btn" href="/orders">
              {t('detail.backToOrders')}
            </a>
          </div>
        </div>
      </>
    );
  }

  return (
    <OrderClient
      id={id}
      initial={order}
      timezone={me?.tenant?.timezone ?? 'Asia/Kolkata'}
      returnWindowDays={me?.tenant?.productReturnWindowDays ?? DEFAULT_PRODUCT_RETURN_WINDOW_DAYS}
    />
  );
}

export const metadata = screenTitle('Orders');
