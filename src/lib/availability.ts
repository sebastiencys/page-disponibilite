/**
 * Core availability and calendar schedule calculation logic.
 * Pure functions, zero DOM dependencies, fully testable.
 */

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 1 = Monday, ...

export interface DaySchedule {
  enabled: boolean;
  start: string; // "HH:mm" e.g. "09:00"
  end: string;   // "HH:mm" e.g. "18:00"
}

export interface DayLunchOverride {
  enabled?: boolean;
  start?: string;
  end?: string;
  label?: string;
}

export interface BreakSchedule {
  enabled: boolean;
  start: string; // "12:30"
  end: string;   // "13:30"
  label: string; // "Pause déjeuner"
  days?: Partial<Record<DayOfWeek, DayLunchOverride>>;
}

export interface ScheduleConfig {
  timezone: string;
  days: Record<DayOfWeek, DaySchedule>;
  lunchBreak: BreakSchedule;
  bufferMinutes: number; // buffer before/after meetings
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string | Date; // ISO string or Date
  end: string | Date;
  isAllDay?: boolean;
  allDayStartDate?: string; // "YYYY-MM-DD"
  allDayEndDate?: string;   // "YYYY-MM-DD" (exclusive per RFC 5545)
  isBusy?: boolean; // true if marks user as busy (default true)
}

import scheduleJson from '../../config/schedule.json' with { type: 'json' };
import personalJson from '../../config/personal.json' with { type: 'json' };

export interface UserProfile {
  name: string;
  role: string;
  company: string;
  email: string;
  bookingUrl: string;
}

export const DEFAULT_PROFILE: UserProfile = personalJson as unknown as UserProfile;

export type AvailabilityStatus =
  | 'AVAILABLE'
  | 'BUSY'
  | 'LUNCH'
  | 'OFF_HOURS'
  | 'OVERRIDE_BUSY'
  | 'OVERRIDE_AVAILABLE'
  | 'OVERRIDE_BREAK'
  | 'OVERRIDE_DND';

export interface ManualOverride {
  type: 'auto' | 'busy' | 'available' | 'break' | 'dnd';
  note?: string;
  expiresAt?: string | null; // ISO string or null for permanent
}

export interface AvailabilityResult {
  status: AvailabilityStatus;
  state: 'available' | 'busy' | 'away' | 'off';
  badgeColor: string; // Hex color
  dotColor: string;
  title: string;      // e.g. "Disponible", "En réunion"
  subtitle: string;   // e.g. "Jusqu'à 14h00", "Libre à 11h30"
  isWorkTime: boolean;
  nextFreeTime?: string; // Formatted time
  nextChangeDate?: Date;
}

export interface AnonymizedSlot {
  start: string; // ISO string
  end: string;   // ISO string
  label: string; // "Créneau réservé"
}

export const DEFAULT_SCHEDULE: ScheduleConfig = scheduleJson as unknown as ScheduleConfig;

function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}h${m > 0 ? m.toString().padStart(2, '0') : '00'}`;
}

export interface EffectiveLunchBreak {
  enabled: boolean;
  start: string;
  end: string;
  label: string;
  isCustomForDay: boolean;
}

/**
 * Resolves the lunch break for a specific day of week.
 * Day-specific entries in schedule.lunchBreak.days take priority over global lunchBreak,
 * falling back to the global lunchBreak whenever fields are absent or blank.
 */
export function getEffectiveLunchBreak(
  schedule: ScheduleConfig,
  dayOfWeek: DayOfWeek
): EffectiveLunchBreak {
  const globalBreak = schedule.lunchBreak;
  const defaultLabel = globalBreak.label?.trim() || 'Pause déjeuner';
  const dayOverride = globalBreak.days?.[dayOfWeek];

  if (!dayOverride) {
    return {
      enabled: Boolean(globalBreak.enabled),
      start: globalBreak.start,
      end: globalBreak.end,
      label: defaultLabel,
      isCustomForDay: false,
    };
  }

  const customStart = dayOverride.start?.trim();
  const customEnd = dayOverride.end?.trim();
  const customLabel = dayOverride.label?.trim();
  const hasCustomTime = Boolean(customStart || customEnd);

  const start = customStart || globalBreak.start;
  const end = customEnd || globalBreak.end;
  const label = customLabel || defaultLabel;
  const enabled =
    dayOverride.enabled !== undefined
      ? Boolean(dayOverride.enabled)
      : hasCustomTime
      ? true
      : Boolean(globalBreak.enabled);

  const isCustomForDay =
    enabled !== Boolean(globalBreak.enabled) ||
    start !== globalBreak.start ||
    end !== globalBreak.end ||
    label !== defaultLabel;

  return {
    enabled,
    start,
    end,
    label,
    isCustomForDay,
  };
}

export function getZonedDateParts(date: Date, timeZone: string = 'Europe/Paris') {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
    });

    const parts = formatter.formatToParts(date);
    let year = date.getFullYear();
    let month = date.getMonth() + 1;
    let day = date.getDate();
    let hour = date.getHours();
    let minute = date.getMinutes();
    let second = date.getSeconds();
    let weekdayStr = '';

    for (const p of parts) {
      if (p.type === 'year') year = parseInt(p.value, 10);
      else if (p.type === 'month') month = parseInt(p.value, 10);
      else if (p.type === 'day') day = parseInt(p.value, 10);
      else if (p.type === 'hour') {
        const h = parseInt(p.value, 10);
        hour = h === 24 ? 0 : h;
      } else if (p.type === 'minute') minute = parseInt(p.value, 10);
      else if (p.type === 'second') second = parseInt(p.value, 10);
      else if (p.type === 'weekday') weekdayStr = p.value;
    }

    const weekdayMap: Record<string, DayOfWeek> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };

    const dayOfWeek = weekdayMap[weekdayStr] ?? (date.getDay() as DayOfWeek);
    return { year, month, day, hour, minute, second, dayOfWeek };
  } catch {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
      dayOfWeek: date.getDay() as DayOfWeek,
    };
  }
}

export function formatTimeShort(date: Date, timeZone: string = 'Europe/Paris'): string {
  try {
    const formatter = new Intl.DateTimeFormat('fr-FR', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    let hour = '';
    let minute = '';
    for (const p of parts) {
      if (p.type === 'hour') hour = p.value.padStart(2, '0');
      if (p.type === 'minute') minute = p.value.padStart(2, '0');
    }
    if (hour && minute) return `${hour}h${minute}`;
  } catch {}
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}h${m}`;
}

/**
 * Creates a Date object representing the specified date and time in the target timezone.
 * @param dateStr "YYYY-MM-DD"
 * @param timeStr "HH:mm" or "HH:mm:ss"
 * @param timeZone target timezone (e.g. "Europe/Paris" or "Indian/Reunion")
 */
export function createDateInTimezone(
  dateStr: string,
  timeStr: string,
  timeZone: string = 'Europe/Paris'
): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute, second] = timeStr.split(':').map(Number);
  const utcGuess = new Date(
    Date.UTC(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, second || 0)
  );
  const parts1 = getZonedDateParts(utcGuess, timeZone);
  const asTz1 = new Date(
    Date.UTC(parts1.year, parts1.month - 1, parts1.day, parts1.hour, parts1.minute, parts1.second)
  );
  const candidate = new Date(utcGuess.getTime() - (asTz1.getTime() - utcGuess.getTime()));

  // Second pass handles DST boundary transitions accurately
  const parts2 = getZonedDateParts(candidate, timeZone);
  const asTz2 = new Date(
    Date.UTC(parts2.year, parts2.month - 1, parts2.day, parts2.hour, parts2.minute, parts2.second)
  );
  const diff2 = asTz2.getTime() - utcGuess.getTime();
  return diff2 === 0 ? candidate : new Date(candidate.getTime() - diff2);
}

function formatZonedDateStr(date: Date, timeZone: string): string {
  const p = getZonedDateParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Expands all-day events onto each covered day using that day's configured start/end hours,
 * even when that day is normally marked `enabled: false` in schedule.days.
 * Timed events are preserved verbatim so meetings outside work hours are still respected.
 */
export function normalizeEventsForSchedule(
  events: CalendarEvent[],
  schedule: ScheduleConfig = DEFAULT_SCHEDULE,
  timeZone: string = schedule.timezone || 'Europe/Paris'
): CalendarEvent[] {
  const normalized: CalendarEvent[] = [];

  for (const evt of events) {
    if (!evt.isAllDay) {
      normalized.push(evt);
      continue;
    }

    if (evt.isBusy === false) {
      continue;
    }

    const startDateRaw = evt.allDayStartDate && /^\d{4}-\d{2}-\d{2}$/.test(evt.allDayStartDate)
      ? evt.allDayStartDate
      : formatZonedDateStr(new Date(evt.start), timeZone);

    let endDateRaw = evt.allDayEndDate && /^\d{4}-\d{2}-\d{2}$/.test(evt.allDayEndDate)
      ? evt.allDayEndDate
      : formatZonedDateStr(new Date(evt.end), timeZone);

    if (endDateRaw <= startDateRaw) {
      endDateRaw = addDaysToDateStr(startDateRaw, 1);
    }

    let curDate = startDateRaw;
    let guard = 0;
    while (curDate < endDateRaw && guard < 90) {
      const dayOfWeek = new Date(`${curDate}T12:00:00Z`).getUTCDay() as DayOfWeek;
      const daySchedule = schedule.days[dayOfWeek];
      const dayStart = daySchedule?.start?.trim() || '09:00';
      const dayEnd = daySchedule?.end?.trim() || '18:00';
      const slotStart = createDateInTimezone(curDate, dayStart, timeZone);
      const slotEnd = createDateInTimezone(curDate, dayEnd, timeZone);
      if (slotEnd.getTime() > slotStart.getTime()) {
        normalized.push({
          ...evt,
          id: `${evt.id}_${curDate}`,
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          isAllDay: true,
        });
      }
      curDate = addDaysToDateStr(curDate, 1);
      guard++;
    }
  }

  return normalized;
}

const DAY_NAMES_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/**
 * Finds the next truly available working moment from a given reference date,
 * skipping disabled days, lunch breaks, and scheduled busy calendar events.
 */
export function getNextWorkStart(
  now: Date,
  schedule: ScheduleConfig,
  timeZone: string = schedule.timezone || 'Europe/Paris',
  events: CalendarEvent[] = [],
  preNormalizedSortedEvents?: Array<CalendarEvent & { startDate: Date; endDate: Date }>
): { date: Date; text: string } {
  const bufferMs = (schedule.bufferMinutes || 0) * 60 * 1000;
  const sortedEvents =
    preNormalizedSortedEvents ??
    normalizeEventsForSchedule(events, schedule, timeZone)
      .filter(e => e.isBusy !== false)
      .map(e => ({
        ...e,
        startDate: new Date(e.start),
        endDate: new Date(e.end),
      }))
      .filter(e => !isNaN(e.startDate.getTime()) && !isNaN(e.endDate.getTime()))
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  const nowMs = now.getTime();
  const zonedNow = getZonedDateParts(now, timeZone);
  const todayDateStr = `${zonedNow.year}-${String(zonedNow.month).padStart(2, '0')}-${String(zonedNow.day).padStart(2, '0')}`;

  for (let offset = 0; offset <= 60; offset++) {
    const dateStr = offset === 0 ? todayDateStr : addDaysToDateStr(todayDateStr, offset);
    const dayOfWeek = new Date(`${dateStr}T12:00:00Z`).getUTCDay() as DayOfWeek;
    const dayConfig = schedule.days[dayOfWeek];
    if (!dayConfig || !dayConfig.enabled) {
      continue;
    }

    const workStartMs = createDateInTimezone(dateStr, dayConfig.start, timeZone).getTime();
    const workEndMs = createDateInTimezone(dateStr, dayConfig.end, timeZone).getTime();
    const candidateStartMs = offset === 0 ? Math.max(workStartMs, nowMs) : workStartMs;
    if (candidateStartMs >= workEndMs) {
      continue;
    }

    const blockers: Array<{ start: number; end: number }> = [];

    for (const evt of sortedEvents) {
      const bStart = evt.startDate.getTime() - bufferMs;
      const bEnd = evt.endDate.getTime() + bufferMs;
      if (bEnd > candidateStartMs && bStart < workEndMs) {
        blockers.push({ start: bStart, end: bEnd });
      }
    }

    const effectiveLunch = getEffectiveLunchBreak(schedule, dayOfWeek);
    if (effectiveLunch.enabled) {
      const lunchStartMs = createDateInTimezone(dateStr, effectiveLunch.start, timeZone).getTime();
      const lunchEndMs = createDateInTimezone(dateStr, effectiveLunch.end, timeZone).getTime();
      if (lunchEndMs > lunchStartMs && lunchEndMs > candidateStartMs && lunchStartMs < workEndMs) {
        blockers.push({ start: lunchStartMs, end: lunchEndMs });
      }
    }

    blockers.sort((a, b) => a.start - b.start);

    let cursor = candidateStartMs;
    for (const block of blockers) {
      if (block.end <= cursor) continue;
      if (block.start > cursor) break;
      cursor = Math.max(cursor, block.end);
    }

    if (cursor < workEndMs) {
      const foundDate = new Date(cursor);
      const timeStr = formatTimeShort(foundDate, timeZone);
      const dayLabel = DAY_NAMES_FR[dayOfWeek];

      let text: string;
      if (offset === 0) {
        text = `Aujourd'hui à ${timeStr}`;
      } else if (offset <= 6) {
        text = `${dayLabel} à ${timeStr}`;
      } else {
        const fp = getZonedDateParts(foundDate, timeZone);
        text = `${dayLabel} ${String(fp.day).padStart(2, '0')}/${String(fp.month).padStart(2, '0')} à ${timeStr}`;
      }

      return { date: foundDate, text };
    }
  }

  return { date: now, text: 'Bientôt' };
}


/**
 * Calculates availability for a given timestamp based on schedule, events and overrides.
 */
export function calculateAvailability(
  now: Date,
  schedule: ScheduleConfig,
  events: CalendarEvent[],
  override?: ManualOverride | null,
  timezoneOverride?: string
): AvailabilityResult {
  const timeZone = timezoneOverride || schedule.timezone || 'Europe/Paris';
  const zoned = getZonedDateParts(now, timeZone);

  // Check active manual override first
  if (override && override.type !== 'auto') {
    const isExpired = override.expiresAt ? new Date(override.expiresAt).getTime() <= now.getTime() : false;
    if (!isExpired) {
      switch (override.type) {
        case 'busy':
          return {
            status: 'OVERRIDE_BUSY',
            state: 'busy',
            badgeColor: '#EF4444',
            dotColor: '#DC2626',
            title: override.note || 'Occupé',
            subtitle: override.expiresAt ? `Jusqu'à ${formatTimeShort(new Date(override.expiresAt), timeZone)}` : 'Forcé manuellement',
            isWorkTime: true,
          };
        case 'available':
          return {
            status: 'OVERRIDE_AVAILABLE',
            state: 'available',
            badgeColor: '#10B981',
            dotColor: '#059669',
            title: override.note || 'Disponible',
            subtitle: override.expiresAt ? `Jusqu'à ${formatTimeShort(new Date(override.expiresAt), timeZone)}` : 'Mode disponible forcé',
            isWorkTime: true,
          };
        case 'break':
          return {
            status: 'OVERRIDE_BREAK',
            state: 'away',
            badgeColor: '#F59E0B',
            dotColor: '#D97706',
            title: override.note || 'En pause',
            subtitle: override.expiresAt ? `Reprise à ${formatTimeShort(new Date(override.expiresAt), timeZone)}` : 'Pause temporaire',
            isWorkTime: true,
          };
        case 'dnd':
          return {
            status: 'OVERRIDE_DND',
            state: 'busy',
            badgeColor: '#8B5CF6',
            dotColor: '#7C3AED',
            title: override.note || 'Ne pas déranger',
            subtitle: override.expiresAt ? `Jusqu'à ${formatTimeShort(new Date(override.expiresAt), timeZone)}` : 'Mode focus',
            isWorkTime: true,
          };
      }
    }
  }

  // 1. Check active meetings FIRST (including meetings outside normal working hours/days)
  // All-day events are normalized to working hours of enabled work days.
  const bufferMs = (schedule.bufferMinutes || 0) * 60 * 1000;
  const nowMs = now.getTime();
  const normalizedEvents = normalizeEventsForSchedule(events, schedule, timeZone);

  const sortedEvents = normalizedEvents
    .filter(e => e.isBusy !== false) // Only busy events
    .map(e => ({
      ...e,
      startDate: new Date(e.start),
      endDate: new Date(e.end),
    }))
    .filter(e => !isNaN(e.startDate.getTime()) && !isNaN(e.endDate.getTime()))
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  // Check if currently in an event
  const currentEvent = sortedEvents.find(e => {
    const bufferedStart = e.startDate.getTime() - bufferMs;
    const bufferedEnd = e.endDate.getTime() + bufferMs;
    return nowMs >= bufferedStart && nowMs < bufferedEnd;
  });

  if (currentEvent) {
    // Find next free time (check if another event is chained directly)
    let freeTime = currentEvent.endDate;
    for (const upcoming of sortedEvents) {
      if (upcoming.startDate.getTime() <= freeTime.getTime() + bufferMs) {
        if (upcoming.endDate.getTime() > freeTime.getTime()) {
          freeTime = upcoming.endDate;
        }
      }
    }

    if (currentEvent.isAllDay) {
      const nextStart = getNextWorkStart(freeTime, schedule, timeZone, [], sortedEvents);
      return {
        status: 'BUSY',
        state: 'busy',
        badgeColor: '#EF4444',
        dotColor: '#DC2626',
        title: 'En réunion / Occupé',
        subtitle: `Reprise ${nextStart.text}`,
        isWorkTime: true,
        nextFreeTime: nextStart.text,
        nextChangeDate: nextStart.date,
      };
    }

    return {
      status: 'BUSY',
      state: 'busy',
      badgeColor: '#EF4444',
      dotColor: '#DC2626',
      title: 'En réunion / Occupé',
      subtitle: `Libre à ${formatTimeShort(freeTime, timeZone)}`,
      isWorkTime: true,
      nextFreeTime: formatTimeShort(freeTime, timeZone),
      nextChangeDate: freeTime,
    };
  }

  const currentDay = zoned.dayOfWeek;
  const currentMinutes = zoned.hour * 60 + zoned.minute;
  const daySchedule = schedule.days[currentDay];

  // 2. Check if today is a working day (e.g. weekend or day off)
  if (!daySchedule || !daySchedule.enabled) {
    const nextStart = getNextWorkStart(now, schedule, timeZone, [], sortedEvents);
    return {
      status: 'OFF_HOURS',
      state: 'off',
      badgeColor: '#64748B',
      dotColor: '#475569',
      title: 'Hors horaires de travail',
      subtitle: `Reprise ${nextStart.text}`,
      isWorkTime: false,
      nextFreeTime: nextStart.text,
      nextChangeDate: nextStart.date,
    };
  }

  const startMin = parseTimeToMinutes(daySchedule.start);
  const endMin = parseTimeToMinutes(daySchedule.end);

  // 3. Check if before or after work hours
  if (currentMinutes < startMin || currentMinutes >= endMin) {
    const nextStart = getNextWorkStart(now, schedule, timeZone, [], sortedEvents);
    return {
      status: 'OFF_HOURS',
      state: 'off',
      badgeColor: '#64748B',
      dotColor: '#475569',
      title: 'Hors horaires de travail',
      subtitle: `Reprise ${nextStart.text}`,
      isWorkTime: false,
      nextFreeTime: nextStart.text,
      nextChangeDate: nextStart.date,
    };
  }

  // 4. Check lunch break (day-specific override takes priority over global lunchBreak)
  const effectiveLunch = getEffectiveLunchBreak(schedule, currentDay);
  if (effectiveLunch.enabled) {
    const lunchStart = parseTimeToMinutes(effectiveLunch.start);
    const lunchEnd = parseTimeToMinutes(effectiveLunch.end);
    if (currentMinutes >= lunchStart && currentMinutes < lunchEnd) {
      const lunchEndDate = new Date(now);
      return {
        status: 'LUNCH',
        state: 'away',
        badgeColor: '#F59E0B',
        dotColor: '#D97706',
        title: effectiveLunch.label,
        subtitle: `Reprise à ${formatMinutesToTime(lunchEnd)}`,
        isWorkTime: false,
        nextFreeTime: formatMinutesToTime(lunchEnd),
        nextChangeDate: lunchEndDate,
      };
    }
  }

  // 5. Currently AVAILABLE! Find when next busy event or end of day occurs
  const nextEvent = sortedEvents.find(e => e.startDate.getTime() > nowMs);
  let availableUntilText = `Jusqu'à ${formatMinutesToTime(endMin)}`;
  let nextChangeDate: Date | undefined;

  // Next change could be lunch break if before lunch
  if (effectiveLunch.enabled) {
    const lunchStart = parseTimeToMinutes(effectiveLunch.start);
    if (currentMinutes < lunchStart) {
      availableUntilText = `Jusqu'à ${formatMinutesToTime(lunchStart)} (pause)`;
      const lunchDate = new Date(now);
      nextChangeDate = lunchDate;
    }
  }

  // Or next event if earlier
  if (nextEvent) {
    const nextEventZoned = getZonedDateParts(nextEvent.startDate, timeZone);
    const eventMinutes = nextEventZoned.hour * 60 + nextEventZoned.minute;
    const eventTimeStr = formatTimeShort(nextEvent.startDate, timeZone);

    // Is it today in the user's timezone?
    const isToday =
      nextEventZoned.year === zoned.year &&
      nextEventZoned.month === zoned.month &&
      nextEventZoned.day === zoned.day;
    if (isToday) {
      const lunchStart = effectiveLunch.enabled ? parseTimeToMinutes(effectiveLunch.start) : 9999;
      const lunchEnd = effectiveLunch.enabled ? parseTimeToMinutes(effectiveLunch.end) : -1;
      if (eventMinutes < endMin && (eventMinutes < lunchStart || currentMinutes >= lunchEnd)) {
        availableUntilText = `Jusqu'à ${eventTimeStr}`;
        nextChangeDate = nextEvent.startDate;
      }
    }
  }

  return {
    status: 'AVAILABLE',
    state: 'available',
    badgeColor: '#10B981',
    dotColor: '#059669',
    title: 'Disponible',
    subtitle: availableUntilText,
    isWorkTime: true,
    nextFreeTime: 'Maintenant',
    nextChangeDate,
  };
}

/**
 * Returns a privacy-safe, anonymized list of upcoming busy slots.
 * Strips all personal details (titles, descriptions, locations, participants)
 * and merges contiguous or overlapping meetings.
 */
export function getAnonymizedUpcomingSlots(
  events: CalendarEvent[],
  fromDate: Date = new Date(),
  maxSlots = 8,
  schedule: ScheduleConfig = DEFAULT_SCHEDULE,
  timeZone: string = schedule.timezone || 'Europe/Paris'
): AnonymizedSlot[] {
  const fromMs = fromDate.getTime();
  const normalizedEvents = normalizeEventsForSchedule(events, schedule, timeZone);

  const validEvents = normalizedEvents
    .filter(evt => {
      if (evt.isBusy === false) return false;
      const endMs = new Date(evt.end).getTime();
      return !isNaN(endMs) && endMs > fromMs;
    })
    .map(evt => {
      const startMs = Math.max(new Date(evt.start).getTime(), fromMs);
      const endMs = new Date(evt.end).getTime();
      return { startMs, endMs };
    })
    .sort((a, b) => a.startMs - b.startMs);

  if (validEvents.length === 0) return [];

  const merged: { startMs: number; endMs: number }[] = [];
  for (const slot of validEvents) {
    const last = merged[merged.length - 1];
    if (last && slot.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, slot.endMs);
    } else {
      merged.push({ startMs: slot.startMs, endMs: slot.endMs });
    }
  }

  return merged.slice(0, maxSlots).map(slot => ({
    start: new Date(slot.startMs).toISOString(),
    end: new Date(slot.endMs).toISOString(),
    label: 'Créneau réservé',
  }));
}
