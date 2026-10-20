import { screenTitle } from '../lib/page-title';
import { SalesScreen, type SalesSearch } from './SalesScreen';

export const dynamic = 'force-dynamic';

export default function SalesPage({ searchParams }: { searchParams: Promise<SalesSearch> }) {
  return <SalesScreen searchParams={searchParams} guard="/sales" />;
}

export const metadata = screenTitle('Sales');
