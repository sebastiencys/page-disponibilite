import {
  normalizeProfileMode,
  sanitizeOptionalContactField,
  type DayOfWeek,
  type ProfileMode,
  type ScheduleConfig,
} from './availability.ts';

export type EnvJsonVarName = 'PERSONAL_JSON' | 'SCHEDULE_JSON';

export type EnvJsonConvertResult =
  | {
      ok: true;
      envVarName: EnvJsonVarName;
      minifiedValue: string;
      envLine: string;
      charCount: number;
    }
  | {
      ok: false;
      error: string;
    };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function escapeSingleQuotesForEnvJson(minifiedJson: string): string {
  // \u0027 is standard RFC 8259 JSON and prevents breaking single-quoted values in .env / shell
  return minifiedJson.replace(/'/g, '\\u0027');
}

function sanitizePersonalObject(raw: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if ('name' in raw) {
    result.name = sanitizeOptionalContactField(raw.name);
  }
  if ('role' in raw) {
    result.role = sanitizeOptionalContactField(raw.role);
  }
  if ('company' in raw) {
    result.company = sanitizeOptionalContactField(raw.company);
  }
  if ('email' in raw) {
    result.email = sanitizeOptionalContactField(raw.email);
  }
  if ('bookingUrl' in raw) {
    result.bookingUrl = sanitizeOptionalContactField(raw.bookingUrl);
  }
  if ('mode' in raw && raw.mode !== undefined && raw.mode !== null) {
    const mode: ProfileMode = normalizeProfileMode(raw.mode, 'person');
    result.mode = mode;
  }
  return result;
}

const RECOGNIZED_SCHEDULE_KEYS = ['timezone', 'days', 'lunchBreak', 'bufferMinutes', 'closures'];

/**
 * Validates and transforms any formatted JSON string into a single-line env-safe value
 * and `VAR='...'` line ready for `.env` or Vercel Environment Variables.
 */
export function convertJsonToEnvOutput(
  rawInput: string,
  envVarName: EnvJsonVarName
): EnvJsonConvertResult {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    return {
      ok: false,
      error: 'Collez un contenu JSON valide pour générer la variable d’environnement.',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err: any) {
    return {
      ok: false,
      error: `JSON invalide : ${err?.message || 'vérifiez la syntaxe (guillemets doubles, virgules).'}`,
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      error: 'Le JSON doit être un objet ({ ... }), pas un tableau ni une valeur simple.',
    };
  }

  let normalizedObj: Record<string, unknown>;
  if (envVarName === 'PERSONAL_JSON') {
    normalizedObj = sanitizePersonalObject(parsed);
    if (Object.keys(normalizedObj).length === 0) {
      return {
        ok: false,
        error:
          'Aucune clé reconnue trouvée (attendu : name, role, company, email, bookingUrl, mode).',
      };
    }
  } else {
    const hasScheduleKey = RECOGNIZED_SCHEDULE_KEYS.some(key => key in parsed);
    if (!hasScheduleKey) {
      return {
        ok: false,
        error:
          'Aucune clé d’horaires reconnue (attendu : timezone, days, lunchBreak, bufferMinutes, closures).',
      };
    }
    normalizedObj = parsed;
  }

  const minifiedValue = escapeSingleQuotesForEnvJson(JSON.stringify(normalizedObj));
  const envLine = `${envVarName}='${minifiedValue}'`;

  return {
    ok: true,
    envVarName,
    minifiedValue,
    envLine,
    charCount: minifiedValue.length,
  };
}

const DAY_ORDER_MON_FIRST: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 0];
const DAY_SHORT_CODE: Record<DayOfWeek, string> = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
};

function formatDoubleQuotedEnvValue(val: string): string {
  if (!val.includes('"')) {
    return `"${val}"`;
  }
  if (!val.includes("'")) {
    return `'${val}'`;
  }
  return val.replace(/[\r\n]+/g, ' ');
}

function formatWorkDaysCompact(enabledDays: DayOfWeek[]): string {
  if (enabledDays.length === 0) return 'none';
  if (
    enabledDays.length === 5 &&
    enabledDays[0] === 1 &&
    enabledDays[1] === 2 &&
    enabledDays[2] === 3 &&
    enabledDays[3] === 4 &&
    enabledDays[4] === 5
  ) {
    return 'mon-fri';
  }
  if (
    enabledDays.length === 6 &&
    enabledDays[0] === 1 &&
    enabledDays[1] === 2 &&
    enabledDays[2] === 3 &&
    enabledDays[3] === 4 &&
    enabledDays[4] === 5 &&
    enabledDays[5] === 6
  ) {
    return 'mon-sat';
  }
  if (enabledDays.length === 7) {
    return 'mon-sun';
  }
  return enabledDays.map(d => DAY_SHORT_CODE[d]).join(',');
}

export interface GranularScheduleEnvResult {
  lines: string[];
  envBlock: string;
}

/**
 * Exports an active ScheduleConfig as minimal, clean granular `SCHEDULE_*` environment variables
 * that round-trip identically when parsed by `resolveScheduleFromEnv`.
 */
export function convertScheduleToGranularEnv(
  schedule: ScheduleConfig,
  effectiveTimezone?: string
): GranularScheduleEnvResult {
  const lines: string[] = [];
  const tz = (effectiveTimezone || schedule.timezone || 'Europe/Paris').trim();
  lines.push(`SCHEDULE_TIMEZONE=${formatDoubleQuotedEnvValue(tz)}`);

  const enabledDays = DAY_ORDER_MON_FIRST.filter(d => Boolean(schedule.days?.[d]?.enabled));
  lines.push(`SCHEDULE_WORK_DAYS=${formatDoubleQuotedEnvValue(formatWorkDaysCompact(enabledDays))}`);

  // Pick the most common start-end range among enabled days (fallback Monday/any day)
  const rangeCounts = new Map<string, number>();
  const candidates = enabledDays.length > 0 ? enabledDays : DAY_ORDER_MON_FIRST;
  for (const day of candidates) {
    const dConf = schedule.days?.[day];
    if (!dConf) continue;
    const range = `${dConf.start || '09:00'}-${dConf.end || '18:00'}`;
    rangeCounts.set(range, (rangeCounts.get(range) || 0) + 1);
  }
  let defaultRange = '09:00-18:00';
  let bestCount = -1;
  for (const [range, count] of rangeCounts.entries()) {
    if (count > bestCount) {
      bestCount = count;
      defaultRange = range;
    }
  }
  lines.push(`SCHEDULE_HOURS=${formatDoubleQuotedEnvValue(defaultRange)}`);

  // Emit per-day exceptions only when an enabled day differs from defaultRange
  for (const day of DAY_ORDER_MON_FIRST) {
    const dConf = schedule.days?.[day];
    if (!dConf || !dConf.enabled) continue;
    const dayRange = `${dConf.start}-${dConf.end}`;
    if (dayRange !== defaultRange) {
      lines.push(
        `SCHEDULE_HOURS_${DAY_SHORT_CODE[day].toUpperCase()}=${formatDoubleQuotedEnvValue(dayRange)}`
      );
    }
  }

  // Global lunch break
  const lunch = schedule.lunchBreak;
  if (lunch && lunch.enabled) {
    lines.push(`SCHEDULE_LUNCH_HOURS=${formatDoubleQuotedEnvValue(`${lunch.start}-${lunch.end}`)}`);
    const label = lunch.label?.trim();
    if (label && label !== 'Pause déjeuner') {
      lines.push(`SCHEDULE_LUNCH_LABEL=${formatDoubleQuotedEnvValue(label)}`);
    }
  } else {
    lines.push('SCHEDULE_LUNCH_HOURS="off"');
  }

  // Per-day lunch overrides
  if (lunch?.days) {
    for (const day of DAY_ORDER_MON_FIRST) {
      const ov = lunch.days[day];
      if (!ov) continue;
      const suffix = DAY_SHORT_CODE[day].toUpperCase();
      if (ov.enabled === false) {
        lines.push(`SCHEDULE_LUNCH_HOURS_${suffix}="off"`);
      } else if (ov.start || ov.end || ov.enabled === true) {
        const s = ov.start?.trim() || lunch.start;
        const e = ov.end?.trim() || lunch.end;
        if (ov.enabled === true || s !== lunch.start || e !== lunch.end) {
          lines.push(`SCHEDULE_LUNCH_HOURS_${suffix}=${formatDoubleQuotedEnvValue(`${s}-${e}`)}`);
        }
      }
      const ovLabel = ov.label?.trim();
      if (ovLabel && ovLabel !== lunch.label) {
        lines.push(`SCHEDULE_LUNCH_LABEL_${suffix}=${formatDoubleQuotedEnvValue(ovLabel)}`);
      }
    }
  }

  // Buffer minutes (emit when > 0, or if explicitly 0 omit to keep output compact unless needed?Wait: if base schedule has buffer>0 and effective is 0, keeping 0 when >0 vs always?Wait: omitting 0 works cleanly on fresh env, emitting always or >0: wait—let's check! What if config/schedule.json has 0? Emitting SCHEDULE_BUFFER_MINUTES when > 0 keeps minimal .env; if someone had base schedule.json with 15 and wanted 0 they'd set 0, so omitting when 0 matches standard .env.example style OR we can emit only when > 0!)
  const bufferMinutes =
    typeof schedule.bufferMinutes === 'number' && Number.isFinite(schedule.bufferMinutes) && schedule.bufferMinutes > 0
      ? Math.round(schedule.bufferMinutes)
      : 0;
  if (bufferMinutes > 0) {
    lines.push(`SCHEDULE_BUFFER_MINUTES="${bufferMinutes}"`);
  }

  // Closures
  if (Array.isArray(schedule.closures) && schedule.closures.length > 0) {
    const serialized = schedule.closures
      .filter(c => c && typeof c.startDate === 'string' && c.startDate.trim())
      .map(c => {
        const start = c.startDate.trim();
        const end = c.endDate?.trim();
        const dateExpr = end && end !== start ? `${start}..${end}` : start;
        const tokens = [dateExpr];
        const cleanLabel = c.label?.replace(/[|;]/g, ' ').trim();
        if (cleanLabel) tokens.push(cleanLabel);
        if (c.type === 'holiday' || c.type === 'vacation') tokens.push(c.type);
        if (c.annual) tokens.push('annual');
        return tokens.join('|');
      });
    if (serialized.length > 0) {
      lines.push(`SCHEDULE_CLOSURES=${formatDoubleQuotedEnvValue(serialized.join('; '))}`);
    }
  }

  return {
    lines,
    envBlock: lines.join('\n'),
  };
}

/**
 * Exports a UserProfile as clean granular `PROFILE_*` environment variables
 * that round-trip identically when parsed by `resolveProfileFromEnv`.
 */
export function convertProfileToGranularEnv(profile: {
  name?: string;
  role?: string;
  company?: string;
  email?: string;
  bookingUrl?: string;
  mode?: ProfileMode;
}): GranularScheduleEnvResult {
  const name = sanitizeOptionalContactField(profile.name);
  const role = sanitizeOptionalContactField(profile.role);
  const company = sanitizeOptionalContactField(profile.company);
  const email = sanitizeOptionalContactField(profile.email);
  const bookingUrl = sanitizeOptionalContactField(profile.bookingUrl);
  const mode = normalizeProfileMode(profile.mode, 'person');

  const lines = [
    `PROFILE_NAME=${formatDoubleQuotedEnvValue(name)}`,
    `PROFILE_ROLE=${formatDoubleQuotedEnvValue(role)}`,
    `PROFILE_COMPANY=${formatDoubleQuotedEnvValue(company)}`,
    `PROFILE_EMAIL=${formatDoubleQuotedEnvValue(email)}`,
    `PROFILE_BOOKING_URL=${formatDoubleQuotedEnvValue(bookingUrl)}`,
    `PROFILE_MODE=${formatDoubleQuotedEnvValue(mode)}`,
  ];

  return {
    lines,
    envBlock: lines.join('\n'),
  };
}


