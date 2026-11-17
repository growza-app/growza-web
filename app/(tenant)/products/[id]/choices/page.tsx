import AppLink from '../../../../shared/AppLink';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { api } from '../../../lib/api';
import { PageHeader } from '../../../components/PageHeader';
import { IconArrowLeft } from '../../../components/icons';
import { LoadErrorBanner } from '../../../components/LoadErrorBanner';
import { loadErrorKind } from '../../../lib/load-error';
import { screenTitle } from '../../../lib/page-title';
import { guardScreen } from '../../../lib/screen-guard';
import { ChoicesEditor } from './ChoicesEditor';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Choices');

/**
 * Jira GRW-712 — one item's choices: which add-on groups it offers (Extras, Spice), and the groups themselves, made here and shared by every
 * item that offers them. Reached from the "Choices" row in the item sheet, drawn only where the business has add-ons.
 */
export default async function ProductChoicesPage({ params }: { params: Promise<{ id: string }> }) {
  await guardScreen('/products');
  const { id } = await params;
  const t = await getTranslations('products.choices');
  let on = false;
  try {
    on = (await api.me()).capabilities?.addons === true;
  } catch {
    on = true;
  }
  if (!on) redirect('/products');
  const back = (
    <AppLink className="btn btn-ghost" href="/products">
      <IconArrowLeft aria-hidden="true" />
      {t('back')}
    </AppLink>
  );
  try {
    const [addons, sizes] = await Promise.all([api.addonGroups(), api.productSizes(id)]);
    const product = sizes.product;
    return (
      <>
        <PageHeader title={t('title')} subtitle={product.name} mobileSubtitle actions={back} />
        <div className="page-body">
          <ChoicesEditor productId={id} initialGroups={addons.groups} initialChosen={addons.products[id] ?? []} />
        </div>
      </>
    );
  } catch (error) {
    return (
      <>
        <PageHeader title={t('title')} actions={back} />
        <div className="page-body">
          <LoadErrorBanner kind={loadErrorKind(error)} />
        </div>
      </>
    );
  }
}
