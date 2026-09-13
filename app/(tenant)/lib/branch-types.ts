/** Jira GRW-227 — one branch on Settings › Branches. */
export interface BranchSettings {
  id: string;
  name: string;
  isPrimary: boolean;
  addressLine1: string;
  addressCity: string;
  staffCount: number;
}
