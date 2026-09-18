import { TicketQuery, TicketQuerySchema, TicketResult, TrainTicket } from '@assistant/contracts';

/** 12306 预售窗口：含今天共 15 天（今天 + 14） */
export const PRESALE_DAYS = 14;

export type TravelPref = {
  timeLabel?: string;
  departMinutes: [number, number];
  preferFastest?: boolean;
  preferCheapest?: boolean;
  preferEarliest?: boolean;
  preferLatest?: boolean;
  seatPreference?: string;
};

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function weekdayIndex(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
}

export function weekdayName(date: string): string {
  return WEEKDAYS[weekdayIndex(date)] || '';
}

export function maxOnSaleDate(today: string): string {
  return addDays(today, PRESALE_DAYS);
}

export function isOnSale(date: string, today: string): boolean {
  return date >= today && date <= maxOnSaleDate(today);
}

export function saleOpensOn(requestedDate: string): string {
  return addDays(requestedDate, -PRESALE_DAYS);
}

/** 在预售截止日期内，找与目标日期相同星期几的最近一天 */
export function sameWeekdayOnOrBefore(requested: string, limit: string): string {
  const want = weekdayIndex(requested);
  for (let i = 0; i < 7; i++) {
    const cur = addDays(limit, -i);
    if (weekdayIndex(cur) === want) return cur;
  }
  return limit;
}

export function extractPreferences(text: string, query: TicketQuery): TravelPref {
  let departMinutes: [number, number] = query.departMinutes || [0, 1440];
  let timeLabel: string | undefined;
  if (/凌晨/.test(text)) {
    departMinutes = [0, 360];
    timeLabel = '凌晨';
  } else if (/早上|清晨/.test(text)) {
    departMinutes = [300, 540];
    timeLabel = '早上';
  } else if (/上午/.test(text)) {
    departMinutes = [360, 720];
    timeLabel = '上午';
  } else if (/中午/.test(text)) {
    departMinutes = [660, 840];
    timeLabel = '中午';
  } else if (/下午/.test(text)) {
    departMinutes = [720, 1080];
    timeLabel = '下午';
  } else if (/晚上|傍晚/.test(text)) {
    departMinutes = [1020, 1410];
    timeLabel = '晚上';
  }

  let seatPreference = query.seatPreference;
  if (/商务/.test(text)) seatPreference = '商务';
  else if (/一等/.test(text)) seatPreference = '一等';
  else if (/二等/.test(text)) seatPreference = '二等';
  else if (/硬卧/.test(text)) seatPreference = '硬卧';
  else if (/软卧/.test(text)) seatPreference = '软卧';

  return {
    timeLabel,
    departMinutes,
    preferFastest: /最快|耗时短|时间短/.test(text),
    preferCheapest: /最便宜|便宜点|低价/.test(text),
    preferEarliest: /最早/.test(text),
    preferLatest: /最晚|末班/.test(text),
    seatPreference
  };
}

export function departureMinutes(iso: string): number {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return 0;
  const hours = t.getUTCHours() + 8;
  return (hours % 24) * 60 + t.getUTCMinutes();
}

function cheapestPrice(ticket: TrainTicket): number {
  const prices = ticket.seats.map((s) => s.priceMinor).filter((p): p is number => p != null);
  return prices.length ? Math.min(...prices) : Number.MAX_SAFE_INTEGER;
}

export function rankTickets(tickets: TrainTicket[], prefs: TravelPref): TrainTicket[] {
  if (!tickets.length) return tickets;

  const minDuration = Math.min(...tickets.map((t) => t.durationMinutes));
  const minPrice = Math.min(...tickets.map((t) => cheapestPrice(t)));
  const minDep = Math.min(...tickets.map((t) => departureMinutes(t.departureAt)));
  const maxDep = Math.max(...tickets.map((t) => departureMinutes(t.departureAt)));

  const scored = tickets.map((ticket) => {
    const labels: string[] = [];
    let score = 0;
    const dep = departureMinutes(ticket.departureAt);
    const inWindow = dep >= prefs.departMinutes[0] && dep <= prefs.departMinutes[1];

    if (prefs.timeLabel) {
      if (inWindow) {
        score += 50;
        labels.push(prefs.timeLabel);
      } else {
        score -= 20;
      }
    }

    const hasAvail = ticket.seats.some((s) => s.availability === 'available');
    if (hasAvail) {
      score += 18;
      labels.push('有票');
    }

    if (prefs.seatPreference) {
      const seat = ticket.seats.find((s) => s.kind.includes(prefs.seatPreference!));
      if (seat?.availability === 'available') {
        score += 22;
        if (!labels.includes(prefs.seatPreference)) labels.push(prefs.seatPreference);
      }
    }

    if (ticket.durationMinutes === minDuration) {
      score += prefs.preferFastest ? 30 : 8;
      labels.push('最快');
    }
    if (cheapestPrice(ticket) === minPrice && minPrice < Number.MAX_SAFE_INTEGER) {
      score += prefs.preferCheapest ? 30 : 4;
      labels.push('较便宜');
    }
    if (prefs.preferEarliest && dep === minDep) {
      score += 24;
      labels.push('最早');
    }
    if (prefs.preferLatest && dep === maxDep) {
      score += 24;
      labels.push('最晚');
    }

    return { ticket, score, labels: labels.slice(0, 3) };
  });

  scored.sort((a, b) => b.score - a.score || a.ticket.durationMinutes - b.ticket.durationMinutes);
  return scored.map(({ ticket, labels }) => ({ ...ticket, matchLabels: labels }));
}

export async function planTickets(opts: {
  query: TicketQuery;
  userMessage: string;
  currentDate: string;
  search: (query: TicketQuery) => Promise<TicketResult>;
}): Promise<TicketResult> {
  const prefs = extractPreferences(opts.userMessage, opts.query);
  const requestedDate = opts.query.date;
  const today = opts.currentDate;
  const onSale = isOnSale(requestedDate, today);
  const extraWarnings: string[] = [];
  let searchedDate = requestedDate;
  let mode: 'live' | 'schedule_reference' = 'live';

  const searchQuery = TicketQuerySchema.parse({
    ...opts.query,
    date: requestedDate,
    departMinutes: [0, 1440],
    onlyAvailable: onSale ? opts.query.onlyAvailable : false
  });

  if (!onSale) {
    mode = 'schedule_reference';
    const limit = maxOnSaleDate(today);
    searchedDate = sameWeekdayOnOrBefore(requestedDate, limit);
    if (searchedDate < today) searchedDate = today;
    searchQuery.date = searchedDate;
    extraWarnings.push(
      `${requestedDate}（周${weekdayName(requestedDate)}）尚未开售。12306 通常提前 15 天放票，预计 ${saleOpensOn(requestedDate)} 起可购买。以下为 ${searchedDate}（同为周${weekdayName(searchedDate)}）的时刻参考，开售日期与余票以 12306 为准。`
    );
  }

  let raw = await opts.search(searchQuery);
  if (mode === 'schedule_reference' && raw.tickets.length === 0 && searchedDate !== maxOnSaleDate(today)) {
    const fallbackDate = maxOnSaleDate(today);
    extraWarnings.push(`同星期几暂无车次，已改查预售期内 ${fallbackDate} 的时刻参考。`);
    raw = await opts.search(TicketQuerySchema.parse({ ...searchQuery, date: fallbackDate }));
    searchedDate = fallbackDate;
  }

  let tickets = rankTickets(raw.tickets, prefs);
  if (mode === 'schedule_reference') {
    tickets = tickets.map((t) => ({
      ...t,
      scheduleReference: true,
      referenceDate: searchedDate
    }));
  }

  const matchBits = [prefs.timeLabel, prefs.seatPreference, prefs.preferFastest ? '最快' : '', prefs.preferCheapest ? '便宜' : '']
    .filter(Boolean);
  const matchSummary = matchBits.length
    ? `已按「${matchBits.join('、')}」优先排列更符合需求的车次`
    : '已按有票、耗时等匹配度排列';

  return {
    ...raw,
    query: opts.query,
    tickets,
    warnings: [...raw.warnings, ...extraWarnings],
    planning: {
      mode,
      requestedDate,
      searchedDate,
      saleOpensOn: onSale ? undefined : saleOpensOn(requestedDate),
      matchSummary
    }
  };
}
