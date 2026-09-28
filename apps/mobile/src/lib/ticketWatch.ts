import type { TicketQuery } from '@assistant/contracts';

export interface TicketWatchHit {
  trainCode: string;
  from: string;
  to: string;
  departureAt: string;
  seatKind: string;
  availability: string;
  count: number | null;
  priceMinor: number | null;
  checkedAt: string;
}

export interface TicketWatch {
  id: string;
  trainCode: string;
  from: string;
  to: string;
  seatKind: string;
  query: TicketQuery;
  intervalMs: number;
  status: 'active' | 'paused' | 'hit' | 'expired' | 'stopped';
  lastAvailability: string | null;
  lastCount: number | null;
  hit: TicketWatchHit | null;
  lastError: string | null;
  nextRunAt: string;
  lastRunAt: string | null;
}

async function request<T>(serverUrl: string, token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${serverUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `盯票请求失败 (${res.status})`);
  }
  return data as T;
}

export function listTicketWatches(serverUrl: string, token: string): Promise<{ items: TicketWatch[] }> {
  return request(serverUrl, token, '/v1/ticket-watches');
}

export function createTicketWatch(
  serverUrl: string,
  token: string,
  body: { trainCode: string; query: TicketQuery; seatKind?: string }
): Promise<TicketWatch> {
  return request(serverUrl, token, '/v1/ticket-watches', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function ackTicketWatch(serverUrl: string, token: string, id: string): Promise<TicketWatch> {
  return request(serverUrl, token, `/v1/ticket-watches/${id}/ack`, { method: 'POST' });
}

export function deleteTicketWatch(serverUrl: string, token: string, id: string): Promise<{ ok: boolean }> {
  return request(serverUrl, token, `/v1/ticket-watches/${id}`, { method: 'DELETE' });
}

export interface TicketPurchase {
  id: string;
  trainCode: string;
  phase: 'searching' | 'awaiting_hold' | 'user_pay' | 'pay_ready' | 'unpaid' | 'blocked';
  payUrl: string | null;
  orderNo: string | null;
  issued: false;
  detail: string;
}

export function createTicketPurchase(
  serverUrl: string,
  token: string,
  body: { trainCode: string; query: TicketQuery; seatKind?: string; accountRef: string }
): Promise<TicketPurchase> {
  return request(serverUrl, token, '/v1/ticket-purchases', { method: 'POST', body: JSON.stringify(body) });
}

export function holdTicketPurchase(serverUrl: string, token: string, id: string): Promise<TicketPurchase> {
  return request(serverUrl, token, `/v1/ticket-purchases/${id}/hold`, { method: 'POST' });
}

export function confirmTicketPurchase(serverUrl: string, token: string, id: string, passengerName: string): Promise<TicketPurchase> {
  return request(serverUrl, token, `/v1/ticket-purchases/${id}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ passengerName })
  });
}
