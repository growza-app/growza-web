const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export interface Me {
  tenant: { id: string; name: string; timezone: string; locationName: string | null } | null;
  labels: Record<string, string>;
  capabilities: {
    walkIn: boolean;
    richAnalytics: boolean;
    staffLeaderboard: boolean;
    providerSelection: boolean;
    maxProviders: number;
  };
}

export interface Service {
  id: string;
  name: string;
  categoryName: string | null;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  priceMinor: string | null;
  currency: string;
}

export interface Provider {
  id: string;
  displayName: string;
  title: string | null;
  sortOrder: number | null;
}

export interface Appointment {
  id: string;
  startAt: string;
  endAt: string;
  status: 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  createdVia: 'whatsapp' | 'dashboard';
  customerName: string | null;
  customerPhone: string;
  serviceName: string;
  priceMinor: string | null;
  providerId: string | null;
  providerName: string | null;
  reminderSent: boolean;
}

export interface TodayStats {
  bookingsToday: number;
  bookingsYesterday: number;
  noShowsThisWeek: number;
  noShowsPrevWeek: number;
  revenueTodayMinor: string;
  revenuePrevWeekSameDayMinor: string;
  completedToday: number;
  bookedMinutesToday: number;
  capacityMinutesToday: number;
}

export interface ProviderDay {
  provider: { id: string; displayName: string };
  date: string;
  timezone: string;
  entries: Array<{
    startAt: string;
    endAt: string;
    kind: 'booking' | 'block';
    label: string;
    status: string | null;
  }>;
}

export interface AvailabilityResponse {
  service: { id: string; name: string; durationMin: number };
  date: string;
  timezone: string;
  slotCount: number;
  sections: Array<{
    section: string;
    slots: Array<{ utc: string; local: string; assignedProviderId: string | null }>;
  }>;
}

export interface ChatOption {
  id: string;
  label: string;
  sublabel?: string;
}

export interface ChatState {
  conversationId: string;
  customerId: string;
  status: 'active' | 'awaiting_input' | 'handoff' | 'completed' | 'abandoned';
  stepKey: string | null;
  type: 'list' | 'buttons' | 'form' | 'end' | 'handoff';
  body: string;
  options: ChatOption[];
  nonce: string | null;
}

export interface HoldResponse {
  holdKey: string;
  expiresAt: string;
  providerId: string;
}

export interface ConfirmResponse {
  appointmentId: string;
  remindersScheduled: number;
}

/** Thrown for the 409s the booking API sends back — the slot-just-taken / hold-expired cases. */
export class BookingConflictError extends Error {}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 409) {
    const { error } = (await res.json()) as { error: string };
    throw new BookingConflictError(error);
  }
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  me: () => get<Me>('/api/v1/me'),
  services: () => get<Service[]>('/api/v1/services'),
  providers: () => get<Provider[]>('/api/v1/providers'),
  appointments: (date?: string) => get<Appointment[]>(`/api/v1/appointments${date ? `?date=${date}` : ''}`),
  todayStats: () => get<TodayStats>('/api/v1/analytics/today'),
  providerDay: (providerId?: string) =>
    get<ProviderDay>(`/api/v1/provider-day${providerId ? `?providerId=${providerId}` : ''}`),
  availability: (serviceId: string, date: string, providerId = 'any') =>
    get<AvailabilityResponse>(`/api/v1/availability?serviceId=${serviceId}&date=${date}&providerId=${providerId}`),
  createHold: (serviceId: string, startAt: string, providerId?: string) =>
    post<HoldResponse>('/api/v1/holds', { serviceId, startAt, providerId }),
  confirmAppointment: (args: {
    holdKey: string;
    serviceId: string;
    startAt: string;
    customerPhone: string;
    customerName?: string;
  }) => post<ConfirmResponse>('/api/v1/appointments', args),
  chatStart: (phone: string, name?: string) => post<ChatState>('/api/v1/chat/start', { phone, name }),
  chatTap: (phone: string, optionId: string, nonce: string) =>
    post<ChatState>('/api/v1/chat/tap', { phone, optionId, nonce }),
};

export function formatMoney(minor: string | null, currency = 'INR'): string {
  if (!minor) return '—';
  const amount = Number(minor) / 100;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

export function formatTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  }).format(new Date(iso));
}
