import { useCallback } from 'react';
import type { TrainTicket } from '@assistant/contracts';

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
      if (Array.isArray(parsed.tickets)) return parsed.tickets;
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((t: unknown) => typeof t === 'object' && t !== null && 'trainCode' in t);
        if (valid.length > 0) return valid as TrainTicket[];
      }
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
    return text.replace(/```(?:json)?\s*[\s\S]*?(?:```|$)/g, '').trim();
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
