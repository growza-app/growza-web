/** Jira GRW-227 — one branch on Settings › Branches. */
export interface BranchSettings {
  id: string;
  name: string;
  isPrimary: boolean;
  addressLine1: string;
  addressCity: string;
  staffCount: number;
  /** Jira GRW-563 — the attendance fence. Optional: an API a deploy behind sends none. */
  geoLat?: number | null;
  geoLng?: number | null;
  geoRadiusM?: number;
  geoEnabled?: boolean;
  geoDeskApproves?: boolean;
}
