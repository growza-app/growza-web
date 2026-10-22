import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { api } from '../../../lib/api';
import { PageHeader } from '../../../components/PageHeader';
import { LoadErrorBanner } from '../../../components/LoadErrorBanner';
import { loadErrorKind } from '../../../lib/load-error';
import { screenTitle } from '../../../lib/page-title';
import { guardScreen } from '../../../lib/screen-guard';
import { CodesScreen } from './CodesScreen';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Marketplace codes');

/**
 * Jira GRW-618 — one product's marketplace codes: each size with the Flipkart and Amazon codes that point at it.
 *
 * Reached from the Sizes screen, which is drawn only while sizes are switched on. The same people who may see Products
 * may see this; the API refuses the writes to anyone else, and refuses the whole screen to a business with a diary.
 */
export default async function ProductCodesPage({ params }: { params: Promise<{ id: string }> }) {
  await guardScreen('/products');
  const { id } = await params;
  const t = await getTranslations('products.codes');

  let sizesOn = false;
  let shop = true;
  try {
    const me = await api.me();
    sizesOn = me.capabilities?.sizes === true;
    // The API answers a business with a diary 404 for every one of these routes: bounce it rather than show a screen that cannot load.
    shop = me.surface === 'shop';
  } catch {
    sizesOn = true;
  }
  if (!sizesOn || !shop) redirect('/products');

  try {
    const sizes = await api.productSizes(id);
    return (
      <>
        <PageHeader title={t('title')} subtitle={sizes.product.name} mobileSubtitle />
        <div className="page-body mpc-page">
          <CodesScreen sizes={sizes} />
        </div>
      </>
    );
  } catch (error) {
    return (
      <>
        <PageHeader title={t('title')} />
        <div className="page-body">
          <LoadErrorBanner kind={loadErrorKind(error)} />
        </div>
      </>
    );
  }
}
