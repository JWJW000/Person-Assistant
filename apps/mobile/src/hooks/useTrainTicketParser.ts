import { useCallback } from 'react';
import type { TrainTicket } from '@assistant/contracts';

/**
 * 标准化车票对象，防御各种残缺或非标准 JSON 字段，杜绝渲染端 TypeError
 */
export function normalizeTicket(raw: any, fallbackIndex = 1): TrainTicket | null {
  if (!raw || typeof raw !== 'object') return null;
  const trainCode = String(raw.trainCode || raw.trainNo || '').trim();
  if (!trainCode) return null;

  const fromName =
    (typeof raw.from === 'object' && raw.from ? raw.from.name : typeof raw.from === 'string' ? raw.from : raw.fromStation) ||
    '出发站';
  const toName =
    (typeof raw.to === 'object' && raw.to ? raw.to.name : typeof raw.to === 'string' ? raw.to : raw.toStation) ||
    '到达站';

  const currentDate = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const departureAt =
    typeof raw.departureAt === 'string' && raw.departureAt
      ? raw.departureAt
      : `${currentDate}T${raw.depTime || '08:00'}:00+08:00`;
  const arrivalAt =
    typeof raw.arrivalAt === 'string' && raw.arrivalAt
      ? raw.arrivalAt
      : `${currentDate}T${raw.arrTime || '12:00'}:00+08:00`;

  let durationMinutes = Number(raw.durationMinutes);
  if (!durationMinutes || isNaN(durationMinutes) || durationMinutes < 0) {
    try {
      const depH = parseInt(departureAt.slice(11, 13), 10) || 0;
      const depM = parseInt(departureAt.slice(14, 16), 10) || 0;
      const arrH = parseInt(arrivalAt.slice(11, 13), 10) || 0;
      const arrM = parseInt(arrivalAt.slice(14, 16), 10) || 0;
      let dur = arrH * 60 + arrM - (depH * 60 + depM);
      if (dur < 0) dur += 24 * 60;
      durationMinutes = dur;
    } catch {
      durationMinutes = 0;
    }
  }

  const seats = Array.isArray(raw.seats) && raw.seats.length > 0
    ? raw.seats.map((s: any) => ({
        kind: String(s?.kind || '席别待查'),
        availability: s?.availability || (s?.count ? 'available' : 'unknown'),
        count: typeof s?.count === 'number' ? s.count : null,
        priceMinor: typeof s?.priceMinor === 'number' ? s.priceMinor : null,
        currency: 'CNY' as const,
        rawLabel: s?.rawLabel || undefined,
      }))
    : [
        {
          kind: '席别待查',
          availability: 'unknown' as const,
          count: null,
          priceMinor: null,
          currency: 'CNY' as const,
          rawLabel: '请以 12306 实时页面为准',
        },
      ];

  return {
    id: String(raw.id || `parsed-ticket-${trainCode}-${fallbackIndex}`),
    trainCode,
    trainNo: String(raw.trainNo || trainCode),
    from: { name: String(fromName).replace(/站$/, ''), code: (raw.from && typeof raw.from === 'object' && raw.from.code) || 'FROM' },
    to: { name: String(toName).replace(/站$/, ''), code: (raw.to && typeof raw.to === 'object' && raw.to.code) || 'TO' },
    departureAt,
    arrivalAt,
    durationMinutes: durationMinutes > 0 ? durationMinutes : 0,
    dayDiff: Number(raw.dayDiff) || 0,
    seats,
    scheduleReference: Boolean(raw.scheduleReference),
    matchLabels: Array.isArray(raw.matchLabels) ? raw.matchLabels : ['车次提取'],
    referenceDate: raw.referenceDate,
    isTransfer: Boolean(raw.isTransfer),
    transferHub: raw.transferHub,
  };
}

/**
 * 从大模型自然语言文本或 JSON 代码块中解析 12306 车次数据
 * 彻底消除硬编码日期与虚假票价，未解析到票价席别时标记为待查
 */
export function tryParseTicketsFromText(text: string): TrainTicket[] {
  if (!text || text.length < 10) return [];
  if (!text.includes('```') && !/[GCDTZK]\d{1,4}/.test(text)) return [];
  const tickets: TrainTicket[] = [];

  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      const rawList = Array.isArray(parsed?.tickets)
        ? parsed.tickets
        : Array.isArray(parsed)
        ? parsed
        : [];
      let idx = 1;
      for (const item of rawList) {
        const norm = normalizeTicket(item, idx++);
        if (norm) tickets.push(norm);
      }
      if (tickets.length > 0) return tickets;
    } catch {}
  }

  const currentDate = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const trainRegex = /([GCDTZK]\d{1,4})[次\s:：(（]*([\u4e00-\u9fa5]{2,6})[\s站]*[)）]*[\s,，]*([0-2]?\d:[0-5]\d)[\s~至\->→到]+([\u4e00-\u9fa5]{2,6})[\s站]*[)）]*[\s,，]*([0-2]?\d:[0-5]\d)/g;
  let match: RegExpExecArray | null;
  let idx = 1;

  while ((match = trainRegex.exec(text)) !== null && tickets.length < 8) {
    const trainCode = match[1];
    const fromStation = match[2].replace(/站$/, '');
    const depTime = match[3];
    const toStation = match[4].replace(/站$/, '');
    const arrTime = match[5];

    const [depH, depM] = depTime.split(':').map(Number);
    const [arrH, arrM] = arrTime.split(':').map(Number);
    let durMin = (arrH * 60 + arrM) - (depH * 60 + depM);
    let dayDiff = 0;
    if (durMin < 0) {
      durMin += 24 * 60;
      dayDiff = 1;
    }

    tickets.push({
      id: `parsed-ticket-${trainCode}-${idx++}`,
      trainCode,
      trainNo: trainCode,
      from: { code: 'FROM', name: fromStation },
      to: { code: 'TO', name: toStation },
      departureAt: `${currentDate}T${depTime}:00+08:00`,
      arrivalAt: `${currentDate}T${arrTime}:00+08:00`,
      durationMinutes: durMin > 0 ? durMin : 0,
      dayDiff,
      seats: [
        {
          kind: '席别待查',
          availability: 'unknown',
          count: null,
          priceMinor: null,
          currency: 'CNY',
          rawLabel: '请以 12306 实时页面为准'
        }
      ],
      scheduleReference: false,
      matchLabels: ['车次提取']
    });
  }

  return tickets;
}

/**
 * 剔除文本中冗余的原始车票 JSON 代码块，使自然语言气泡更清爽
 */
export function cleanDisplayContent(text: string): string {
  if (!text) return '';
  if (text.includes('trainCode') || text.includes('trainNo') || text.includes('departureAt')) {
    return text.replace(/```(?:json)?\s*[\s\S]*?```/g, '').trim();
  }
  return text;
}

export function useTrainTicketParser() {
  const parseTickets = useCallback((text: string) => tryParseTicketsFromText(text), []);
  const cleanContent = useCallback((text: string) => cleanDisplayContent(text), []);

  return {
    tryParseTicketsFromText: parseTickets,
    cleanDisplayContent: cleanContent,
  };
}
