/**
 * Server-side Studio authentication & stateless HMAC session tokens.
 * Uses STUDIO_PASSWORD from environment variables (.env) — never exposed to clients.
 */

import crypto from 'node:crypto';

export const STUDIO_COOKIE_NAME = 'dispolive_studio_session';
const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export function getConfiguredStudioPassword(): string {
  return process.env.STUDIO_PASSWORD?.trim() || '';
}

export function isStudioPasswordRequired(): boolean {
  return getConfiguredStudioPassword().length > 0;
}

function sha256Buffer(value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

export function verifyStudioPassword(
  candidate: string,
  configuredPassword: string = getConfiguredStudioPassword()
): boolean {
  if (!configuredPassword) return false;
  if (typeof candidate !== 'string' || candidate.length === 0) return false;
  const a = sha256Buffer(candidate);
  const b = sha256Buffer(configuredPassword);
  return crypto.timingSafeEqual(a, b);
}

function deriveSigningKey(configuredPassword: string): Buffer {
  const salt = process.env.STUDIO_SESSION_SECRET?.trim() || 'dispolive-studio-session-v1';
  return sha256Buffer(`${configuredPassword}::${salt}`);
}

export function createStudioSessionToken(
  configuredPassword: string = getConfiguredStudioPassword(),
  nowMs: number = Date.now(),
  ttlMs: number = DEFAULT_SESSION_TTL_MS
): string {
  const expiresAt = nowMs + ttlMs;
  const key = deriveSigningKey(configuredPassword);
  const signature = crypto
    .createHmac('sha256', key)
    .update(String(expiresAt))
    .digest('hex');
  return `${expiresAt}.${signature}`;
}

export function verifyStudioSessionToken(
  token: string | undefined | null,
  configuredPassword: string = getConfiguredStudioPassword(),
  nowMs: number = Date.now()
): boolean {
  if (!configuredPassword) return true;
  if (!token || typeof token !== 'string') return false;

  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return false;

  const expiresStr = token.slice(0, dotIdx);
  const providedSig = token.slice(dotIdx + 1);
  if (!/^\d+$/.test(expiresStr) || !/^[a-f0-9]{64}$/i.test(providedSig)) {
    return false;
  }

  const expiresAt = Number(expiresStr);
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) {
    return false;
  }

  const key = deriveSigningKey(configuredPassword);
  const expectedSig = crypto
    .createHmac('sha256', key)
    .update(expiresStr)
    .digest('hex');

  const a = Buffer.from(providedSig.toLowerCase(), 'utf8');
  const b = Buffer.from(expectedSig.toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) {
      try {
        result[k] = decodeURIComponent(v);
      } catch {
        result[k] = v;
      }
    }
  }
  return result;
}

export function extractStudioToken(
  headers: Record<string, string | string[] | undefined>
): string | null {
  const authRaw = headers.authorization ?? headers.Authorization;
  const authHeader = Array.isArray(authRaw) ? authRaw[0] : authRaw;
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }

  const cookieRaw = headers.cookie ?? headers.Cookie;
  const cookieHeader = Array.isArray(cookieRaw) ? cookieRaw[0] : cookieRaw;
  const cookies = parseCookies(cookieHeader);
  if (cookies[STUDIO_COOKIE_NAME]) {
    return cookies[STUDIO_COOKIE_NAME];
  }

  return null;
}

export function isRequestStudioAuthenticated(
  headers: Record<string, string | string[] | undefined>,
  configuredPassword: string = getConfiguredStudioPassword(),
  nowMs: number = Date.now()
): boolean {
  if (!configuredPassword) return true;
  const token = extractStudioToken(headers);
  return verifyStudioSessionToken(token, configuredPassword, nowMs);
}

export function buildSessionCookieHeader(token: string, maxAgeSeconds = 12 * 60 * 60): string {
  return `${STUDIO_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function buildClearSessionCookieHeader(): string {
  return `${STUDIO_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
