/**
 * Lightweight RFC 5545 iCalendar (ICS) parser for calendar events.
 * Properly handles TZID, Windows/Outlook timezone names, VTIMEZONE offsets,
 * X-WR-TIMEZONE, floating dates, all-day events, RRULE/RDATE recurrence expansion,
 * EXDATE exclusions, and RECURRENCE-ID overrides without depending on OS timezone.
 */

import { createDateInTimezone, type CalendarEvent } from './availability.ts';

const WINDOWS_TO_IANA: Record<string, string> = {
  'UTC': 'UTC',
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'Romance Standard Time': 'Europe/Paris',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw',
  'E. Europe Standard Time': 'Europe/Chisinau',
  'FLE Standard Time': 'Europe/Kiev',
  'GTB Standard Time': 'Europe/Bucharest',
  'Mauritius Standard Time': 'Indian/Mauritius',
  'Arabian Standard Time': 'Asia/Dubai',
  'Georgian Standard Time': 'Asia/Tbilisi',
  'Caucasus Standard Time': 'Asia/Yerevan',
  'Russian Standard Time': 'Europe/Moscow',
  'E. Africa Standard Time': 'Africa/Nairobi',
  'South Africa Standard Time': 'Africa/Johannesburg',
  'W. Central Africa Standard Time': 'Africa/Lagos',
  'Morocco Standard Time': 'Africa/Casablanca',
  'SA Eastern Standard Time': 'America/Cayenne',
  'Eastern Standard Time': 'America/New_York',
  'US Eastern Standard Time': 'America/Indiana/Indianapolis',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Atlantic Standard Time': 'America/Halifax',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'Singapore Standard Time': 'Asia/Singapore',
  'China Standard Time': 'Asia/Shanghai',
  'India Standard Time': 'Asia/Kolkata',
  'AUS Eastern Standard Time': 'Australia/Sydney',
};

const WINDOWS_TO_IANA_LOWER: Record<string, string> = Object.fromEntries(
  Object.entries(WINDOWS_TO_IANA).map(([k, v]) => [k.toLowerCase(), v])
);

const WEEKDAY_TOKEN_MAP: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

export interface ParseIcsOptions {
  now?: Date;
  rangeStart?: Date;
  rangeEnd?: Date;
}

interface Ymd {
  year: number;
  month: number; // 1..12
  day: number;   // 1..31
}

interface Hms {
  hour: number;
  minute: number;
  second: number;
}

type TzSpec =
  | { kind: 'utc' }
  | { kind: 'iana'; tz: string }
  | { kind: 'offset'; offset: string };

interface ParsedDateInfo {
  date: Date;
  isAllDay: boolean;
  ymd: Ymd;
  hms: Hms;
  tzSpec: TzSpec;
}

interface RawVEvent {
  uid: string;
  title: string;
  dtstart?: ParsedDateInfo;
  dtend?: ParsedDateInfo;
  durationMs: number;
  transp: string;
  status: string;
  msBusyStatus: string;
  rrules: string[];
  exdates: Array<{ date: Date; isAllDay: boolean; ymdStr: string }>;
  rdates: Array<{ info: ParsedDateInfo }>;
  recurrenceId?: {
    date: Date;
    isAllDay: boolean;
    ymdStr: string;
    rangeThisAndFuture: boolean;
  };
}

interface ParsedByDayItem {
  nth?: number;
  weekday: number; // 0..6
}

interface ParsedRRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  count?: number;
  until?: Date;
  byDay?: ParsedByDayItem[];
  byMonthDay?: number[];
  byMonth?: number[];
  bySetPos?: number[];
  wkst: number; // 0..6 (default 1 = Monday)
}

function isValidIanaTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Formats an ICS offset like "+0400" or "-0530" into "+04:00" or "-05:30"
 */
function normalizeOffset(raw: string): string | null {
  const m = raw.trim().match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!m) return null;
  return `${m[1]}${m[2]}:${m[3]}`;
}

/**
 * Resolves an ICS TZID or fallback timezone into either an IANA timezone name or a fixed offset ("+04:00").
 */
export function resolveIcsTimeZone(
  tzid: string | undefined,
  vtimezones: Record<string, string> = {},
  fallbackTimeZone: string = 'Europe/Paris'
): { iana?: string; offset?: string } {
  if (tzid) {
    const cleaned = tzid.replace(/^["']|["']$/g, '').trim();

    if (isValidIanaTimeZone(cleaned)) {
      return { iana: cleaned };
    }

    const winIana = WINDOWS_TO_IANA[cleaned] || WINDOWS_TO_IANA_LOWER[cleaned.toLowerCase()];
    if (winIana && isValidIanaTimeZone(winIana)) {
      return { iana: winIana };
    }

    // e.g. "(UTC+04:00) Port Louis"
    const utcMatch = cleaned.match(/\((?:UTC|GMT)\s*([+-]\d{2}:?\d{2})\)/i);
    if (utcMatch) {
      const off = normalizeOffset(utcMatch[1]);
      if (off) return { offset: off };
    }

    if (vtimezones[cleaned]) {
      return { offset: vtimezones[cleaned] };
    }
  }

  if (isValidIanaTimeZone(fallbackTimeZone)) {
    return { iana: fallbackTimeZone };
  }

  return { iana: 'Europe/Paris' };
}

function ymdToString(ymd: Ymd): string {
  return `${String(ymd.year).padStart(4, '0')}-${String(ymd.month).padStart(2, '0')}-${String(ymd.day).padStart(2, '0')}`;
}

function hmsToString(hms: Hms): string {
  return `${String(hms.hour).padStart(2, '0')}:${String(hms.minute).padStart(2, '0')}:${String(hms.second).padStart(2, '0')}`;
}

function buildDateInTzSpec(ymd: Ymd, hms: Hms, tzSpec: TzSpec): Date {
  const dateStr = ymdToString(ymd);
  const timeStr = hmsToString(hms);
  if (tzSpec.kind === 'utc') {
    return new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, hms.hour, hms.minute, hms.second));
  }
  if (tzSpec.kind === 'iana') {
    return createDateInTimezone(dateStr, timeStr, tzSpec.tz);
  }
  return new Date(`${dateStr}T${timeStr}${tzSpec.offset}`);
}

function parseIcsDateDetailed(
  dateStr: string,
  tzid?: string,
  vtimezones: Record<string, string> = {},
  fallbackTimeZone: string = 'Europe/Paris',
  forceDateOnly = false
): ParsedDateInfo {
  const clean = dateStr.trim();

  // All day event YYYYMMDD
  if (/^\d{8}$/.test(clean) || forceDateOnly) {
    const m = clean.match(/^(\d{4})(\d{2})(\d{2})/);
    if (m) {
      const ymd: Ymd = { year: +m[1], month: +m[2], day: +m[3] };
      const hms: Hms = { hour: 0, minute: 0, second: 0 };
      const resolved = resolveIcsTimeZone(tzid, vtimezones, fallbackTimeZone);
      const tzSpec: TzSpec = resolved.iana
        ? { kind: 'iana', tz: resolved.iana }
        : resolved.offset
        ? { kind: 'offset', offset: resolved.offset }
        : { kind: 'utc' };
      return {
        date: buildDateInTzSpec(ymd, hms, tzSpec),
        isAllDay: true,
        ymd,
        hms,
        tzSpec,
      };
    }
  }

  // Format: YYYYMMDDTHHmmss or YYYYMMDDTHHmmssZ
  const match = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?/);
  if (match) {
    const [_, y, mo, d, h, mi, s, isUtc] = match;
    const ymd: Ymd = { year: +y, month: +mo, day: +d };
    const hms: Hms = { hour: +h, minute: +mi, second: +s };

    if (isUtc) {
      const tzSpec: TzSpec = { kind: 'utc' };
      return {
        date: buildDateInTzSpec(ymd, hms, tzSpec),
        isAllDay: false,
        ymd,
        hms,
        tzSpec,
      };
    }

    const resolved = resolveIcsTimeZone(tzid, vtimezones, fallbackTimeZone);
    const tzSpec: TzSpec = resolved.iana
      ? { kind: 'iana', tz: resolved.iana }
      : resolved.offset
      ? { kind: 'offset', offset: resolved.offset }
      : { kind: 'utc' };

    return {
      date: buildDateInTzSpec(ymd, hms, tzSpec),
      isAllDay: false,
      ymd,
      hms,
      tzSpec,
    };
  }

  const fallback = new Date(dateStr);
  const safe = isNaN(fallback.getTime()) ? new Date() : fallback;
  return {
    date: safe,
    isAllDay: false,
    ymd: { year: safe.getUTCFullYear(), month: safe.getUTCMonth() + 1, day: safe.getUTCDate() },
    hms: { hour: safe.getUTCHours(), minute: safe.getUTCMinutes(), second: safe.getUTCSeconds() },
    tzSpec: { kind: 'utc' },
  };
}

/**
 * Parses iCalendar datetime string (e.g., 20261109T143000Z, 20261109T143000, 20261109)
 * using explicit TZID / calendar timezone instead of server OS local timezone.
 */
export function parseIcsDate(
  dateStr: string,
  tzid?: string,
  vtimezones: Record<string, string> = {},
  fallbackTimeZone: string = 'Europe/Paris'
): Date {
  return parseIcsDateDetailed(dateStr, tzid, vtimezones, fallbackTimeZone).date;
}

/**
 * Unfolds folded lines in ICS text (lines starting with space or tab)
 */
function unfoldIcs(icsText: string): string[] {
  const rawLines = icsText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const unfolded: string[] = [];

  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }

  return unfolded;
}

function extractParam(keyPart: string, paramName: string): string | undefined {
  const segments = keyPart.split(';').slice(1);
  const prefix = `${paramName.toUpperCase()}=`;
  for (const seg of segments) {
    if (seg.toUpperCase().startsWith(prefix)) {
      return seg.slice(prefix.length).replace(/^["']|["']$/g, '').trim();
    }
  }
  return undefined;
}

function parseIsoDurationMs(durationStr: string): number {
  const m = durationStr.trim().match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m) return 0;
  const weeks = parseInt(m[1] || '0', 10);
  const days = parseInt(m[2] || '0', 10);
  const hours = parseInt(m[3] || '0', 10);
  const mins = parseInt(m[4] || '0', 10);
  const secs = parseInt(m[5] || '0', 10);
  return (((weeks * 7 + days) * 24 + hours) * 60 + mins) * 60 * 1000 + secs * 1000;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function weekdayOfYmd(ymd: Ymd): number {
  return new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day)).getUTCDay();
}

function ymdToSerialDay(ymd: Ymd): number {
  return Math.floor(Date.UTC(ymd.year, ymd.month - 1, ymd.day) / 86400000);
}

function addDaysYmd(ymd: Ymd, deltaDays: number): Ymd {
  const dt = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + deltaDays));
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
  };
}

function compareYmd(a: Ymd, b: Ymd): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

function dateToYmdInTzSpec(date: Date, tzSpec: TzSpec): Ymd {
  if (tzSpec.kind === 'utc') {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    };
  }
  if (tzSpec.kind === 'offset') {
    const m = tzSpec.offset.match(/^([+-])(\d{2}):(\d{2})$/);
    if (m) {
      const sign = m[1] === '-' ? -1 : 1;
      const offsetMs = sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10)) * 60000;
      const shifted = new Date(date.getTime() + offsetMs);
      return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
      };
    }
  }
  if (tzSpec.kind === 'iana') {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tzSpec.tz,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      }).formatToParts(date);
      let year = date.getUTCFullYear();
      let month = date.getUTCMonth() + 1;
      let day = date.getUTCDate();
      for (const p of parts) {
        if (p.type === 'year') year = parseInt(p.value, 10);
        else if (p.type === 'month') month = parseInt(p.value, 10);
        else if (p.type === 'day') day = parseInt(p.value, 10);
      }
      return { year, month, day };
    } catch {
      return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
      };
    }
  }
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function parseRRule(rawRule: string, defaultTzSpec: TzSpec): ParsedRRule | null {
  const parts = rawRule.trim().split(';');
  const map: Record<string, string> = {};
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    map[part.slice(0, eq).toUpperCase().trim()] = part.slice(eq + 1).trim();
  }

  const freq = map.FREQ?.toUpperCase();
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') {
    return null;
  }

  const interval = Math.max(1, parseInt(map.INTERVAL || '1', 10) || 1);
  const count = map.COUNT ? Math.max(1, parseInt(map.COUNT, 10) || 0) || undefined : undefined;

  let until: Date | undefined;
  if (map.UNTIL) {
    const rawUntil = map.UNTIL.trim();
    if (/^\d{8}$/.test(rawUntil)) {
      const ymd: Ymd = {
        year: +rawUntil.slice(0, 4),
        month: +rawUntil.slice(4, 6),
        day: +rawUntil.slice(6, 8),
      };
      until = buildDateInTzSpec(ymd, { hour: 23, minute: 59, second: 59 }, defaultTzSpec);
    } else if (/^\d{8}T\d{6}Z$/i.test(rawUntil)) {
      until = parseIcsDateDetailed(rawUntil).date;
    } else {
      const fallbackTz = defaultTzSpec.kind === 'iana' ? defaultTzSpec.tz : 'UTC';
      const vtz: Record<string, string> = defaultTzSpec.kind === 'offset' ? { __until__: defaultTzSpec.offset } : {};
      until = parseIcsDateDetailed(rawUntil, defaultTzSpec.kind === 'offset' ? '__until__' : undefined, vtz, fallbackTz).date;
    }
  }

  let byDay: ParsedByDayItem[] | undefined;
  if (map.BYDAY) {
    byDay = [];
    for (const tok of map.BYDAY.split(',')) {
      const m = tok.trim().toUpperCase().match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/);
      if (m) {
        const weekday = WEEKDAY_TOKEN_MAP[m[2]];
        const nth = m[1] ? parseInt(m[1], 10) : undefined;
        byDay.push({ nth, weekday });
      }
    }
    if (byDay.length === 0) byDay = undefined;
  }

  let byMonthDay: number[] | undefined;
  if (map.BYMONTHDAY) {
    byMonthDay = map.BYMONTHDAY.split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n !== 0);
    if (byMonthDay.length === 0) byMonthDay = undefined;
  }

  let byMonth: number[] | undefined;
  if (map.BYMONTH) {
    byMonth = map.BYMONTH.split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n >= 1 && n <= 12)
      .sort((a, b) => a - b);
    if (byMonth.length === 0) byMonth = undefined;
  }

  let bySetPos: number[] | undefined;
  if (map.BYSETPOS) {
    bySetPos = map.BYSETPOS.split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n !== 0);
    if (bySetPos.length === 0) bySetPos = undefined;
  }

  const wkst = map.WKST && WEEKDAY_TOKEN_MAP[map.WKST.toUpperCase()] !== undefined
    ? WEEKDAY_TOKEN_MAP[map.WKST.toUpperCase()]
    : 1; // Default MO

  return {
    freq,
    interval,
    count,
    until,
    byDay,
    byMonthDay,
    byMonth,
    bySetPos,
    wkst,
  };
}

function applySetPos<T>(items: T[], bySetPos?: number[]): T[] {
  if (!bySetPos || bySetPos.length === 0) return items;
  const out: T[] = [];
  const seen = new Set<number>();
  for (const pos of bySetPos) {
    const idx = pos > 0 ? pos - 1 : items.length + pos;
    if (idx >= 0 && idx < items.length && !seen.has(idx)) {
      seen.add(idx);
      out.push(items[idx]);
    }
  }
  return out;
}

function getMonthDaysMatchingByDay(year: number, month: number, byDay: ParsedByDayItem[]): number[] {
  const dim = daysInMonth(year, month);
  const byWeekday: Record<number, number[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (let d = 1; d <= dim; d++) {
    byWeekday[weekdayOfYmd({ year, month, day: d })].push(d);
  }
  const days = new Set<number>();
  for (const item of byDay) {
    const matches = byWeekday[item.weekday] || [];
    if (item.nth === undefined) {
      for (const d of matches) days.add(d);
    } else if (item.nth > 0 && item.nth <= matches.length) {
      days.add(matches[item.nth - 1]);
    } else if (item.nth < 0) {
      const idx = matches.length + item.nth;
      if (idx >= 0 && idx < matches.length) days.add(matches[idx]);
    }
  }
  return Array.from(days).sort((a, b) => a - b);
}

function resolveMonthDays(dim: number, byMonthDay: number[]): number[] {
  const out = new Set<number>();
  for (const raw of byMonthDay) {
    const d = raw > 0 ? raw : dim + 1 + raw;
    if (d >= 1 && d <= dim) out.add(d);
  }
  return Array.from(out).sort((a, b) => a - b);
}

function expandRRuleOccurrences(
  dtstart: ParsedDateInfo,
  rule: ParsedRRule,
  windowStart: Date,
  windowEnd: Date
): ParsedDateInfo[] {
  const results: ParsedDateInfo[] = [];
  const startYmd = dtstart.ymd;
  const windowStartYmd = addDaysYmd(dateToYmdInTzSpec(windowStart, dtstart.tzSpec), -2);
  const windowEndYmd = addDaysYmd(dateToYmdInTzSpec(windowEnd, dtstart.tzSpec), 2);
  const windowEndMs = windowEnd.getTime();
  const untilMs = rule.until ? rule.until.getTime() : Infinity;
  const effectiveEndMs = Math.min(windowEndMs, untilMs);

  let generatedCount = 0;
  const MAX_STEPS = 25000;

  const tryAcceptYmd = (ymd: Ymd): 'continue' | 'stop' => {
    if (compareYmd(ymd, startYmd) < 0) return 'continue';

    const occDate = buildDateInTzSpec(ymd, dtstart.hms, dtstart.tzSpec);
    const occMs = occDate.getTime();

    if (occMs > effectiveEndMs) return 'stop';

    generatedCount++;
    if (rule.count !== undefined && generatedCount > rule.count) return 'stop';

    if (compareYmd(ymd, windowStartYmd) >= 0 && compareYmd(ymd, windowEndYmd) <= 0) {
      results.push({
        date: occDate,
        isAllDay: dtstart.isAllDay,
        ymd,
        hms: dtstart.hms,
        tzSpec: dtstart.tzSpec,
      });
    }

    if (rule.count !== undefined && generatedCount >= rule.count) return 'stop';
    return 'continue';
  };

  if (rule.freq === 'DAILY') {
    let k = 0;
    if (rule.count === undefined && compareYmd(startYmd, windowStartYmd) < 0) {
      const diff = ymdToSerialDay(windowStartYmd) - ymdToSerialDay(startYmd);
      k = Math.max(0, Math.floor(diff / rule.interval));
    }
    for (let steps = 0; steps < MAX_STEPS; steps++, k++) {
      const ymd = addDaysYmd(startYmd, k * rule.interval);
      if (compareYmd(ymd, windowEndYmd) > 0) break;
      if (rule.byMonth && !rule.byMonth.includes(ymd.month)) continue;
      if (rule.byMonthDay) {
        const allowedDays = resolveMonthDays(daysInMonth(ymd.year, ymd.month), rule.byMonthDay);
        if (!allowedDays.includes(ymd.day)) continue;
      }
      if (rule.byDay && !rule.byDay.some(bd => bd.weekday === weekdayOfYmd(ymd))) continue;
      if (tryAcceptYmd(ymd) === 'stop') break;
    }
    return results;
  }

  if (rule.freq === 'WEEKLY') {
    const startWd = weekdayOfYmd(startYmd);
    const offsetFromWkst = (startWd - rule.wkst + 7) % 7;
    const week0Start = addDaysYmd(startYmd, -offsetFromWkst);
    const targetWeekdays = (rule.byDay ? Array.from(new Set(rule.byDay.map(b => b.weekday))) : [startWd])
      .sort((a, b) => ((a - rule.wkst + 7) % 7) - ((b - rule.wkst + 7) % 7));

    let weekIdx = 0;
    if (rule.count === undefined && compareYmd(addDaysYmd(week0Start, 6), windowStartYmd) < 0) {
      const diffWeeks = Math.floor((ymdToSerialDay(windowStartYmd) - ymdToSerialDay(week0Start)) / 7);
      weekIdx = Math.max(0, Math.floor(diffWeeks / rule.interval));
    }

    for (let steps = 0; steps < MAX_STEPS; steps++, weekIdx++) {
      const weekStart = addDaysYmd(week0Start, weekIdx * rule.interval * 7);
      if (compareYmd(weekStart, windowEndYmd) > 0) break;

      for (const wd of targetWeekdays) {
        const ymd = addDaysYmd(weekStart, (wd - rule.wkst + 7) % 7);
        if (rule.byMonth && !rule.byMonth.includes(ymd.month)) continue;
        if (rule.byMonthDay) {
          const allowedDays = resolveMonthDays(daysInMonth(ymd.year, ymd.month), rule.byMonthDay);
          if (!allowedDays.includes(ymd.day)) continue;
        }
        if (tryAcceptYmd(ymd) === 'stop') return results;
      }
    }
    return results;
  }

  if (rule.freq === 'MONTHLY') {
    const startTotalMonths = startYmd.year * 12 + (startYmd.month - 1);
    let mIdx = 0;
    if (rule.count === undefined && compareYmd(startYmd, windowStartYmd) < 0) {
      const winTotalMonths = windowStartYmd.year * 12 + (windowStartYmd.month - 1);
      mIdx = Math.max(0, Math.floor((winTotalMonths - startTotalMonths) / rule.interval) - 1);
    }

    for (let steps = 0; steps < MAX_STEPS; steps++, mIdx++) {
      const totalMonths = startTotalMonths + mIdx * rule.interval;
      const year = Math.floor(totalMonths / 12);
      const month = (totalMonths % 12) + 1;
      const firstOfMonth: Ymd = { year, month, day: 1 };
      if (compareYmd(firstOfMonth, windowEndYmd) > 0) break;
      if (rule.byMonth && !rule.byMonth.includes(month)) continue;

      const dim = daysInMonth(year, month);
      let days: number[] = [];

      if (rule.byMonthDay && rule.byDay) {
        const mDays = new Set(resolveMonthDays(dim, rule.byMonthDay));
        days = getMonthDaysMatchingByDay(year, month, rule.byDay).filter(d => mDays.has(d));
      } else if (rule.byMonthDay) {
        days = resolveMonthDays(dim, rule.byMonthDay);
      } else if (rule.byDay) {
        days = getMonthDaysMatchingByDay(year, month, rule.byDay);
      } else if (startYmd.day <= dim) {
        days = [startYmd.day];
      }

      const monthCands = applySetPos(
        days.map(day => ({ year, month, day })),
        rule.bySetPos
      );

      for (const ymd of monthCands) {
        if (tryAcceptYmd(ymd) === 'stop') return results;
      }
    }
    return results;
  }

  // YEARLY
  let yIdx = 0;
  if (rule.count === undefined && startYmd.year < windowStartYmd.year) {
    yIdx = Math.max(0, Math.floor((windowStartYmd.year - startYmd.year) / rule.interval) - 1);
  }
  for (let steps = 0; steps < MAX_STEPS; steps++, yIdx++) {
    const year = startYmd.year + yIdx * rule.interval;
    if (year > windowEndYmd.year) break;

    const months = rule.byMonth && rule.byMonth.length > 0 ? rule.byMonth : [startYmd.month];
    const yearCands: Ymd[] = [];

    if (rule.byDay && !rule.byMonth) {
      // Nth weekday of the entire year
      const byWeekday: Record<number, Ymd[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
      for (let m = 1; m <= 12; m++) {
        const dim = daysInMonth(year, m);
        for (let d = 1; d <= dim; d++) {
          const ymd = { year, month: m, day: d };
          byWeekday[weekdayOfYmd(ymd)].push(ymd);
        }
      }
      const picked = new Map<string, Ymd>();
      for (const item of rule.byDay) {
        const matches = byWeekday[item.weekday] || [];
        if (item.nth === undefined) {
          for (const ymd of matches) picked.set(ymdToString(ymd), ymd);
        } else if (item.nth > 0 && item.nth <= matches.length) {
          const ymd = matches[item.nth - 1];
          picked.set(ymdToString(ymd), ymd);
        } else if (item.nth < 0) {
          const idx = matches.length + item.nth;
          if (idx >= 0 && idx < matches.length) {
            const ymd = matches[idx];
            picked.set(ymdToString(ymd), ymd);
          }
        }
      }
      yearCands.push(...Array.from(picked.values()).sort(compareYmd));
    } else {
      for (const month of months) {
        const dim = daysInMonth(year, month);
        let days: number[] = [];
        if (rule.byMonthDay && rule.byDay) {
          const mDays = new Set(resolveMonthDays(dim, rule.byMonthDay));
          days = getMonthDaysMatchingByDay(year, month, rule.byDay).filter(d => mDays.has(d));
        } else if (rule.byMonthDay) {
          days = resolveMonthDays(dim, rule.byMonthDay);
        } else if (rule.byDay) {
          days = getMonthDaysMatchingByDay(year, month, rule.byDay);
        } else if (startYmd.day <= dim) {
          days = [startYmd.day];
        }
        for (const day of days) {
          yearCands.push({ year, month, day });
        }
      }
    }

    const filtered = applySetPos(yearCands, rule.bySetPos);
    for (const ymd of filtered) {
      if (tryAcceptYmd(ymd) === 'stop') return results;
    }
  }

  return results;
}

function makeEventFromRaw(
  raw: RawVEvent,
  startInfo: ParsedDateInfo,
  durationMs: number,
  allDaySpanDays: number,
  explicitEndDate?: Date,
  idSuffix?: string
): CalendarEvent {
  const isFree =
    raw.transp === 'TRANSPARENT' ||
    raw.status === 'CANCELLED' ||
    raw.msBusyStatus === 'FREE';

  const id = idSuffix ? `${raw.uid}__${idSuffix}` : raw.uid;

  if (startInfo.isAllDay) {
    const endYmd = addDaysYmd(startInfo.ymd, allDaySpanDays);
    const endDate = explicitEndDate || buildDateInTzSpec(endYmd, { hour: 0, minute: 0, second: 0 }, startInfo.tzSpec);
    return {
      id,
      title: raw.title,
      start: startInfo.date.toISOString(),
      end: endDate.toISOString(),
      isAllDay: true,
      allDayStartDate: ymdToString(startInfo.ymd),
      allDayEndDate: ymdToString(endYmd),
      isBusy: !isFree,
    };
  }

  const endDate = explicitEndDate || new Date(startInfo.date.getTime() + durationMs);
  return {
    id,
    title: raw.title,
    start: startInfo.date.toISOString(),
    end: endDate.toISOString(),
    isBusy: !isFree,
  };
}

/**
 * Parses raw ICS string into CalendarEvent objects, including full RRULE/RDATE/EXDATE/RECURRENCE-ID expansion.
 */
export function parseIcsEvents(
  icsText: string,
  defaultTimezone: string = 'Europe/Paris',
  options: ParseIcsOptions = {}
): CalendarEvent[] {
  const lines = unfoldIcs(icsText);

  const now = options.now ?? new Date();
  const rangeStart = options.rangeStart ?? new Date(now.getTime() - 7 * 86400000);
  const rangeEnd = options.rangeEnd ?? new Date(now.getTime() + 90 * 86400000);

  // Map VTIMEZONE TZID -> offset (e.g. "+04:00")
  const vtimezones: Record<string, string> = {};
  let calendarTz = defaultTimezone;

  // First scan for calendar-level X-WR-TIMEZONE and VTIMEZONE definitions
  let inVTimezone = false;
  let currentVtzId = '';
  let inStandard = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VTIMEZONE') {
      inVTimezone = true;
      currentVtzId = '';
      inStandard = false;
      continue;
    }
    if (trimmed === 'END:VTIMEZONE') {
      inVTimezone = false;
      currentVtzId = '';
      inStandard = false;
      continue;
    }
    if (inVTimezone) {
      if (trimmed === 'BEGIN:STANDARD') {
        inStandard = true;
        continue;
      }
      if (trimmed === 'END:STANDARD') {
        inStandard = false;
        continue;
      }
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;
      const k = trimmed.slice(0, colonIdx).split(';')[0].toUpperCase();
      const v = trimmed.slice(colonIdx + 1).trim();
      if (k === 'TZID') {
        currentVtzId = v.replace(/^["']|["']$/g, '');
      } else if (k === 'TZOFFSETTO' && currentVtzId) {
        const off = normalizeOffset(v);
        if (off && (inStandard || !vtimezones[currentVtzId])) {
          vtimezones[currentVtzId] = off;
        }
      }
      continue;
    }

    if (trimmed.toUpperCase().startsWith('X-WR-TIMEZONE')) {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx !== -1) {
        const wrTz = trimmed.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (isValidIanaTimeZone(wrTz)) {
          calendarTz = wrTz;
        }
      }
    }
  }

  const rawEvents: RawVEvent[] = [];
  let inEvent = false;
  let cur: RawVEvent | null = null;
  let curDurationStr = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      inEvent = true;
      cur = {
        uid: `event-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title: 'Événement',
        durationMs: 0,
        transp: 'OPAQUE',
        status: '',
        msBusyStatus: '',
        rrules: [],
        exdates: [],
        rdates: [],
      };
      curDurationStr = '';
      continue;
    }

    if (trimmed === 'END:VEVENT') {
      inEvent = false;
      if (cur && cur.dtstart) {
        if (cur.dtend) {
          cur.durationMs = Math.max(0, cur.dtend.date.getTime() - cur.dtstart.date.getTime());
        } else if (curDurationStr) {
          cur.durationMs = parseIsoDurationMs(curDurationStr);
        } else if (cur.dtstart.isAllDay) {
          cur.durationMs = 24 * 60 * 60 * 1000;
        }

        if (cur.dtend || cur.durationMs > 0) {
          rawEvents.push(cur);
        }
      }
      cur = null;
      continue;
    }

    if (!inEvent || !cur) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const keyPart = trimmed.slice(0, colonIdx);
    const value = trimmed.slice(colonIdx + 1);
    const mainKey = keyPart.split(';')[0].toUpperCase();

    switch (mainKey) {
      case 'UID':
        cur.uid = value.trim();
        break;
      case 'SUMMARY':
        cur.title = value.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' ');
        break;
      case 'DTSTART': {
        const tzid = extractParam(keyPart, 'TZID');
        const valueType = extractParam(keyPart, 'VALUE')?.toUpperCase();
        const isAllDay = valueType === 'DATE' || /^\d{8}$/.test(value.trim());
        cur.dtstart = parseIcsDateDetailed(value, tzid, vtimezones, calendarTz, isAllDay);
        break;
      }
      case 'DTEND': {
        const tzid = extractParam(keyPart, 'TZID');
        const valueType = extractParam(keyPart, 'VALUE')?.toUpperCase();
        const isAllDay = valueType === 'DATE' || /^\d{8}$/.test(value.trim());
        cur.dtend = parseIcsDateDetailed(value, tzid, vtimezones, calendarTz, isAllDay);
        break;
      }
      case 'DURATION':
        curDurationStr = value;
        break;
      case 'TRANSP':
        cur.transp = value.trim().toUpperCase();
        break;
      case 'STATUS':
        cur.status = value.trim().toUpperCase();
        break;
      case 'X-MICROSOFT-CDO-BUSYSTATUS':
        cur.msBusyStatus = value.trim().toUpperCase();
        break;
      case 'RRULE':
        cur.rrules.push(value.trim());
        break;
      case 'EXDATE': {
        const tzid = extractParam(keyPart, 'TZID');
        const valueType = extractParam(keyPart, 'VALUE')?.toUpperCase();
        for (const item of value.split(',')) {
          const v = item.trim();
          if (!v) continue;
          const isAllDay = valueType === 'DATE' || /^\d{8}$/.test(v);
          const parsed = parseIcsDateDetailed(v, tzid, vtimezones, calendarTz, isAllDay);
          cur.exdates.push({
            date: parsed.date,
            isAllDay: parsed.isAllDay,
            ymdStr: ymdToString(parsed.ymd),
          });
        }
        break;
      }
      case 'RDATE': {
        const tzid = extractParam(keyPart, 'TZID');
        const valueType = extractParam(keyPart, 'VALUE')?.toUpperCase();
        for (const item of value.split(',')) {
          const v = item.trim();
          if (!v) continue;
          const isAllDay = valueType === 'DATE' || /^\d{8}$/.test(v);
          const parsed = parseIcsDateDetailed(v, tzid, vtimezones, calendarTz, isAllDay);
          cur.rdates.push({ info: parsed });
        }
        break;
      }
      case 'RECURRENCE-ID': {
        const tzid = extractParam(keyPart, 'TZID');
        const valueType = extractParam(keyPart, 'VALUE')?.toUpperCase();
        const range = extractParam(keyPart, 'RANGE')?.toUpperCase();
        const isAllDay = valueType === 'DATE' || /^\d{8}$/.test(value.trim());
        const parsed = parseIcsDateDetailed(value, tzid, vtimezones, calendarTz, isAllDay);
        cur.recurrenceId = {
          date: parsed.date,
          isAllDay: parsed.isAllDay,
          ymdStr: ymdToString(parsed.ymd),
          rangeThisAndFuture: range === 'THISANDFUTURE',
        };
        break;
      }
    }
  }

  // Group RECURRENCE-ID overrides by UID so master series suppress replaced/cancelled instances
  const overridesByUid = new Map<string, NonNullable<RawVEvent['recurrenceId']>[]>();
  for (const raw of rawEvents) {
    if (raw.recurrenceId) {
      const list = overridesByUid.get(raw.uid) || [];
      list.push(raw.recurrenceId);
      overridesByUid.set(raw.uid, list);
    }
  }

  const events: CalendarEvent[] = [];

  for (const raw of rawEvents) {
    const dtstart = raw.dtstart!;
    const allDaySpanDays = dtstart.isAllDay
      ? raw.dtend
        ? Math.max(1, ymdToSerialDay(raw.dtend.ymd) - ymdToSerialDay(dtstart.ymd))
        : Math.max(1, Math.round(raw.durationMs / 86400000))
      : 1;

    const isRecurringMaster = !raw.recurrenceId && (raw.rrules.length > 0 || raw.rdates.length > 0);

    if (!isRecurringMaster) {
      events.push(
        makeEventFromRaw(
          raw,
          dtstart,
          raw.durationMs,
          allDaySpanDays,
          raw.dtend?.date,
          raw.recurrenceId ? `rid_${raw.recurrenceId.date.toISOString()}` : undefined
        )
      );
      continue;
    }

    const candidates = new Map<number, ParsedDateInfo>();
    // Master DTSTART (only if it falls within [rangeStart - duration, rangeEnd])
    const masterEndMs = dtstart.date.getTime() + raw.durationMs;
    if (dtstart.date.getTime() <= rangeEnd.getTime() && masterEndMs >= rangeStart.getTime()) {
      candidates.set(dtstart.date.getTime(), dtstart);
    }

    for (const rruleStr of raw.rrules) {
      const parsedRule = parseRRule(rruleStr, dtstart.tzSpec);
      if (!parsedRule) continue;
      // Start expanding slightly before rangeStart so events straddling rangeStart are preserved
      const searchStart = new Date(rangeStart.getTime() - raw.durationMs);
      const occs = expandRRuleOccurrences(dtstart, parsedRule, searchStart, rangeEnd);
      for (const occ of occs) {
        candidates.set(occ.date.getTime(), occ);
      }
    }

    for (const rdate of raw.rdates) {
      const rMs = rdate.info.date.getTime();
      if (rMs <= rangeEnd.getTime() && rMs + raw.durationMs >= rangeStart.getTime()) {
        candidates.set(rMs, rdate.info);
      }
    }

    const uidOverrides = overridesByUid.get(raw.uid) || [];
    const sortedOccurrences = Array.from(candidates.values()).sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );

    for (const occ of sortedOccurrences) {
      const occMs = occ.date.getTime();
      const occEndMs = occMs + raw.durationMs;
      if (occEndMs < rangeStart.getTime() || occMs > rangeEnd.getTime()) {
        continue;
      }

      const occYmdStr = ymdToString(occ.ymd);

      // Skip excluded occurrences (EXDATE)
      const isExcluded = raw.exdates.some(ex =>
        ex.isAllDay || occ.isAllDay
          ? ex.ymdStr === occYmdStr
          : Math.abs(ex.date.getTime() - occMs) < 2000
      );
      if (isExcluded) continue;

      // Skip occurrences overridden by a RECURRENCE-ID event with the same UID
      const isOverridden = uidOverrides.some(ov => {
        if (ov.rangeThisAndFuture && occMs >= ov.date.getTime() - 2000) {
          return true;
        }
        return ov.isAllDay || occ.isAllDay
          ? ov.ymdStr === occYmdStr
          : Math.abs(ov.date.getTime() - occMs) < 2000;
      });
      if (isOverridden) continue;

      events.push(
        makeEventFromRaw(
          raw,
          occ,
          raw.durationMs,
          allDaySpanDays,
          undefined,
          occ.date.toISOString()
        )
      );
    }
  }

  return events;
}
