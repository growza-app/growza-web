/**
 * Mock data for the admin portal (GRW-95), ported from Admin.dc.html's own
 * mock arrays. Every screen this drives is a real, routed page — only the
 * data source is mock, because the backend for it has not landed yet. Each
 * epic replaces its own slice of this file with a real fetch when it ships;
 * nothing here should be read as "real data" in the meantime, and every
 * screen still reading it carries a PreviewBanner saying so.
 *
 * Retired so far: businesses (GRW-101/102), plans (GRW-108), subscriptions
 * (GRW-111). Still mock: payments and invoices (GRW-83), usage (GRW-85),
 * feature flags (GRW-87), platform users (GRW-88), roles (GRW-89),
 * impersonation (GRW-90).
 */

export interface Business {
  id: string;
  name: string;
  type: string;
  city: string;
  owner: string;
  branches: number;
  users: number;
  plan: string;
  list: number;
  discount: number;
  status: string;
  next: string;
  bookings: [number, number];
  wa: [number, number];
  final: number;
}

const RAW_BUSINESSES: Omit<Business, 'final'>[] = [
  { id: 'BZ-1001', name: 'Glow Salon', type: 'Salon', city: 'Mumbai · Andheri West', owner: 'Rahul Sharma', branches: 2, users: 6, plan: 'Growza Base', list: 799, discount: 200, status: 'Active', next: '15 Sep', bookings: [72, 100], wa: [531, 800] },
  { id: 'BZ-1002', name: 'AutoCare Garage', type: 'Garage', city: 'Bengaluru', owner: 'Ravi Kumar', branches: 1, users: 4, plan: 'Growza Base', list: 799, discount: 0, status: 'Active', next: '21 Sep', bookings: [41, 100], wa: [212, 800] },
  { id: 'BZ-1003', name: 'BrightSmile Dental', type: 'Dental', city: 'Pune', owner: 'Dr. Kavita Joshi', branches: 3, users: 9, plan: 'Growza Base', list: 799, discount: 200, status: 'Active', next: '09 Sep', bookings: [88, 100], wa: [640, 800] },
  { id: 'BZ-1004', name: 'Urban Glow', type: 'Salon', city: 'Delhi', owner: 'Sana Malik', branches: 1, users: 3, plan: 'Growza Base', list: 799, discount: 200, status: 'Trial', next: '02 Sep', bookings: [12, 100], wa: [64, 800] },
  { id: 'BZ-1005', name: 'Speed Motors', type: 'Garage', city: 'Hyderabad', owner: 'Deepak Rao', branches: 2, users: 5, plan: 'Growza Base', list: 799, discount: 0, status: 'Past due', next: '28 Aug', bookings: [58, 100], wa: [380, 800] },
  { id: 'BZ-1006', name: 'Serenity Spa', type: 'Spa', city: 'Mumbai', owner: 'Nisha Iyer', branches: 1, users: 4, plan: 'Growza Base', list: 799, discount: 100, status: 'Active', next: '17 Sep', bookings: [63, 100], wa: [470, 800] },
  { id: 'BZ-1007', name: 'CityCare Clinic', type: 'Clinic', city: 'Chennai', owner: 'Dr. Meera Raj', branches: 4, users: 12, plan: 'Growza Base', list: 799, discount: 200, status: 'Active', next: '12 Sep', bookings: [94, 100], wa: [712, 800] },
  { id: 'BZ-1008', name: 'FlexFit Studio', type: 'Fitness', city: 'Kolkata', owner: 'Arjun Sen', branches: 1, users: 3, plan: 'Growza Base', list: 799, discount: 0, status: 'Trial', next: '05 Sep', bookings: [26, 100], wa: [150, 800] },
];

export function getBusinesses(): Business[] {
  return RAW_BUSINESSES.map((b) => ({ ...b, final: b.list - b.discount }));
}

export interface FeatureFlag {
  key: string;
  name: string;
  desc: string;
  base: boolean;
  pro: boolean;
  on: boolean;
  future?: boolean;
}

export const FEATURE_FLAGS: FeatureFlag[] = [
  { key: 'whatsapp.booking.enabled', name: 'WhatsApp booking', desc: 'Customers book & get confirmations over WhatsApp.', base: true, pro: true, on: true },
  { key: 'reports.enabled', name: 'Reports & analytics', desc: 'Business reporting dashboards.', base: true, pro: true, on: true },
  { key: 'combos.enabled', name: 'Service combos', desc: 'Bundle multiple services into one booking.', base: true, pro: true, on: true },
  { key: 'advanced.analytics.enabled', name: 'Advanced analytics', desc: 'Cohorts, retention & customer intelligence.', base: false, pro: true, on: false },
  { key: 'whatsapp.marketing.enabled', name: 'WhatsApp marketing', desc: 'Promotional broadcasts & campaigns.', base: false, pro: false, on: false, future: true },
  { key: 'ai.enabled', name: 'AI conversations', desc: 'AI-generated customer responses.', base: false, pro: true, on: false, future: true },
];

export function getFlag(key: string) {
  return FEATURE_FLAGS.find((f) => f.key === key);
}

export const AUDIT_LOG = [
  { admin: 'Aarav Khanna', action: 'Discount applied', entity: 'Subscription', biz: 'Glow Salon', detail: '₹799 → ₹599 · Early adopter', time: '31 Aug, 10:45', hue: 150 },
  { admin: 'Aarav Khanna', action: 'Impersonation started', entity: 'Session', biz: 'CityCare Clinic', detail: 'Reason: payment support', time: '31 Aug, 09:12', hue: 25 },
  { admin: 'Sneha Patil', action: 'Feature flag changed', entity: 'Flag', biz: 'Platform', detail: 'advanced.analytics.enabled → ON (Pro)', time: '30 Aug, 18:30', hue: 285 },
  { admin: 'Aarav Khanna', action: 'Business suspended', entity: 'Business', biz: 'Speed Motors', detail: 'Reason: payment failed ×3', time: '30 Aug, 14:02', hue: 25 },
  { admin: 'Sneha Patil', action: 'Plan edited', entity: 'Plan', biz: 'Platform', detail: 'Growza Base WhatsApp limit 800 → 900', time: '29 Aug, 11:20', hue: 210 },
  { admin: 'Aarav Khanna', action: 'Usage limit changed', entity: 'Subscription', biz: 'BrightSmile Dental', detail: 'booking.monthly_limit 100 → 150', time: '28 Aug, 16:47', hue: 65 },
];

export const IMPERSONATION_SESSIONS = [
  { admin: 'Aarav Khanna', biz: 'CityCare Clinic', user: 'Dr. Meera Raj', reason: 'Payment support', dur: '12 min', when: 'Active now', live: true },
  { admin: 'Rohit Verma', biz: 'Urban Glow', user: 'Sana Malik', reason: 'Onboarding help', dur: '8 min', when: '2h ago', live: false },
  { admin: 'Aarav Khanna', biz: 'Glow Salon', user: 'Rahul Sharma', reason: 'Booking issue', dur: '5 min', when: 'Yesterday', live: false },
];

