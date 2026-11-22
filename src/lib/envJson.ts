import {
  normalizeProfileMode,
  sanitizeOptionalContactField,
  type ProfileMode,
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
