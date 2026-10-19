import type { ReportTodo, TodoClient } from '../../lib/report-types';

/** How many people the Home card shows before "See all". */
export const DUE_BACK_SHOWN = 3;

/** The card re-reads this often while Home stays open, and when the tab comes back into view. */
export const DUE_BACK_REFRESH_MS = 5 * 60 * 1000;

/** The laptop layout starts here (the system's breakpoint: ≤860 phone). The card is not drawn below it. */
export const DUE_BACK_DESKTOP_QUERY = '(min-width: 861px)';

/**
 * Who may be shown the card. `/api/v1/reports/todo` is the What-to-do tab's own grant, so being able to open some other
 * Reports tab is not enough: that person would get a card that can only ever say "Could not load". `reportTabs`
 * undefined means every tab (the owner); a `sales` entry is the Sales register, not a Reports tab.
 */
export function mayReadDueBack(canOpenReports: boolean, reportTabs?: readonly string[]): boolean {
  return canOpenReports && (reportTabs === undefined || reportTabs.includes('todo'));
}

export type DueBack = { count: number; clients: TodoClient[] };

/** The "due back" card out of the What-to-do report; an API that sends none means nobody is due. */
export function dueBackOf(todo: Pick<ReportTodo, 'cards'>): DueBack {
  const card = todo.cards.find((c) => c.kind === 'dueBack');
  return card && card.kind === 'dueBack' ? { count: card.count, clients: card.clients } : { count: 0, clients: [] };
}
