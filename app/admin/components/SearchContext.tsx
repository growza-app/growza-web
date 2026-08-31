'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * The header search box's value, shared with whichever list page is active.
 * Kept as plain component state rather than a URL param — GRW-95 built the
 * box before any screen has real server-side search (GRW-100), so there is
 * nothing yet worth making a shareable link out of.
 */
interface SearchValue {
  query: string;
  setQuery: (q: string) => void;
}

const SearchCtx = createContext<SearchValue | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('');
  const value = useMemo(() => ({ query, setQuery }), [query]);
  return <SearchCtx.Provider value={value}>{children}</SearchCtx.Provider>;
}

export function useAdminSearch(): SearchValue {
  const ctx = useContext(SearchCtx);
  if (!ctx) throw new Error('useAdminSearch() must be used inside <SearchProvider>');
  return ctx;
}
