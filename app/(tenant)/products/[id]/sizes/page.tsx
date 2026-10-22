import AppLink from '../../../../shared/AppLink';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { api } from '../../../lib/api';
import { PageHeader } from '../../../components/PageHeader';
import { LoadErrorBanner } from '../../../components/LoadErrorBanner';
import { loadErrorKind } from '../../../lib/load-error';
import { screenTitle } from '../../../lib/page-title';
import { guardScreen } from '../../../lib/screen-guard';
import { SizesGrid } from './SizesGrid';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Sizes');

/**
 * Jira GRW-598 — one product's sizes: the options, the grid of counts and prices, one Save.
 *
 * Reached from the "Sizes" row in the product sheet, which is drawn only while sizes are switched on for the
 * business. Typed or bookmarked by a business that is not switched on, it lands back on Products: the server would
 * answer every request here with a refusal, and a screen of controls that all fail is worse than no screen.
 */
export default async function ProductSizesPage({ params }: { params: Promise<{ id: string }> }) {
  // The same people who may see Products may see this; the API refuses the writes to anyone else.
  await guardScreen('/products');
  const { id } = await params;
  const t = await getTranslations('products.sizes');

  let sizesOn = false;
  let shop = false;
  try {
    const me = await api.me();
    sizesOn = me.capabilities?.sizes === true;
    shop = me.surface === 'shop';
  } catch {
    // A /me that cannot answer is left to the load below to report.
    sizesOn = true;
  }
  if (!sizesOn) redirect('/products');

  try {
    const sizes = await api.productSizes(id);
    return (
      <>
        <PageHeader title={t('title')} subtitle={sizes.product.name} mobileSubtitle />
        <div className="page-body">
          <SizesGrid key={sizes.version} sizes={sizes} />
          {/* Jira GRW-618 — the marketplace codes that point at these sizes. */}
          {shop ? (
            <AppLink className="btn" href={`/products/${id}/codes`}>
              {t('codesLink')}
            </AppLink>
          ) : null}
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
