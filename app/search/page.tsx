import { api } from '../lib/api';
import { SearchClient } from './SearchClient';

export const dynamic = 'force-dynamic';

export default async function SearchPage() {
  let timezone = 'Asia/Kolkata';
  try {
    timezone = (await api.me()).tenant?.timezone ?? timezone;
  } catch {
    // The search field still works; only date formatting falls back.
  }

  return <SearchClient timezone={timezone} />;
}
