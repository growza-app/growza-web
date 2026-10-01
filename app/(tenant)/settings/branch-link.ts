/** Carry `?branch=` onto a settings link, so moving between tabs keeps the branch (Jira GRW-230). */
export function withBranch(href: string, branch: string | null): string {
  return branch ? `${href}?branch=${encodeURIComponent(branch)}` : href;
}
