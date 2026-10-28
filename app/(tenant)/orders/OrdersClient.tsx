'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api, formatMoney } from '../lib/api';
import type { OrderListRow, OrdersPage } from '../lib/api-types';
import { CHANNEL_CHIPS, EMPTY_QUERY, KNOWN_STATES, ORDERS_PAGE_SIZE, STATE_CHIPS, isFiltered, readQuery, toSearch, type OrdersQuery } from '../lib/orders-filter';
import { SEARCH_DEBOUNCE_MS, worthSearching } from '../lib/search-tuning';
import { Pagination } from '../components/Pagination';
import { SearchClear } from '../components/SearchClear';
import { useBranch } from '../components/BranchProvider';
import { IconSearch } from '../components/icons';
import { intlLocale } from '../lib/format';
import { useAreas } from '../components/SessionProvider';
import { channelsOf, isDeliveryApp, sellsOnMarketplaces } from '../lib/order-channels';

/**
 * Jira GRW-614 — the Orders list.
 *
 * Every filter, every search and every page is the SERVER asking again (BR-01): this component never narrows rows it
 * already holds, and never holds more than a page. A chip is a request; so is the next page; so is a pause in typing.
 *
 * Laid out at 344px first: each order is a card — when, where from, who, how much, the state as a quiet chip. From 861px
 * the same rows are a table, as Bookings and Sales draw theirs; the two are the same data under a media query, not two
 * screens. The chips are a row, not a dropdown, with the one in force plainly marked, and every chip is 2.75rem tall.
 *
 * What the address bar holds is exactly what the server reads on arrival (channel, status, q, page), so a filtered list
 * can be linked to, bookmarked, and linked INTO — Home's counts do (FR-06). A chip is a new place to be and pushes, so
 * Back undoes it; typing and paging refine the same view and replace, so Back does not walk through every keystroke.
 *
 * A row opens the order's own screen (Jira GRW-615): the whole card on a phone, the date and code in the table.
 */
export function OrdersClient({ initialQuery, initial, timezone }: { initialQuery: OrdersQuery; initial: OrdersPage | null; timezone: string }) {
  const t = useTranslations('orders');
  const locale = useLocale();
  const branchContext = useBranch();
  // An owner's free choice of branch narrows the list; a desk is held to its own by the server whatever is sent.
  const branch = branchContext.ready && branchContext.multi ? branchContext.choice : null;

  const [query, setQuery] = useState<OrdersQuery>(initialQuery);
  // What is TYPED, apart from what has been SENT: the box answers every keystroke, the server only hears the pause.
  const [typed, setTyped] = useState(initialQuery.q);
  const [page, setPage] = useState<OrdersPage | null>(initial);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(initial === null);
  // The branch the rows on screen were read for — a server render read every branch.
  const loadedFor = useRef<{ q: OrdersQuery; branch: string | null } | null>(initial ? { q: initialQuery, branch: null } : null);
  const requestId = useRef(0);

  const load = useCallback((q: OrdersQuery, location: string | null) => {
    const mine = ++requestId.current;
    setLoading(true);
    api
      .orders({ channel: q.channel, status: q.status, q: q.q.trim(), customerId: q.customerId, page: q.page, pageSize: ORDERS_PAGE_SIZE, location })
      .then((r) => {
        // A slower, older answer must not overwrite a newer one.
        if (mine !== requestId.current) return;
        setPage(r);
        setFailed(false);
        loadedFor.current = { q, branch: location };
      })
      .catch(() => {
        if (mine === requestId.current) setFailed(true);
      })
      .finally(() => {
        if (mine === requestId.current) setLoading(false);
      });
  }, []);

  // Ask again whenever what is asked has changed — the first render already holds the server's page.
  useEffect(() => {
    const seen = loadedFor.current;
    if (seen && seen.branch === branch && JSON.stringify(seen.q) === JSON.stringify(query)) return;
    load(query, branch);
  }, [query, branch, load]);

  // Typing is debounced into `query.q`. Too short a term is not worth asking about; an empty box is "every order" and is.
  useEffect(() => {
    if (typed === query.q) return;
    if (!worthSearching(typed)) return;
    const timer = setTimeout(() => {
      setQuery((cur) => ({ ...cur, q: typed, page: 1 }));
      window.history.replaceState(null, '', `${window.location.pathname}${toSearch({ ...query, q: typed, page: 1 })}`);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed, query]);

  const go = (next: OrdersQuery, how: 'push' | 'replace') => {
    setQuery(next);
    setTyped(next.q);
    window.history[how === 'push' ? 'pushState' : 'replaceState'](null, '', `${window.location.pathname}${toSearch(next)}`);
  };

  // Back / Forward move through the chips pushed above.
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      const next = readQuery({ channel: params.get('channel') ?? '', status: params.get('status') ?? '', q: params.get('q') ?? '', customerId: params.get('customerId') ?? '', page: params.get('page') ?? '' });
      setQuery(next);
      setTyped(next.q);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /*
   * Owner, 2026-10-24 — the chips are this business's own channels: a shop's marketplaces, a restaurant's delivery
   * apps. The states (to send, sent, delivered, came back) are a parcel's: where nothing ships there are none to pick.
   */
  const areas = useAreas();
  const offered = channelsOf(areas).filter((c): c is (typeof CHANNEL_CHIPS)[number] => (CHANNEL_CHIPS as readonly string[]).includes(c));
  const ships = sellsOnMarketplaces(areas);
  const pickChannel = (channel: string) => go({ ...query, channel, page: 1 }, 'push');
  const pickState = (status: string) => go({ ...query, status, page: 1 }, 'push');
  // The client is a scope, not a filter: clearing the chips and the search leaves you looking at the same person.
  // Only the banner's "Show all orders" lets them go.
  const clearAll = () => go({ ...EMPTY_QUERY, customerId: query.customerId }, 'push');
  const filtered = isFiltered(query);

  // Typed lookups, not `t(`states.${x}`)`: the message keys are checked, and a key that does not exist cannot compile.
  const stateWords: Record<(typeof KNOWN_STATES)[number], string> = {
    done: t('states.done'),
    new: t('states.new'),
    packed: t('states.packed'),
    sent: t('states.sent'),
    delivered: t('states.delivered'),
    cancelled: t('states.cancelled'),
    returned: t('states.returned'),
  };
  const channelWords: Record<(typeof CHANNEL_CHIPS)[number], string> = {
    counter: t('channels.counter'),
    flipkart: t('channels.flipkart'),
    amazon: t('channels.amazon'),
    swiggy: t('channels.swiggy'),
    zomato: t('channels.zomato'),
  };
  const stateWord = (status: string): string => stateWords[status as keyof typeof stateWords] ?? t('list.unknownState');
  const when = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(iso));
  const whoOf = (r: OrderListRow) => r.who?.name?.trim() || t('list.noName');
  // A channel this build has no word for is shown as the data spells it.
  const channelWord = (c: string): string => channelWords[c as keyof typeof channelWords] ?? c;

  const rows = page?.rows ?? [];
  const showMoney = rows.some((r) => r.amountMinor !== undefined);

  return (
    <div className="ord" aria-busy={loading || undefined}>
      {/* Says whose orders these are and how to get back out — the same banner, and the same reason for it, as the
          diary's. Without it a list holding one person's three orders is indistinguishable from a very quiet shop.

          The name is the SERVER's (`page.client`), not the rows': read off the rows it vanished at the one moment
          it matters, when the list is empty and the banner is all there is to say what you are looking at. A row's
          name is still the fallback, for an API a deploy behind. */}
      {query.customerId && (
        <div className="ord-client-banner">
          <span>
            {t.rich('list.clientShowing', {
              name: page?.client?.name?.trim() || rows[0]?.who?.name?.trim() || t('list.thisClient'),
              b: (chunks) => <strong>{chunks}</strong>,
            })}
          </span>
          <a className="btn btn-ghost btn-sm" href="/orders">
            {t('list.showAllOrders')}
          </a>
        </div>
      )}
      <div className="ord-tools">
        <label className="search-wrap ord-search">
          <IconSearch />
          <input
            type="search"
            className="search-input search-input-bare"
            placeholder={t('list.searchPlaceholder')}
            aria-label={t('list.searchLabel')}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            inputMode="search"
          />
          <SearchClear
            value={typed}
            onClear={() => {
              setTyped('');
              go({ ...query, q: '', page: 1 }, 'replace');
            }}
          />
        </label>

        <div className="ord-chips ord-chips-channel" role="group" aria-label={t('list.channelGroup')}>
          <button type="button" className={`ord-chip ${query.channel === '' ? 'is-on' : ''}`} aria-pressed={query.channel === ''} onClick={() => pickChannel('')}>
            {t('list.allChannels')}
          </button>
          {offered.map((c) => (
            <button key={c} type="button" className={`ord-chip ${query.channel === c ? 'is-on' : ''}`} aria-pressed={query.channel === c} onClick={() => pickChannel(c)}>
              {channelWords[c]}
            </button>
          ))}
        </div>

        {ships ? (
        <div className="ord-chips ord-chips-state" role="group" aria-label={t('list.stateGroup')}>
          <button type="button" className={`ord-chip ${query.status === '' ? 'is-on' : ''}`} aria-pressed={query.status === ''} onClick={() => pickState('')}>
            {t('list.allStates')}
          </button>
          {STATE_CHIPS.map((c) => (
            <button key={c.key} type="button" className={`ord-chip ${query.status === c.value ? 'is-on' : ''}`} aria-pressed={query.status === c.value} onClick={() => pickState(c.value)}>
              {t(`list.stateChips.${c.key}`)}
            </button>
          ))}
        </div>
        ) : null}
      </div>

      {failed ? (
        <div className="ord-state" role="alert">
          <p>{t('list.error.body')}</p>
          <button type="button" className="btn" onClick={() => load(query, branch)}>
            {t('list.error.retry')}
          </button>
        </div>
      ) : page === null ? (
        <ul className="ord-cards ord-skeleton" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="ord-card ord-card-skel" />
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <div className="ord-state">
          {/* "Your first sale will show up here" is the shop's sentence, and it is not true of a list scoped to one
              person who simply has not ordered yet. Theirs says so instead. */}
          <strong>{filtered ? t('list.noMatch.title') : query.customerId ? t('list.clientEmpty.title') : t('list.empty.title')}</strong>
          <p>{filtered ? t('list.noMatch.body') : query.customerId ? t('list.clientEmpty.body') : t('list.empty.body')}</p>
          {filtered ? (
            <button type="button" className="btn" onClick={clearAll}>
              {t('list.noMatch.clear')}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <ul className="ord-cards">
            {rows.map((r) => (
              <li key={r.id} className="ord-card-item">
                <a className="ord-card" href={`/orders/${r.id}`}>
                <div className="ord-card-top">
                  <span className="ord-who">{whoOf(r)}</span>
                  {showMoney && r.amountMinor !== undefined ? <span className="ord-amount">{formatMoney(r.amountMinor, 'INR', locale)}</span> : null}
                </div>
                <div className="ord-card-mid">
                  <span>{when(r.soldAt)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{channelWord(r.channel)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t('list.itemCount', { count: r.items })}</span>
                </div>
                <div className="ord-card-foot">
                  <span className="ord-code">{t('list.orderCode', { code: r.code.toUpperCase() })}</span>
                  {isDeliveryApp(r.channel) && r.externalRef ? <span className="ord-code">{t('list.appOrder', { ref: r.externalRef })}</span> : null}
                  <span className={`ord-state-chip ord-s-${r.known ? r.status : 'unknown'}`}>{stateWord(r.status)}</span>
                  {r.marketplaceUnconfirmed ? <span className="ord-unconfirmed">{t('list.notConfirmed')}</span> : null}
                </div>
                </a>
              </li>
            ))}
          </ul>

          <table className="ord-table">
            <thead>
              <tr>
                <th>{t('list.cols.when')}</th>
                <th>{t('list.cols.from')}</th>
                <th>{t('list.cols.who')}</th>
                <th className="ord-num">{t('list.cols.items')}</th>
                {showMoney ? <th className="ord-num">{t('list.cols.amount')}</th> : null}
                <th>{t('list.cols.state')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <a className="ord-row-link" href={`/orders/${r.id}`}>
                      {when(r.soldAt)}
                    </a>
                    <div className="ord-code">{t('list.orderCode', { code: r.code.toUpperCase() })}</div>
                    {isDeliveryApp(r.channel) && r.externalRef ? <div className="ord-code">{t('list.appOrder', { ref: r.externalRef })}</div> : null}
                  </td>
                  <td>
                    <span className={`ord-chan-badge ord-chan-${r.channel}`}>{channelWord(r.channel)}</span>
                  </td>
                  <td className="ord-td-who">{whoOf(r)}</td>
                  <td className="ord-num">{r.items}</td>
                  {showMoney ? <td className="ord-num ord-td-amount">{r.amountMinor !== undefined ? formatMoney(r.amountMinor, 'INR', locale) : ''}</td> : null}
                  <td>
                    <span className={`ord-state-chip ord-s-${r.known ? r.status : 'unknown'}`}>{stateWord(r.status)}</span>
                    {r.marketplaceUnconfirmed ? <span className="ord-unconfirmed">{t('list.notConfirmed')}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Pagination page={query.page} total={page.total} pageSize={ORDERS_PAGE_SIZE} noun={t('list.nounOrders')} onChange={(p) => go({ ...query, page: p }, 'replace')} />
        </>
      )}
    </div>
  );
}
