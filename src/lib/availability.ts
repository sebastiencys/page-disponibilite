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

export interface BreakSchedule {
  enabled: boolean;
  start: string; // "12:30"
  end: string;   // "13:30"
  label: string; // "Pause déjeuner"
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
  isBusy?: boolean; // true if marks user as busy (default true)
}

import scheduleJson from '../config/schedule.json' with { type: 'json' };
import personalJson from '../config/personal.json' with { type: 'json' };

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
 * @param timeStr "HH:mm"
 * @param timeZone target timezone (e.g. "Europe/Paris" or "Indian/Reunion")
 */
export function createDateInTimezone(
  dateStr: string,
  timeStr: string,
  timeZone: string = 'Europe/Paris'
): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const utcGuess = new Date(Date.UTC(year, (month || 1) - 1, day || 1, hour || 0, minute || 0));
  const parts = getZonedDateParts(utcGuess, timeZone);
  const asTz = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute));
  const diffMs = asTz.getTime() - utcGuess.getTime();
  return new Date(utcGuess.getTime() - diffMs);
}

const DAY_NAMES_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/**
 * Finds the next working start time from a given reference date
 */
export function getNextWorkStart(
  now: Date,
  schedule: ScheduleConfig,
  timeZone: string = schedule.timezone || 'Europe/Paris'
): { date: Date; text: string } {
  const zoned = getZonedDateParts(now, timeZone);
  const currentDay = zoned.dayOfWeek;
  const currentMinutes = zoned.hour * 60 + zoned.minute;

  // Check today later
  const todaySchedule = schedule.days[currentDay];
  if (todaySchedule && todaySchedule.enabled) {
    const todayStartMin = parseTimeToMinutes(todaySchedule.start);
    if (currentMinutes < todayStartMin) {
      const nextDate = new Date(now);
      return {
        date: nextDate,
        text: `Aujourd'hui à ${todaySchedule.start.replace(':', 'h')}`,
      };
    }
  }

  // Look ahead up to 7 days
  for (let offset = 1; offset <= 7; offset++) {
    const nextDayIndex = ((currentDay + offset) % 7) as DayOfWeek;
    const dayConfig = schedule.days[nextDayIndex];
    if (dayConfig && dayConfig.enabled) {
      const nextDate = new Date(now);
      nextDate.setDate(now.getDate() + offset);
      const dayLabel = DAY_NAMES_FR[nextDayIndex];
      return {
        date: nextDate,
        text: `${dayLabel} à ${dayConfig.start.replace(':', 'h')}`,
      };
    }
  }

  // Fallback
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

  const currentDay = zoned.dayOfWeek;
  const currentMinutes = zoned.hour * 60 + zoned.minute;
  const daySchedule = schedule.days[currentDay];

  // 1. Check if today is a working day (e.g. weekend or day off)
  if (!daySchedule || !daySchedule.enabled) {
    const nextStart = getNextWorkStart(now, schedule, timeZone);
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

  // 2. Check if before or after work hours
  if (currentMinutes < startMin || currentMinutes >= endMin) {
    const nextStart = getNextWorkStart(now, schedule, timeZone);
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

  // 3. Within working hours: Check if currently in an active calendar appointment
  const bufferMs = (schedule.bufferMinutes || 0) * 60 * 1000;
  const nowMs = now.getTime();

  const sortedEvents = events
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

  // 4. Check lunch break
  if (schedule.lunchBreak.enabled) {
    const lunchStart = parseTimeToMinutes(schedule.lunchBreak.start);
    const lunchEnd = parseTimeToMinutes(schedule.lunchBreak.end);
    if (currentMinutes >= lunchStart && currentMinutes < lunchEnd) {
      const lunchEndDate = new Date(now);
      return {
        status: 'LUNCH',
        state: 'away',
        badgeColor: '#F59E0B',
        dotColor: '#D97706',
        title: schedule.lunchBreak.label || 'Pause déjeuner',
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
  if (schedule.lunchBreak.enabled) {
    const lunchStart = parseTimeToMinutes(schedule.lunchBreak.start);
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
      const lunchStart = schedule.lunchBreak.enabled ? parseTimeToMinutes(schedule.lunchBreak.start) : 9999;
      if (eventMinutes < lunchStart || currentMinutes >= parseTimeToMinutes(schedule.lunchBreak.end)) {
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
