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
  /**
   * The QR this branch shows at the till, or null when it shows the business's.
   *
   * The branch's OWN pointer, not the effective one: Settings has to be able to
   * say "its own" apart from "the business's", and only an un-coalesced value
   * tells those apart. Optional — an API a deploy behind sends none.
   */
  paymentQrUrl?: string | null;
}
