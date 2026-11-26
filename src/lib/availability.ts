/**
 * Core availability and calendar schedule calculation logic.
 * Pure functions, zero DOM dependencies, fully testable.
 */

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 1 = Monday, ...
export type AppLang = 'fr' | 'en';
export type ProfileMode = 'person' | 'shop';

export function normalizeAppLang(value: unknown, fallback: AppLang = 'fr'): AppLang {
  if (typeof value === 'string') {
    const clean = value.trim().toLowerCase();
    if (clean === 'en' || clean.startsWith('en-') || clean.startsWith('en_')) return 'en';
    if (clean === 'fr' || clean.startsWith('fr-') || clean.startsWith('fr_')) return 'fr';
  }
  return fallback;
}

export function normalizeProfileMode(value: unknown, fallback: ProfileMode = 'person'): ProfileMode {
  if (typeof value === 'string') {
    const clean = value.trim().toLowerCase();
    if (clean === 'shop' || clean === 'boutique' || clean === 'store' || clean === 'commerce' || clean === 'business') {
      return 'shop';
    }
    if (clean === 'person' || clean === 'personne' || clean === 'individual' || clean === 'perso') {
      return 'person';
    }
  }
  return fallback;
}

export function sanitizeOptionalContactField(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || /^(null|none|undefined)$/i.test(trimmed)) return '';
  return trimmed;
}

export function getAvailableLabel(mode: ProfileMode = 'person', lang: AppLang = 'fr'): string {
  if (mode === 'shop') {
    return lang === 'en' ? 'Open' : 'Ouvert';
  }
  return lang === 'en' ? 'Available' : 'Disponible';
}

export function getOffDayLabel(mode: ProfileMode = 'person', lang: AppLang = 'fr'): string {
  if (mode === 'shop') {
    return lang === 'en' ? 'Closed' : 'Fermé';
  }
  return lang === 'en' ? 'Off' : 'Repos';
}

export function getScheduleHeadingLabel(mode: ProfileMode = 'person', lang: AppLang = 'fr'): string {
  if (mode === 'shop') {
    return lang === 'en' ? 'Opening hours' : "Horaires d'ouverture";
  }
  return lang === 'en' ? 'Regular working hours' : 'Horaires habituels de travail';
}

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

export interface ClosurePeriod {
  startDate: string; // "YYYY-MM-DD" (or "MM-DD" with annual: true)
  endDate?: string;  // inclusive "YYYY-MM-DD" (or "MM-DD"); defaults to startDate
  label?: string;    // e.g. "Jour férié", "Congés d'été"
  type?: 'holiday' | 'vacation';
  annual?: boolean;
}

export interface ScheduleConfig {
  timezone: string;
  days: Record<DayOfWeek, DaySchedule>;
  lunchBreak: BreakSchedule;
  bufferMinutes: number; // buffer before/after meetings
  closures?: ClosurePeriod[];
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
  calendarId?: string;    // Source calendar identifier (e.g. "pro", "perso")
  calendarLabel?: string; // Public category label for source calendar (e.g. "Pro", "Perso")
}

import scheduleJson from '../../config/schedule.json' with { type: 'json' };
import personalJson from '../../config/personal.json' with { type: 'json' };

export interface UserProfile {
  name: string;
  role: string;
  company: string;
  email: string;
  bookingUrl: string;
  mode?: ProfileMode;
}

type EnvRecord = Record<string, string | undefined>;

function getSafeProcessEnv(): EnvRecord | undefined {
  try {
    return typeof process !== 'undefined' && process.env ? (process.env as EnvRecord) : undefined;
  } catch {
    return undefined;
  }
}

const rawPersonal = (personalJson || {}) as Record<string, unknown>;
const FILE_DEFAULT_PROFILE: UserProfile = {
  name: sanitizeOptionalContactField(rawPersonal.name) || 'DispoLive',
  role: sanitizeOptionalContactField(rawPersonal.role),
  company: sanitizeOptionalContactField(rawPersonal.company),
  email: sanitizeOptionalContactField(rawPersonal.email),
  bookingUrl: sanitizeOptionalContactField(rawPersonal.bookingUrl),
  mode: normalizeProfileMode(rawPersonal.mode, 'person'),
};

function hasDefinedEnvVar(env: EnvRecord | undefined, key: string): boolean {
  return Boolean(env && Object.prototype.hasOwnProperty.call(env, key) && env[key] !== undefined);
}

function decodeBase64Utf8(raw: string): string {
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(raw, 'base64').toString('utf8');
    }
    if (typeof atob === 'function') {
      const binary = atob(raw);
      const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
  } catch {
    // Ignore invalid base64 payload
  }
  return '';
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parsePersonalJsonEnv(env: EnvRecord): Record<string, unknown> | null {
  const rawJson =
    (env.PERSONAL_JSON && env.PERSONAL_JSON.trim()) ||
    (env.PERSONAL_JSON_BASE64 && decodeBase64Utf8(env.PERSONAL_JSON_BASE64.trim())) ||
    '';
  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(rawJson);
    return isPlainRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Resolves public profile fields with environment variables taking priority over config/personal.json.
 * Priority: config/personal.json < PERSONAL_JSON(_BASE64) < individual PROFILE_* env vars.
 */
export function resolveProfileFromEnv(
  env: EnvRecord | undefined = getSafeProcessEnv(),
  baseProfile: UserProfile = FILE_DEFAULT_PROFILE
): UserProfile {
  let effectiveName = sanitizeOptionalContactField(baseProfile.name) || 'DispoLive';
  let effectiveRole = sanitizeOptionalContactField(baseProfile.role);
  let effectiveCompany = sanitizeOptionalContactField(baseProfile.company);
  let effectiveEmail = sanitizeOptionalContactField(baseProfile.email);
  let effectiveBookingUrl = sanitizeOptionalContactField(baseProfile.bookingUrl);
  let effectiveMode = normalizeProfileMode(baseProfile.mode, 'person');

  if (!env) {
    return {
      name: effectiveName,
      role: effectiveRole,
      company: effectiveCompany,
      email: effectiveEmail,
      bookingUrl: effectiveBookingUrl,
      mode: effectiveMode,
    };
  }

  const jsonOverride = parsePersonalJsonEnv(env);
  if (jsonOverride) {
    const jsonName = sanitizeOptionalContactField(jsonOverride.name);
    if (jsonName) effectiveName = jsonName;
    if ('role' in jsonOverride && jsonOverride.role !== undefined) {
      effectiveRole = sanitizeOptionalContactField(jsonOverride.role);
    }
    if ('company' in jsonOverride && jsonOverride.company !== undefined) {
      effectiveCompany = sanitizeOptionalContactField(jsonOverride.company);
    }
    if ('email' in jsonOverride && jsonOverride.email !== undefined) {
      effectiveEmail = sanitizeOptionalContactField(jsonOverride.email);
    }
    if ('bookingUrl' in jsonOverride && jsonOverride.bookingUrl !== undefined) {
      effectiveBookingUrl = sanitizeOptionalContactField(jsonOverride.bookingUrl);
    }
    if ('mode' in jsonOverride && jsonOverride.mode !== undefined) {
      effectiveMode = normalizeProfileMode(jsonOverride.mode, effectiveMode);
    }
  }

  const envName = sanitizeOptionalContactField(env.PROFILE_NAME);
  return {
    name: envName || effectiveName,
    role: hasDefinedEnvVar(env, 'PROFILE_ROLE')
      ? sanitizeOptionalContactField(env.PROFILE_ROLE)
      : effectiveRole,
    company: hasDefinedEnvVar(env, 'PROFILE_COMPANY')
      ? sanitizeOptionalContactField(env.PROFILE_COMPANY)
      : effectiveCompany,
    email: hasDefinedEnvVar(env, 'PROFILE_EMAIL')
      ? sanitizeOptionalContactField(env.PROFILE_EMAIL)
      : effectiveEmail,
    bookingUrl: hasDefinedEnvVar(env, 'PROFILE_BOOKING_URL')
      ? sanitizeOptionalContactField(env.PROFILE_BOOKING_URL)
      : effectiveBookingUrl,
    mode: normalizeProfileMode(env.PROFILE_MODE ?? effectiveMode, effectiveMode),
  };
}

export const DEFAULT_PROFILE: UserProfile = resolveProfileFromEnv(getSafeProcessEnv(), FILE_DEFAULT_PROFILE);

export type AvailabilityStatus =
  | 'AVAILABLE'
  | 'BUSY'
  | 'LUNCH'
  | 'OFF_HOURS'
  | 'HOLIDAY'
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
  todayAppointmentsCount?: number; // Busy appointments strictly on the current local day [00:00, 24:00)
  todayAllDayAppointmentsCount?: number; // Subset of todayAppointmentsCount lasting all day or full workday
  activeCalendarLabel?: string; // Label(s) of calendar(s) causing current BUSY state
}

export interface AnonymizedSlot {
  start: string; // ISO string
  end: string;   // ISO string
  label: string; // "Créneau réservé"
  calendarLabel?: string; // Optional merged label(s) e.g. "Pro" or "Pro • Perso"
  calendarLabels?: string[];
}

export interface CalendarSummaryItem {
  id: string;
  label: string;
  todayAppointmentsCount: number;
  todayAllDayAppointmentsCount: number;
  isBusyNow: boolean;
}

const FILE_DEFAULT_SCHEDULE: ScheduleConfig = scheduleJson as unknown as ScheduleConfig;

function normalizeTimeString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return parseClockToken(value) ?? fallback;
}

function parseClockToken(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  const match = trimmed.match(/^(\d{1,2})\s*(?::|h)\s*(\d{2})?$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = match[2] !== undefined ? Number(match[2]) : 0;
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseTimeRangeEnv(raw: string): { start: string; end: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(
    /^(\d{1,2}(?:\s*(?::|h)\s*\d{0,2})?)\s*(?:-|–|->|\/|to|à)\s*(\d{1,2}(?:\s*(?::|h)\s*\d{0,2})?)$/i
  );
  if (!match) return null;
  const start = parseClockToken(match[1]);
  const end = parseClockToken(match[2]);
  if (!start || !end) return null;
  return { start, end };
}

function parseEnvBoolean(raw: unknown): boolean | undefined {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw !== 'string') return undefined;
  const clean = raw.trim().toLowerCase();
  if (!clean) return undefined;
  if (/^(true|1|on|yes|oui|open|ouvert)$/i.test(clean)) return true;
  if (/^(false|0|off|no|non|repos|ferme|fermé|closed|none)$/i.test(clean)) return false;
  return undefined;
}

const DAY_ENV_SUFFIXES: Record<DayOfWeek, string[]> = {
  0: ['0', 'SUN', 'SUNDAY', 'DIM', 'DIMANCHE'],
  1: ['1', 'MON', 'MONDAY', 'LUN', 'LUNDI'],
  2: ['2', 'TUE', 'TUESDAY', 'MAR', 'MARDI'],
  3: ['3', 'WED', 'WEDNESDAY', 'MER', 'MERCREDI'],
  4: ['4', 'THU', 'THURSDAY', 'JEU', 'JEUDI'],
  5: ['5', 'FRI', 'FRIDAY', 'VEN', 'VENDREDI'],
  6: ['6', 'SAT', 'SATURDAY', 'SAM', 'SAMEDI'],
};

const DAY_TOKEN_TO_NUMBER: Record<string, DayOfWeek> = (() => {
  const map: Record<string, DayOfWeek> = {};
  (Object.keys(DAY_ENV_SUFFIXES) as unknown as DayOfWeek[]).forEach(dayNum => {
    const num = Number(dayNum) as DayOfWeek;
    for (const alias of DAY_ENV_SUFFIXES[num]) {
      map[alias.toLowerCase()] = num;
    }
  });
  return map;
})();

function getDayEnvValue(env: EnvRecord, prefixes: string[], day: DayOfWeek): string | undefined {
  const suffixes = DAY_ENV_SUFFIXES[day];
  for (const prefix of prefixes) {
    for (const suffix of suffixes) {
      const exactKey = `${prefix}_${suffix}`;
      if (hasDefinedEnvVar(env, exactKey) && env[exactKey]!.trim() !== '') {
        return env[exactKey]!.trim();
      }
      const lowerKey = `${prefix}_${suffix.toLowerCase()}`;
      if (hasDefinedEnvVar(env, lowerKey) && env[lowerKey]!.trim() !== '') {
        return env[lowerKey]!.trim();
      }
    }
  }
  return undefined;
}

function parseWorkDaysEnv(raw: string): Set<DayOfWeek> | null {
  const clean = raw.trim().toLowerCase();
  if (!clean) return null;
  if (/^(none|off|false|0|aucun)$/i.test(clean)) {
    return new Set<DayOfWeek>();
  }

  const normalized = clean.replace(/\s*-\s*/g, '-');
  const tokens = normalized.split(/[,;\s]+/).filter(Boolean);
  const result = new Set<DayOfWeek>();
  let matchedAny = false;

  for (const token of tokens) {
    if (token.includes('-')) {
      const [startTok, endTok] = token.split('-');
      const startDay = startTok ? DAY_TOKEN_TO_NUMBER[startTok] : undefined;
      const endDay = endTok ? DAY_TOKEN_TO_NUMBER[endTok] : undefined;
      if (startDay !== undefined && endDay !== undefined) {
        matchedAny = true;
        let cur = startDay;
        for (let step = 0; step < 7; step++) {
          result.add(cur);
          if (cur === endDay) break;
          cur = ((cur + 1) % 7) as DayOfWeek;
        }
      }
      continue;
    }

    const day = DAY_TOKEN_TO_NUMBER[token];
    if (day !== undefined) {
      matchedAny = true;
      result.add(day);
    }
  }

  return matchedAny ? result : null;
}

function parseClosuresEnv(raw: string): ClosurePeriod[] | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (/^(none|off|false|aucun|\[\])$/i.test(trimmed)) {
    return [];
  }

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .filter(
            (item): item is Record<string, unknown> =>
              isPlainRecord(item) && typeof item.startDate === 'string' && item.startDate.trim().length > 0
          )
          .map(item => ({
            startDate: String(item.startDate).trim(),
            ...(typeof item.endDate === 'string' && item.endDate.trim()
              ? { endDate: item.endDate.trim() }
              : {}),
            ...(typeof item.label === 'string' && item.label.trim()
              ? { label: item.label.trim() }
              : {}),
            ...(item.type === 'holiday' || item.type === 'vacation' ? { type: item.type } : {}),
            ...(typeof item.annual === 'boolean' ? { annual: item.annual } : {}),
          }));
      }
    } catch {
      return undefined;
    }
  }

  const entries = trimmed.split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
  const closures: ClosurePeriod[] = [];

  for (const entry of entries) {
    const parts = entry.split('|').map(p => p.trim());
    const datePart = parts[0] || '';
    const dateRangeMatch = datePart.match(
      /^(\d{4}-\d{2}-\d{2}|\d{2}-\d{2})(?:\s*(?:\.\.|:|to|->|\/)\s*(\d{4}-\d{2}-\d{2}|\d{2}-\d{2}))?$/i
    );
    if (!dateRangeMatch) continue;

    const startDate = dateRangeMatch[1];
    const endDate = dateRangeMatch[2];
    let label: string | undefined;
    let type: 'holiday' | 'vacation' | undefined;
    let annual: boolean | undefined = /^\d{2}-\d{2}$/.test(startDate) ? true : undefined;

    for (const extra of parts.slice(1)) {
      if (!extra) continue;
      if (/^(annual|annuel)$/i.test(extra)) {
        annual = true;
      } else if (/^(holiday|ferie|férié)$/i.test(extra)) {
        type = 'holiday';
      } else if (/^(vacation|conge|congé|conges|congés|leave)$/i.test(extra)) {
        type = 'vacation';
      } else if (!label) {
        label = extra;
      }
    }

    if (!type && label && /cong[ée]|vacanc|leave/i.test(label)) {
      type = 'vacation';
    }

    closures.push({
      startDate,
      ...(endDate ? { endDate } : {}),
      ...(label ? { label } : {}),
      ...(type ? { type } : {}),
      ...(annual !== undefined ? { annual } : {}),
    });
  }

  return closures.length > 0 ? closures : undefined;
}

function mergeScheduleJsonOverride(baseSchedule: ScheduleConfig, rawJson: string): ScheduleConfig {
  if (!rawJson) return baseSchedule;
  try {
    const parsed = JSON.parse(rawJson);
    if (!isPlainRecord(parsed)) return baseSchedule;

    const mergedDays = { ...baseSchedule.days };
    if (isPlainRecord(parsed.days)) {
      const dayKeys: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
      for (const dayKey of dayKeys) {
        const candidate = parsed.days[String(dayKey)];
        const fallbackDay = baseSchedule.days[dayKey] || { enabled: false, start: '09:00', end: '18:00' };
        if (isPlainRecord(candidate)) {
          mergedDays[dayKey] = {
            enabled:
              typeof candidate.enabled === 'boolean' ? candidate.enabled : Boolean(fallbackDay.enabled),
            start: normalizeTimeString(candidate.start, fallbackDay.start),
            end: normalizeTimeString(candidate.end, fallbackDay.end),
          };
        }
      }
    }

    const baseLunch = baseSchedule.lunchBreak;
    const rawLunch = isPlainRecord(parsed.lunchBreak) ? parsed.lunchBreak : undefined;
    const mergedLunchDays: Partial<Record<DayOfWeek, DayLunchOverride>> | undefined =
      baseLunch.days || (rawLunch && isPlainRecord(rawLunch.days))
        ? { ...(baseLunch.days || {}) }
        : undefined;
    if (mergedLunchDays && rawLunch && isPlainRecord(rawLunch.days)) {
      const dayKeys: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
      for (const dayKey of dayKeys) {
        const dayCandidate = rawLunch.days[String(dayKey)];
        if (isPlainRecord(dayCandidate)) {
          mergedLunchDays[dayKey] = {
            ...(typeof dayCandidate.enabled === 'boolean' ? { enabled: dayCandidate.enabled } : {}),
            ...(typeof dayCandidate.start === 'string' ? { start: dayCandidate.start.trim() } : {}),
            ...(typeof dayCandidate.end === 'string' ? { end: dayCandidate.end.trim() } : {}),
            ...(typeof dayCandidate.label === 'string' ? { label: dayCandidate.label.trim() } : {}),
          };
        }
      }
    }

    const mergedClosures: ClosurePeriod[] | undefined = Array.isArray(parsed.closures)
      ? parsed.closures
          .filter(
            (item): item is Record<string, unknown> =>
              isPlainRecord(item) && typeof item.startDate === 'string' && item.startDate.trim().length > 0
          )
          .map(item => ({
            startDate: String(item.startDate).trim(),
            ...(typeof item.endDate === 'string' && item.endDate.trim()
              ? { endDate: item.endDate.trim() }
              : {}),
            ...(typeof item.label === 'string' && item.label.trim()
              ? { label: item.label.trim() }
              : {}),
            ...(item.type === 'holiday' || item.type === 'vacation' ? { type: item.type } : {}),
            ...(typeof item.annual === 'boolean' ? { annual: item.annual } : {}),
          }))
      : baseSchedule.closures;

    return {
      timezone:
        typeof parsed.timezone === 'string' && parsed.timezone.trim()
          ? parsed.timezone.trim()
          : baseSchedule.timezone,
      days: mergedDays,
      lunchBreak: {
        enabled:
          rawLunch && typeof rawLunch.enabled === 'boolean'
            ? rawLunch.enabled
            : Boolean(baseLunch.enabled),
        start: rawLunch ? normalizeTimeString(rawLunch.start, baseLunch.start) : baseLunch.start,
        end: rawLunch ? normalizeTimeString(rawLunch.end, baseLunch.end) : baseLunch.end,
        label:
          rawLunch && typeof rawLunch.label === 'string' && rawLunch.label.trim()
            ? rawLunch.label.trim()
            : baseLunch.label,
        ...(mergedLunchDays ? { days: mergedLunchDays } : {}),
      },
      bufferMinutes:
        typeof parsed.bufferMinutes === 'number' && Number.isFinite(parsed.bufferMinutes) && parsed.bufferMinutes >= 0
          ? Math.round(parsed.bufferMinutes)
          : baseSchedule.bufferMinutes,
      ...(mergedClosures ? { closures: mergedClosures } : {}),
    };
  } catch {
    return baseSchedule;
  }
}

/**
 * Resolves working schedule from environment variables with full feature parity:
 * Priority: config/schedule.json < SCHEDULE_JSON(_BASE64) < individual SCHEDULE_* env vars.
 * Supported individual env vars:
 * - TIMEZONE / SCHEDULE_TIMEZONE
 * - SCHEDULE_WORK_DAYS (or SCHEDULE_DAYS): e.g. "mon-fri", "mar,mer,jeu,ven", "1,2,3,4,5"
 * - SCHEDULE_HOURS ("08:30-17:30"), SCHEDULE_START, SCHEDULE_END
 * - Per-day suffixed overrides (_MON/_LUN/_1 ... _SUN/_DIM/_0):
 *   SCHEDULE_HOURS_<DAY> ("09:00-13:00" or "off"), SCHEDULE_START_<DAY>, SCHEDULE_END_<DAY>, SCHEDULE_DAY_<DAY>
 * - Lunch break: SCHEDULE_LUNCH_HOURS, SCHEDULE_LUNCH_START, SCHEDULE_LUNCH_END, SCHEDULE_LUNCH_LABEL, SCHEDULE_LUNCH_ENABLED
 *   plus per-day suffix: SCHEDULE_LUNCH_HOURS_<DAY>, SCHEDULE_LUNCH_START_<DAY>, SCHEDULE_LUNCH_END_<DAY>, SCHEDULE_LUNCH_LABEL_<DAY>, SCHEDULE_LUNCH_ENABLED_<DAY>
 * - SCHEDULE_BUFFER_MINUTES, SCHEDULE_CLOSURES
 */
export function resolveScheduleFromEnv(
  env: EnvRecord | undefined = getSafeProcessEnv(),
  baseSchedule: ScheduleConfig = FILE_DEFAULT_SCHEDULE
): ScheduleConfig {
  if (!env) return baseSchedule;

  const rawJson =
    (env.SCHEDULE_JSON && env.SCHEDULE_JSON.trim()) ||
    (env.SCHEDULE_JSON_BASE64 && decodeBase64Utf8(env.SCHEDULE_JSON_BASE64.trim())) ||
    '';

  const afterJson = mergeScheduleJsonOverride(baseSchedule, rawJson);
  const days: Record<DayOfWeek, DaySchedule> = {
    0: { ...afterJson.days[0] },
    1: { ...afterJson.days[1] },
    2: { ...afterJson.days[2] },
    3: { ...afterJson.days[3] },
    4: { ...afterJson.days[4] },
    5: { ...afterJson.days[5] },
    6: { ...afterJson.days[6] },
  };
  const allDayKeys: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

  // 1. Global working hours (applied across all days before work-days & per-day overrides)
  const globalRange = env.SCHEDULE_HOURS ? parseTimeRangeEnv(env.SCHEDULE_HOURS) : null;
  const globalStart = env.SCHEDULE_START ? parseClockToken(env.SCHEDULE_START) : null;
  const globalEnd = env.SCHEDULE_END ? parseClockToken(env.SCHEDULE_END) : null;
  if (globalRange || globalStart || globalEnd) {
    for (const day of allDayKeys) {
      if (globalRange) {
        days[day].start = globalRange.start;
        days[day].end = globalRange.end;
      }
      if (globalStart) days[day].start = globalStart;
      if (globalEnd) days[day].end = globalEnd;
    }
  }

  // 2. Enabled working days list
  const rawWorkDays = env.SCHEDULE_WORK_DAYS ?? env.SCHEDULE_DAYS;
  if (rawWorkDays && rawWorkDays.trim()) {
    const enabledSet = parseWorkDaysEnv(rawWorkDays);
    if (enabledSet !== null) {
      for (const day of allDayKeys) {
        days[day].enabled = enabledSet.has(day);
      }
    }
  }

  // 3. Per-day suffixed overrides (_MON, _LUN, _1, ...)
  for (const day of allDayKeys) {
    const dayHoursRaw = getDayEnvValue(env, ['SCHEDULE_HOURS'], day);
    const dayStartRaw = getDayEnvValue(env, ['SCHEDULE_START'], day);
    const dayEndRaw = getDayEnvValue(env, ['SCHEDULE_END'], day);
    const dayEnabledRaw = getDayEnvValue(env, ['SCHEDULE_DAY', 'SCHEDULE_ENABLED'], day);

    if (dayHoursRaw !== undefined) {
      const boolOff = parseEnvBoolean(dayHoursRaw);
      if (boolOff === false) {
        days[day].enabled = false;
      } else {
        const range = parseTimeRangeEnv(dayHoursRaw);
        if (range) {
          days[day].start = range.start;
          days[day].end = range.end;
          days[day].enabled = true;
        }
      }
    }
    if (dayStartRaw !== undefined) {
      const parsedStart = parseClockToken(dayStartRaw);
      if (parsedStart) days[day].start = parsedStart;
    }
    if (dayEndRaw !== undefined) {
      const parsedEnd = parseClockToken(dayEndRaw);
      if (parsedEnd) days[day].end = parsedEnd;
    }
    if (dayEnabledRaw !== undefined) {
      const parsedBool = parseEnvBoolean(dayEnabledRaw);
      if (parsedBool !== undefined) days[day].enabled = parsedBool;
    }
  }

  // 4. Global lunch break + per-day suffixed lunch break overrides
  const lunchDays: Partial<Record<DayOfWeek, DayLunchOverride>> = afterJson.lunchBreak.days
    ? { ...afterJson.lunchBreak.days }
    : {};
  let lunchEnabled = Boolean(afterJson.lunchBreak.enabled);
  let lunchStart = afterJson.lunchBreak.start;
  let lunchEnd = afterJson.lunchBreak.end;
  let lunchLabel = afterJson.lunchBreak.label;

  if (env.SCHEDULE_LUNCH_HOURS && env.SCHEDULE_LUNCH_HOURS.trim()) {
    const lunchBool = parseEnvBoolean(env.SCHEDULE_LUNCH_HOURS);
    if (lunchBool === false) {
      lunchEnabled = false;
    } else {
      const lunchRange = parseTimeRangeEnv(env.SCHEDULE_LUNCH_HOURS);
      if (lunchRange) {
        lunchStart = lunchRange.start;
        lunchEnd = lunchRange.end;
        lunchEnabled = true;
      }
    }
  }
  if (env.SCHEDULE_LUNCH_START) {
    const s = parseClockToken(env.SCHEDULE_LUNCH_START);
    if (s) lunchStart = s;
  }
  if (env.SCHEDULE_LUNCH_END) {
    const e = parseClockToken(env.SCHEDULE_LUNCH_END);
    if (e) lunchEnd = e;
  }
  if (env.SCHEDULE_LUNCH_LABEL && env.SCHEDULE_LUNCH_LABEL.trim()) {
    lunchLabel = env.SCHEDULE_LUNCH_LABEL.trim();
  }
  if (env.SCHEDULE_LUNCH_ENABLED !== undefined) {
    const parsedLunchEnabled = parseEnvBoolean(env.SCHEDULE_LUNCH_ENABLED);
    if (parsedLunchEnabled !== undefined) lunchEnabled = parsedLunchEnabled;
  }

  for (const day of allDayKeys) {
    const dayLunchHoursRaw = getDayEnvValue(env, ['SCHEDULE_LUNCH_HOURS'], day);
    const dayLunchStartRaw = getDayEnvValue(env, ['SCHEDULE_LUNCH_START'], day);
    const dayLunchEndRaw = getDayEnvValue(env, ['SCHEDULE_LUNCH_END'], day);
    const dayLunchLabelRaw = getDayEnvValue(env, ['SCHEDULE_LUNCH_LABEL'], day);
    const dayLunchEnabledRaw = getDayEnvValue(env, ['SCHEDULE_LUNCH_ENABLED', 'SCHEDULE_LUNCH'], day);

    if (
      dayLunchHoursRaw !== undefined ||
      dayLunchStartRaw !== undefined ||
      dayLunchEndRaw !== undefined ||
      dayLunchLabelRaw !== undefined ||
      dayLunchEnabledRaw !== undefined
    ) {
      const existing: DayLunchOverride = { ...(lunchDays[day] || {}) };

      if (dayLunchHoursRaw !== undefined) {
        const boolOff = parseEnvBoolean(dayLunchHoursRaw);
        if (boolOff === false) {
          existing.enabled = false;
        } else {
          const range = parseTimeRangeEnv(dayLunchHoursRaw);
          if (range) {
            existing.start = range.start;
            existing.end = range.end;
            existing.enabled = true;
          }
        }
      }
      if (dayLunchStartRaw !== undefined) {
        const s = parseClockToken(dayLunchStartRaw);
        if (s) existing.start = s;
      }
      if (dayLunchEndRaw !== undefined) {
        const e = parseClockToken(dayLunchEndRaw);
        if (e) existing.end = e;
      }
      if (dayLunchLabelRaw !== undefined && dayLunchLabelRaw.trim()) {
        existing.label = dayLunchLabelRaw.trim();
      }
      if (dayLunchEnabledRaw !== undefined) {
        const b = parseEnvBoolean(dayLunchEnabledRaw);
        if (b !== undefined) existing.enabled = b;
      }

      lunchDays[day] = existing;
    }
  }

  // 5. Timezone, buffer, and closures
  const envTimezone =
    sanitizeOptionalContactField(env.SCHEDULE_TIMEZONE) ||
    sanitizeOptionalContactField(env.TIMEZONE);
  const timezone = envTimezone || afterJson.timezone;

  let bufferMinutes = afterJson.bufferMinutes;
  if (env.SCHEDULE_BUFFER_MINUTES !== undefined && env.SCHEDULE_BUFFER_MINUTES.trim() !== '') {
    const parsedBuf = Number(env.SCHEDULE_BUFFER_MINUTES.trim());
    if (Number.isFinite(parsedBuf) && parsedBuf >= 0) {
      bufferMinutes = Math.round(parsedBuf);
    }
  }

  const envClosures =
    env.SCHEDULE_CLOSURES !== undefined ? parseClosuresEnv(env.SCHEDULE_CLOSURES) : undefined;
  const closures = envClosures !== undefined ? envClosures : afterJson.closures;

  return {
    timezone,
    days,
    lunchBreak: {
      enabled: lunchEnabled,
      start: lunchStart,
      end: lunchEnd,
      label: lunchLabel,
      ...(Object.keys(lunchDays).length > 0 ? { days: lunchDays } : {}),
    },
    bufferMinutes,
    ...(closures !== undefined ? { closures } : {}),
  };
}

export function resolveEffectiveTimezone(
  env: EnvRecord | undefined = getSafeProcessEnv(),
  schedule: ScheduleConfig = DEFAULT_SCHEDULE
): string {
  const envTz =
    sanitizeOptionalContactField(env?.SCHEDULE_TIMEZONE) ||
    sanitizeOptionalContactField(env?.TIMEZONE);
  return envTz || schedule.timezone || 'Europe/Paris';
}

export const DEFAULT_SCHEDULE: ScheduleConfig = resolveScheduleFromEnv(
  getSafeProcessEnv(),
  FILE_DEFAULT_SCHEDULE
);

function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatMinutesToTime(minutes: number, lang: AppLang = 'fr'): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const sep = lang === 'en' ? ':' : 'h';
  return `${h.toString().padStart(2, '0')}${sep}${m > 0 ? m.toString().padStart(2, '0') : '00'}`;
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
  dayOfWeek: DayOfWeek,
  lang: AppLang = 'fr'
): EffectiveLunchBreak {
  const globalBreak = schedule.lunchBreak;
  const rawGlobalLabel = globalBreak.label?.trim() || 'Pause déjeuner';
  const defaultLabel =
    lang === 'en' && rawGlobalLabel.toLowerCase() === 'pause déjeuner' ? 'Lunch break' : rawGlobalLabel;
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
  const customLabelRaw = dayOverride.label?.trim();
  const customLabel =
    customLabelRaw && lang === 'en' && customLabelRaw.toLowerCase() === 'pause déjeuner'
      ? 'Lunch break'
      : customLabelRaw;
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

export function formatTimeShort(
  date: Date,
  timeZone: string = 'Europe/Paris',
  lang: AppLang = 'fr'
): string {
  const sep = lang === 'en' ? ':' : 'h';
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
    if (hour && minute) return `${hour}${sep}${minute}`;
  } catch {}
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}${sep}${m}`;
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
 * Checks whether a local calendar date ("YYYY-MM-DD") falls inside a configured
 * closure or holiday period in `schedule.closures`.
 */
export function getClosureForDate(
  dateStr: string,
  schedule: ScheduleConfig
): ClosurePeriod | null {
  const closures = schedule.closures;
  if (!Array.isArray(closures) || closures.length === 0) return null;
  const mmdd = dateStr.slice(5, 10);

  for (const closure of closures) {
    if (!closure || typeof closure.startDate !== 'string') continue;
    const rawStart = closure.startDate.trim();
    if (!rawStart) continue;
    const rawEnd = (closure.endDate || rawStart).trim();

    if (closure.annual || /^\d{2}-\d{2}$/.test(rawStart)) {
      const startMd = /^\d{4}-\d{2}-\d{2}$/.test(rawStart) ? rawStart.slice(5, 10) : rawStart;
      const endMd = /^\d{4}-\d{2}-\d{2}$/.test(rawEnd) ? rawEnd.slice(5, 10) : rawEnd;
      if (startMd <= endMd) {
        if (mmdd >= startMd && mmdd <= endMd) return closure;
      } else {
        // Year wrap-around (e.g. 12-24 to 01-03)
        if (mmdd >= startMd || mmdd <= endMd) return closure;
      }
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(rawStart)) {
      const endFull = /^\d{4}-\d{2}-\d{2}$/.test(rawEnd) && rawEnd >= rawStart ? rawEnd : rawStart;
      if (dateStr >= rawStart && dateStr <= endFull) {
        return closure;
      }
    }
  }
  return null;
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
const DAY_NAMES_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface TodayAppointmentsStats {
  total: number;
  allDayCount: number;
}

/**
 * Counts busy calendar appointments scheduled on the same local calendar day as `now`
 * (from 00:00 local midnight to 00:00 the next day), and how many last all day or cover
 * at least the configured workday hours.
 */
export function getTodayAppointmentsStats(
  now: Date,
  events: CalendarEvent[],
  schedule: ScheduleConfig = DEFAULT_SCHEDULE,
  timeZone: string = schedule.timezone || 'Europe/Paris',
  preNormalizedEvents?: CalendarEvent[]
): TodayAppointmentsStats {
  const zoned = getZonedDateParts(now, timeZone);
  const todayDateStr = `${zoned.year}-${String(zoned.month).padStart(2, '0')}-${String(zoned.day).padStart(2, '0')}`;
  const tomorrowDateStr = addDaysToDateStr(todayDateStr, 1);

  const dayStartMs = createDateInTimezone(todayDateStr, '00:00', timeZone).getTime();
  const dayEndMs = createDateInTimezone(tomorrowDateStr, '00:00', timeZone).getTime();

  const daySchedule = schedule.days[zoned.dayOfWeek];
  const workStartStr = daySchedule?.start?.trim() || '09:00';
  const workEndStr = daySchedule?.end?.trim() || '18:00';
  const workStartMs = createDateInTimezone(todayDateStr, workStartStr, timeZone).getTime();
  const workEndMs = createDateInTimezone(todayDateStr, workEndStr, timeZone).getTime();

  const normalized = preNormalizedEvents ?? normalizeEventsForSchedule(events, schedule, timeZone);

  let total = 0;
  let allDayCount = 0;
  for (const evt of normalized) {
    if (evt.isBusy === false) continue;
    const startMs = new Date(evt.start).getTime();
    const endMs = new Date(evt.end).getTime();
    if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) continue;
    if (endMs > dayStartMs && startMs < dayEndMs) {
      total++;
      const coversFullWorkday =
        workEndMs > workStartMs
          ? startMs <= workStartMs && endMs >= workEndMs
          : startMs <= dayStartMs && endMs >= dayEndMs;
      if (evt.isAllDay || coversFullWorkday) {
        allDayCount++;
      }
    }
  }
  return { total, allDayCount };
}

/**
 * Counts busy calendar appointments scheduled on the same local calendar day as `now`
 * (from 00:00 local midnight to 00:00 the next day), excluding previous and future days.
 */
export function getTodayAppointmentsCount(
  now: Date,
  events: CalendarEvent[],
  schedule: ScheduleConfig = DEFAULT_SCHEDULE,
  timeZone: string = schedule.timezone || 'Europe/Paris',
  preNormalizedEvents?: CalendarEvent[]
): number {
  return getTodayAppointmentsStats(now, events, schedule, timeZone, preNormalizedEvents).total;
}

/**
 * Finds the next truly available working moment from a given reference date,
 * skipping disabled days, lunch breaks, and scheduled busy calendar events.
 */
export function getNextWorkStart(
  now: Date,
  schedule: ScheduleConfig,
  timeZone: string = schedule.timezone || 'Europe/Paris',
  events: CalendarEvent[] = [],
  preNormalizedSortedEvents?: Array<CalendarEvent & { startDate: Date; endDate: Date }>,
  lang: AppLang = 'fr'
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
    if (getClosureForDate(dateStr, schedule)) {
      continue;
    }
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
      const timeStr = formatTimeShort(foundDate, timeZone, lang);
      const dayLabel = (lang === 'en' ? DAY_NAMES_EN : DAY_NAMES_FR)[dayOfWeek];

      let text: string;
      if (lang === 'en') {
        if (offset === 0) {
          text = `Today at ${timeStr}`;
        } else if (offset <= 6) {
          text = `${dayLabel} at ${timeStr}`;
        } else {
          const fp = getZonedDateParts(foundDate, timeZone);
          text = `${dayLabel} ${String(fp.month).padStart(2, '0')}/${String(fp.day).padStart(2, '0')} at ${timeStr}`;
        }
      } else {
        if (offset === 0) {
          text = `Aujourd'hui à ${timeStr}`;
        } else if (offset <= 6) {
          text = `${dayLabel} à ${timeStr}`;
        } else {
          const fp = getZonedDateParts(foundDate, timeZone);
          text = `${dayLabel} ${String(fp.day).padStart(2, '0')}/${String(fp.month).padStart(2, '0')} à ${timeStr}`;
        }
      }

      return { date: foundDate, text };
    }
  }

  return { date: now, text: lang === 'en' ? 'Soon' : 'Bientôt' };
}


/**
 * Calculates availability for a given timestamp based on schedule, events and overrides.
 */
export function calculateAvailability(
  now: Date,
  schedule: ScheduleConfig,
  events: CalendarEvent[],
  override?: ManualOverride | null,
  timezoneOverride?: string,
  lang: AppLang = 'fr',
  mode: ProfileMode = 'person'
): AvailabilityResult {
  const isEn = normalizeAppLang(lang, 'fr') === 'en';
  const resolvedLang: AppLang = isEn ? 'en' : 'fr';
  const resolvedMode: ProfileMode = normalizeProfileMode(mode, 'person');
  const availableTitle = getAvailableLabel(resolvedMode, resolvedLang);
  const offHoursTitle =
    resolvedMode === 'shop'
      ? isEn
        ? 'Closed'
        : 'Fermé'
      : isEn
      ? 'Outside working hours'
      : 'Hors horaires de travail';
  const timeZone = timezoneOverride || schedule.timezone || 'Europe/Paris';
  const zoned = getZonedDateParts(now, timeZone);
  const normalizedEvents = normalizeEventsForSchedule(events, schedule, timeZone);
  const todayStats = getTodayAppointmentsStats(
    now,
    events,
    schedule,
    timeZone,
    normalizedEvents
  );
  const todayAppointmentsCount = todayStats.total;
  const todayAllDayAppointmentsCount = todayStats.allDayCount;

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
            title: override.note || (isEn ? 'Busy' : 'Occupé'),
            subtitle: override.expiresAt
              ? `${isEn ? 'Until' : "Jusqu'à"} ${formatTimeShort(new Date(override.expiresAt), timeZone, resolvedLang)}`
              : isEn
              ? 'Manually set'
              : 'Forcé manuellement',
            isWorkTime: true,
            todayAppointmentsCount,
            todayAllDayAppointmentsCount,
          };
        case 'available':
          return {
            status: 'OVERRIDE_AVAILABLE',
            state: 'available',
            badgeColor: '#10B981',
            dotColor: '#059669',
            title: override.note || availableTitle,
            subtitle: override.expiresAt
              ? `${isEn ? 'Until' : "Jusqu'à"} ${formatTimeShort(new Date(override.expiresAt), timeZone, resolvedLang)}`
              : resolvedMode === 'shop'
              ? isEn
                ? 'Open override'
                : 'Mode ouvert forcé'
              : isEn
              ? 'Available override'
              : 'Mode disponible forcé',
            isWorkTime: true,
            todayAppointmentsCount,
            todayAllDayAppointmentsCount,
          };
        case 'break':
          return {
            status: 'OVERRIDE_BREAK',
            state: 'away',
            badgeColor: '#F59E0B',
            dotColor: '#D97706',
            title: override.note || (isEn ? 'On break' : 'En pause'),
            subtitle: override.expiresAt
              ? `${isEn ? 'Back at' : 'Reprise à'} ${formatTimeShort(new Date(override.expiresAt), timeZone, resolvedLang)}`
              : isEn
              ? 'Temporary break'
              : 'Pause temporaire',
            isWorkTime: true,
            todayAppointmentsCount,
            todayAllDayAppointmentsCount,
          };
        case 'dnd':
          return {
            status: 'OVERRIDE_DND',
            state: 'busy',
            badgeColor: '#8B5CF6',
            dotColor: '#7C3AED',
            title: override.note || (isEn ? 'Do not disturb' : 'Ne pas déranger'),
            subtitle: override.expiresAt
              ? `${isEn ? 'Until' : "Jusqu'à"} ${formatTimeShort(new Date(override.expiresAt), timeZone, resolvedLang)}`
              : isEn
              ? 'Focus mode'
              : 'Mode focus',
            isWorkTime: true,
            todayAppointmentsCount,
            todayAllDayAppointmentsCount,
          };
      }
    }
  }

  // 1. Check active meetings FIRST (including meetings outside normal working hours/days)
  // All-day events are normalized to working hours of enabled work days.
  const bufferMs = (schedule.bufferMinutes || 0) * 60 * 1000;
  const nowMs = now.getTime();

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
    // Collect all currently active busy events (in case multiple calendars overlap at `now`)
    const activeEvents = sortedEvents.filter(e => {
      const bufferedStart = e.startDate.getTime() - bufferMs;
      const bufferedEnd = e.endDate.getTime() + bufferMs;
      return nowMs >= bufferedStart && nowMs < bufferedEnd;
    });
    const activeLabels = Array.from(
      new Set(
        activeEvents
          .map(e => e.calendarLabel?.trim())
          .filter((lbl): lbl is string => Boolean(lbl))
      )
    );
    const activeCalendarLabel = activeLabels.length > 0 ? activeLabels.join(' • ') : undefined;
    const compactMultiLabel =
      activeLabels.length > 2
        ? `${activeLabels.slice(0, 2).join(' • ')} +${activeLabels.length - 2}`
        : activeCalendarLabel;
    const displayLabelForTitle =
      compactMultiLabel && compactMultiLabel.length > 24
        ? `${compactMultiLabel.slice(0, 23).trimEnd()}…`
        : compactMultiLabel;
    const busyBaseTitle = isEn ? 'In a meeting / Busy' : 'En réunion / Occupé';
    const busyTitle = displayLabelForTitle
      ? `${busyBaseTitle} (${displayLabelForTitle})`
      : busyBaseTitle;

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
      const nextStart = getNextWorkStart(freeTime, schedule, timeZone, [], sortedEvents, resolvedLang);
      return {
        status: 'BUSY',
        state: 'busy',
        badgeColor: '#EF4444',
        dotColor: '#DC2626',
        title: busyTitle,
        subtitle: `${isEn ? 'Back' : 'Reprise'} ${nextStart.text}`,
        isWorkTime: true,
        nextFreeTime: nextStart.text,
        nextChangeDate: nextStart.date,
        todayAppointmentsCount,
        todayAllDayAppointmentsCount,
        ...(activeCalendarLabel ? { activeCalendarLabel } : {}),
      };
    }

    const freeTimeStr = formatTimeShort(freeTime, timeZone, resolvedLang);
    return {
      status: 'BUSY',
      state: 'busy',
      badgeColor: '#EF4444',
      dotColor: '#DC2626',
      title: busyTitle,
      subtitle: `${isEn ? 'Free at' : 'Libre à'} ${freeTimeStr}`,
      isWorkTime: true,
      nextFreeTime: freeTimeStr,
      nextChangeDate: freeTime,
      todayAppointmentsCount,
      todayAllDayAppointmentsCount,
      ...(activeCalendarLabel ? { activeCalendarLabel } : {}),
    };
  }

  const currentDay = zoned.dayOfWeek;
  const currentMinutes = zoned.hour * 60 + zoned.minute;
  const todayDateStr = `${zoned.year}-${String(zoned.month).padStart(2, '0')}-${String(zoned.day).padStart(2, '0')}`;

  // 1b. Check configured closures / public holidays (events above still take priority if scheduled)
  const activeClosure = getClosureForDate(todayDateStr, schedule);
  if (activeClosure) {
    const nextStart = getNextWorkStart(now, schedule, timeZone, [], sortedEvents, resolvedLang);
    const defaultClosureTitle =
      activeClosure.type === 'holiday'
        ? isEn
          ? 'Public holiday'
          : 'Jour férié'
        : isEn
        ? 'On leave'
        : 'En congés';
    return {
      status: 'HOLIDAY',
      state: 'off',
      badgeColor: '#64748B',
      dotColor: '#475569',
      title: activeClosure.label?.trim() || defaultClosureTitle,
      subtitle: `${isEn ? 'Back' : 'Reprise'} ${nextStart.text}`,
      isWorkTime: false,
      nextFreeTime: nextStart.text,
      nextChangeDate: nextStart.date,
      todayAppointmentsCount,
      todayAllDayAppointmentsCount,
    };
  }

  const daySchedule = schedule.days[currentDay];

  // 2. Check if today is a working day (e.g. weekend or day off)
  if (!daySchedule || !daySchedule.enabled) {
    const nextStart = getNextWorkStart(now, schedule, timeZone, [], sortedEvents, resolvedLang);
    return {
      status: 'OFF_HOURS',
      state: 'off',
      badgeColor: '#64748B',
      dotColor: '#475569',
      title: offHoursTitle,
      subtitle: `${isEn ? 'Back' : 'Reprise'} ${nextStart.text}`,
      isWorkTime: false,
      nextFreeTime: nextStart.text,
      nextChangeDate: nextStart.date,
      todayAppointmentsCount,
      todayAllDayAppointmentsCount,
    };
  }

  const startMin = parseTimeToMinutes(daySchedule.start);
  const endMin = parseTimeToMinutes(daySchedule.end);

  // 3. Check if before or after work hours
  if (currentMinutes < startMin || currentMinutes >= endMin) {
    const nextStart = getNextWorkStart(now, schedule, timeZone, [], sortedEvents, resolvedLang);
    return {
      status: 'OFF_HOURS',
      state: 'off',
      badgeColor: '#64748B',
      dotColor: '#475569',
      title: offHoursTitle,
      subtitle: `${isEn ? 'Back' : 'Reprise'} ${nextStart.text}`,
      isWorkTime: false,
      nextFreeTime: nextStart.text,
      nextChangeDate: nextStart.date,
      todayAppointmentsCount,
      todayAllDayAppointmentsCount,
    };
  }

  // 4. Check lunch break (day-specific override takes priority over global lunchBreak)
  const effectiveLunch = getEffectiveLunchBreak(schedule, currentDay, resolvedLang);
  if (effectiveLunch.enabled) {
    const lunchStart = parseTimeToMinutes(effectiveLunch.start);
    const lunchEnd = parseTimeToMinutes(effectiveLunch.end);
    if (currentMinutes >= lunchStart && currentMinutes < lunchEnd) {
      const lunchEndDate = new Date(now);
      const lunchTitle =
        isEn && effectiveLunch.label.toLowerCase() === 'pause déjeuner' ? 'Lunch break' : effectiveLunch.label;
      return {
        status: 'LUNCH',
        state: 'away',
        badgeColor: '#F59E0B',
        dotColor: '#D97706',
        title: lunchTitle,
        subtitle: `${isEn ? 'Back at' : 'Reprise à'} ${formatMinutesToTime(lunchEnd, resolvedLang)}`,
        isWorkTime: false,
        nextFreeTime: formatMinutesToTime(lunchEnd, resolvedLang),
        nextChangeDate: lunchEndDate,
        todayAppointmentsCount,
        todayAllDayAppointmentsCount,
      };
    }
  }

  // 5. Currently AVAILABLE! Find when next busy event or end of day occurs
  const nextEvent = sortedEvents.find(e => e.startDate.getTime() > nowMs);
  let availableUntilText = `${isEn ? 'Until' : "Jusqu'à"} ${formatMinutesToTime(endMin, resolvedLang)}`;
  let nextChangeDate: Date | undefined;

  // Next change could be lunch break if before lunch
  if (effectiveLunch.enabled) {
    const lunchStart = parseTimeToMinutes(effectiveLunch.start);
    if (currentMinutes < lunchStart) {
      availableUntilText = isEn
        ? `Until ${formatMinutesToTime(lunchStart, resolvedLang)} (break)`
        : `Jusqu'à ${formatMinutesToTime(lunchStart, resolvedLang)} (pause)`;
      const lunchDate = new Date(now);
      nextChangeDate = lunchDate;
    }
  }

  // Or next event if earlier
  if (nextEvent) {
    const nextEventZoned = getZonedDateParts(nextEvent.startDate, timeZone);
    const eventMinutes = nextEventZoned.hour * 60 + nextEventZoned.minute;
    const eventTimeStr = formatTimeShort(nextEvent.startDate, timeZone, resolvedLang);

    // Is it today in the user's timezone?
    const isToday =
      nextEventZoned.year === zoned.year &&
      nextEventZoned.month === zoned.month &&
      nextEventZoned.day === zoned.day;
    if (isToday) {
      const lunchStart = effectiveLunch.enabled ? parseTimeToMinutes(effectiveLunch.start) : 9999;
      const lunchEnd = effectiveLunch.enabled ? parseTimeToMinutes(effectiveLunch.end) : -1;
      if (eventMinutes < endMin && (eventMinutes < lunchStart || currentMinutes >= lunchEnd)) {
        availableUntilText = `${isEn ? 'Until' : "Jusqu'à"} ${eventTimeStr}`;
        nextChangeDate = nextEvent.startDate;
      }
    }
  }

  return {
    status: 'AVAILABLE',
    state: 'available',
    badgeColor: '#10B981',
    dotColor: '#059669',
    title: availableTitle,
    subtitle: availableUntilText,
    isWorkTime: true,
    nextFreeTime: isEn ? 'Now' : 'Maintenant',
    nextChangeDate,
    todayAppointmentsCount,
    todayAllDayAppointmentsCount,
  };
}

/**
 * Returns a privacy-safe, anonymized list of upcoming busy slots.
 * Strips all personal details (titles, descriptions, locations, participants)
 * and merges contiguous or overlapping meetings while preserving optional calendar labels.
 */
export function getAnonymizedUpcomingSlots(
  events: CalendarEvent[],
  fromDate: Date = new Date(),
  maxSlots = 8,
  schedule: ScheduleConfig = DEFAULT_SCHEDULE,
  timeZone: string = schedule.timezone || 'Europe/Paris',
  lang: AppLang = 'fr'
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
      const calendarLabel = evt.calendarLabel?.trim() || undefined;
      return { startMs, endMs, calendarLabel };
    })
    .sort((a, b) => a.startMs - b.startMs);

  if (validEvents.length === 0) return [];

  const merged: { startMs: number; endMs: number; calendarLabels: string[] }[] = [];
  for (const slot of validEvents) {
    const last = merged[merged.length - 1];
    if (last && slot.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, slot.endMs);
      if (slot.calendarLabel && !last.calendarLabels.includes(slot.calendarLabel)) {
        last.calendarLabels.push(slot.calendarLabel);
      }
    } else {
      merged.push({
        startMs: slot.startMs,
        endMs: slot.endMs,
        calendarLabels: slot.calendarLabel ? [slot.calendarLabel] : [],
      });
    }
  }

  const slotLabel = lang === 'en' ? 'Reserved slot' : 'Créneau réservé';

  return merged.slice(0, maxSlots).map(slot => ({
    start: new Date(slot.startMs).toISOString(),
    end: new Date(slot.endMs).toISOString(),
    label: slotLabel,
    ...(slot.calendarLabels.length > 0
      ? {
          calendarLabel: slot.calendarLabels.join(' • '),
          calendarLabels: slot.calendarLabels,
        }
      : {}),
  }));
}

/**
 * Computes per-calendar anonymized summary (today's appointment counts & busy status).
 */
export function getCalendarSummaries(
  now: Date,
  events: CalendarEvent[],
  schedule: ScheduleConfig = DEFAULT_SCHEDULE,
  timeZone: string = schedule.timezone || 'Europe/Paris',
  knownCalendars?: Array<{ id: string; label: string }>
): CalendarSummaryItem[] {
  const normalized = normalizeEventsForSchedule(events, schedule, timeZone);
  const bufferMs = (schedule.bufferMinutes || 0) * 60 * 1000;
  const nowMs = now.getTime();

  const buckets = new Map<string, { id: string; label: string; events: CalendarEvent[] }>();

  if (knownCalendars) {
    for (const cal of knownCalendars) {
      buckets.set(cal.id, { id: cal.id, label: cal.label, events: [] });
    }
  }

  for (const evt of normalized) {
    const id = evt.calendarId || 'default';
    const label = evt.calendarLabel?.trim() || 'Principal';
    let bucket = buckets.get(id);
    if (!bucket) {
      bucket = { id, label, events: [] };
      buckets.set(id, bucket);
    }
    bucket.events.push(evt);
  }

  const summaries: CalendarSummaryItem[] = [];
  for (const bucket of buckets.values()) {
    const stats = getTodayAppointmentsStats(now, [], schedule, timeZone, bucket.events);
    const isBusyNow = bucket.events.some(evt => {
      if (evt.isBusy === false) return false;
      const startMs = new Date(evt.start).getTime() - bufferMs;
      const endMs = new Date(evt.end).getTime() + bufferMs;
      return !isNaN(startMs) && !isNaN(endMs) && nowMs >= startMs && nowMs < endMs;
    });
    summaries.push({
      id: bucket.id,
      label: bucket.label,
      todayAppointmentsCount: stats.total,
      todayAllDayAppointmentsCount: stats.allDayCount,
      isBusyNow,
    });
  }

  return summaries;
}

export interface UpcomingClosureItem {
  startDate: string; // "YYYY-MM-DD"
  endDate: string;   // "YYYY-MM-DD" (inclusive)
  label: string;
  type: 'holiday' | 'vacation';
  isCurrent: boolean;
}

/**
 * Resolves active or upcoming closure periods within the next `withinDays` days (inclusive),
 * expanding annual rules onto the matching calendar dates cleanly in `timeZone`.
 */
export function getUpcomingClosures(
  now: Date,
  schedule: ScheduleConfig = DEFAULT_SCHEDULE,
  timeZone: string = schedule.timezone || 'Europe/Paris',
  withinDays: number = 30,
  lang: AppLang = 'fr'
): UpcomingClosureItem[] {
  if (!Array.isArray(schedule.closures) || schedule.closures.length === 0) {
    return [];
  }

  const todayStr = formatZonedDateStr(now, timeZone);
  const results: UpcomingClosureItem[] = [];
  let activeRun: UpcomingClosureItem | null = null;

  for (let offset = 0; offset <= withinDays; offset++) {
    const dayStr = addDaysToDateStr(todayStr, offset);
    const match = getClosureForDate(dayStr, schedule);
    if (match) {
      const defaultLabel =
        match.type === 'vacation'
          ? lang === 'en'
            ? 'On leave'
            : 'Congés'
          : lang === 'en'
          ? 'Public holiday'
          : 'Jour férié';
      const label = match.label?.trim() || defaultLabel;
      const type: 'holiday' | 'vacation' = match.type === 'vacation' ? 'vacation' : 'holiday';
      if (
        activeRun &&
        activeRun.label === label &&
        activeRun.type === type &&
        addDaysToDateStr(activeRun.endDate, 1) === dayStr
      ) {
        activeRun.endDate = dayStr;
      } else {
        activeRun = {
          startDate: dayStr,
          endDate: dayStr,
          label,
          type,
          isCurrent: offset === 0,
        };
        results.push(activeRun);
      }
    } else {
      activeRun = null;
    }
  }

  return results;
}

export type SimulatorPreset =
  | 'morning'
  | 'lunch'
  | 'afternoon'
  | 'evening'
  | 'weekend'
  | 'closure'
  | 'now';

/**
 * Pure timezone-safe preset date/time resolver for the AvailabilitySimulator.
 * Performs all calendar weekday checks and day arithmetic in the target `timeZone`
 * without relying on the browser's local timezone.
 */
export function computePresetDateTime(
  presetType: SimulatorPreset,
  now: Date,
  currentSimulatedDateStr: string,
  timeZone: string = 'Europe/Paris',
  firstClosureDate?: string | null,
  schedule?: ScheduleConfig
): { dateStr: string; timeStr: string } {
  const nowParts = getZonedDateParts(now, timeZone);
  const nowDateStr = `${nowParts.year}-${String(nowParts.month).padStart(2, '0')}-${String(nowParts.day).padStart(2, '0')}`;
  const nowTimeStr = `${String(nowParts.hour).padStart(2, '0')}:${String(nowParts.minute).padStart(2, '0')}`;

  if (presetType === 'now') {
    return { dateStr: nowDateStr, timeStr: nowTimeStr };
  }

  if (presetType === 'closure') {
    if (firstClosureDate && /^\d{4}-\d{2}-\d{2}$/.test(firstClosureDate)) {
      return { dateStr: firstClosureDate, timeStr: '10:00' };
    }
    return { dateStr: nowDateStr, timeStr: '10:00' };
  }

  const getWeekdayFromDateStr = (dStr: string): DayOfWeek => {
    const noonUtc = new Date(`${dStr}T12:00:00Z`);
    return isNaN(noonUtc.getTime()) ? nowParts.dayOfWeek : (noonUtc.getUTCDay() as DayOfWeek);
  };

  if (presetType === 'weekend') {
    const daysUntilSaturday = (6 - nowParts.dayOfWeek + 7) % 7 || 7;
    let weekendDateStr = addDaysToDateStr(nowDateStr, daysUntilSaturday);
    // If Saturday is worked in `schedule` while Sunday is off, pick Sunday for a true non-working weekend sample
    if (schedule && schedule.days?.[6]?.enabled && !schedule.days?.[0]?.enabled) {
      weekendDateStr = addDaysToDateStr(weekendDateStr, 1);
    }
    return {
      dateStr: weekendDateStr,
      timeStr: '14:30',
    };
  }

  // Weekday presets ('morning' | 'lunch' | 'afternoon' | 'evening'):
  // Determine weekday of currently selected calendar date using UTC noon on YYYY-MM-DD.
  const validSimDate = /^\d{4}-\d{2}-\d{2}$/.test(currentSimulatedDateStr)
    ? currentSimulatedDateStr
    : nowDateStr;
  const simDayOfWeek = getWeekdayFromDateStr(validSimDate);

  let targetDateStr = validSimDate;
  if (schedule) {
    const isWorkingDay = (dStr: string) => {
      const dow = getWeekdayFromDateStr(dStr);
      return Boolean(schedule.days?.[dow]?.enabled) && !getClosureForDate(dStr, schedule);
    };
    if (!isWorkingDay(targetDateStr)) {
      for (let offset = 1; offset <= 14; offset++) {
        const candidate = addDaysToDateStr(validSimDate, offset);
        if (isWorkingDay(candidate)) {
          targetDateStr = candidate;
          break;
        }
      }
    }
  } else {
    if (simDayOfWeek === 6) {
      // Saturday -> shift +2 days to Monday
      targetDateStr = addDaysToDateStr(validSimDate, 2);
    } else if (simDayOfWeek === 0) {
      // Sunday -> shift +1 day to Monday
      targetDateStr = addDaysToDateStr(validSimDate, 1);
    }
  }

  const timeByPreset: Record<'morning' | 'lunch' | 'afternoon' | 'evening', string> = {
    morning: '10:00',
    lunch: '12:45',
    afternoon: '15:30',
    evening: '20:30',
  };

  return {
    dateStr: targetDateStr,
    timeStr: timeByPreset[presetType],
  };
}
