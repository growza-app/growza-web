/**
 * Jira GRW-397 · GRW-398 — a list of closed days as this form has changed it: the list as last saved, and the
 * days added and removed here since.
 *
 * Saved as just those days (`closedDatesAdd` / `closedDatesRemove`), never as the whole list: a tab that sent the
 * list it had loaded wiped a day another tab had added in the meantime. GRW-397 did this for the days every branch
 * is closed; GRW-398 for a branch's own days and a one-branch business's.
 */
export interface DayEdits {
  saved: string[];
  added: string[];
  removed: string[];
}

export function fromSaved(days: readonly string[]): DayEdits {
  return { saved: [...days], added: [], removed: [] };
}

/** The days the form shows: saved, plus added, less removed, in date order. */
export function daysOf(e: DayEdits): string[] {
  return [...new Set([...e.saved, ...e.added])].filter((d) => !e.removed.includes(d)).sort();
}

export function withDay(e: DayEdits, day: string): DayEdits {
  return {
    ...e,
    added: e.saved.includes(day) || e.added.includes(day) ? e.added : [...e.added, day],
    removed: e.removed.filter((d) => d !== day),
  };
}

export function withoutDay(e: DayEdits, day: string): DayEdits {
  return {
    ...e,
    added: e.added.filter((d) => d !== day),
    removed: e.saved.includes(day) && !e.removed.includes(day) ? [...e.removed, day] : e.removed,
  };
}

/** What a save sends for this list: nothing when nothing changed. */
export function changeOf(e: DayEdits): { closedDatesAdd?: string[]; closedDatesRemove?: string[] } {
  return e.added.length > 0 || e.removed.length > 0 ? { closedDatesAdd: e.added, closedDatesRemove: e.removed } : {};
}
