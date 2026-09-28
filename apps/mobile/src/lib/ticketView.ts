import type { Seat, TrainTicket } from '@assistant/contracts';

export type TicketSort = 'departure' | 'duration' | 'price';

export function seatLabel(seat: Seat): string {
  if (seat.availability === 'available') {
    return seat.count != null && seat.count > 0 ? `${seat.count}张` : '有';
  }
  if (seat.availability === 'waitlist') return '候补';
  if (seat.availability === 'sold_out') return '无';
  if (seat.availability === 'not_applicable') return '无此席';
  return '未知';
}

export function headlineSeat(ticket: TrainTicket): Seat | undefined {
  return ticket.seats
    .filter((seat) => seat.availability === 'available' && seat.priceMinor != null && (seat.count == null || seat.count > 0))
    .reduce<Seat | undefined>((best, seat) => (!best || (seat.priceMinor ?? Infinity) < (best.priceMinor ?? Infinity) ? seat : best), undefined);
}

export function formatYuan(priceMinor: number | null | undefined): string | null {
  if (priceMinor == null) return null;
  const yuan = priceMinor / 100;
  return Number.isInteger(yuan) ? `¥${yuan}` : `¥${yuan.toFixed(1)}`;
}

export function hasAvailableSeat(ticket: TrainTicket): boolean {
  return ticket.seats.some((seat) => seat.availability === 'available' && (seat.count == null || seat.count > 0));
}

export function compareTickets(sort: TicketSort): (a: TrainTicket, b: TrainTicket) => number {
  if (sort === 'duration') return (a, b) => a.durationMinutes - b.durationMinutes || Date.parse(a.departureAt) - Date.parse(b.departureAt);
  if (sort === 'price') {
    return (a, b) => {
      const left = headlineSeat(a)?.priceMinor ?? Number.MAX_SAFE_INTEGER;
      const right = headlineSeat(b)?.priceMinor ?? Number.MAX_SAFE_INTEGER;
      return left - right || Date.parse(a.departureAt) - Date.parse(b.departureAt);
    };
  }
  return (a, b) => Date.parse(a.departureAt) - Date.parse(b.departureAt);
}
