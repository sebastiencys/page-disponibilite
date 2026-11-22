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

export function isHttpsRequest(
  headers: Record<string, string | string[] | undefined>,
  isSocketEncrypted: boolean = false
): boolean {
  if (isSocketEncrypted) return true;
  const protoRaw = headers['x-forwarded-proto'] ?? headers['X-Forwarded-Proto'];
  const proto = Array.isArray(protoRaw) ? protoRaw[0] : protoRaw;
  if (typeof proto === 'string' && proto.split(',')[0]?.trim().toLowerCase() === 'https') {
    return true;
  }
  const sslRaw = headers['x-forwarded-ssl'] ?? headers['X-Forwarded-Ssl'];
  const ssl = Array.isArray(sslRaw) ? sslRaw[0] : sslRaw;
  return typeof ssl === 'string' && ssl.trim().toLowerCase() === 'on';
}

export function buildSessionCookieHeader(
  token: string,
  maxAgeSeconds = 12 * 60 * 60,
  secure = false
): string {
  return `${STUDIO_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
}

export function buildClearSessionCookieHeader(secure = false): string {
  return `${STUDIO_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

export const AUTH_MAX_FAILURES = 5;
export const AUTH_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
export const AUTH_LOCKOUT_MS = 60 * 1000;     // 60 seconds lockout after 5 failures

interface FailureRecord {
  count: number;
  windowStartMs: number;
  lockedUntilMs: number;
}

const authFailuresByClient = new Map<string, FailureRecord>();

export function extractClientIp(
  headers: Record<string, string | string[] | undefined>,
  remoteAddress?: string
): string {
  const fwdRaw = headers['x-forwarded-for'] ?? headers['X-Forwarded-For'];
  const fwdHeader = Array.isArray(fwdRaw) ? fwdRaw[0] : fwdRaw;
  if (typeof fwdHeader === 'string' && fwdHeader.trim()) {
    const firstIp = fwdHeader.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }
  const realIpRaw = headers['x-real-ip'] ?? headers['X-Real-IP'];
  const realIp = Array.isArray(realIpRaw) ? realIpRaw[0] : realIpRaw;
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }
  return remoteAddress?.trim() || 'unknown';
}

export function checkAuthRateLimit(
  clientKey: string,
  nowMs: number = Date.now()
): { allowed: boolean; retryAfterSeconds: number; remainingAttempts: number } {
  const record = authFailuresByClient.get(clientKey);
  if (!record) {
    return { allowed: true, retryAfterSeconds: 0, remainingAttempts: AUTH_MAX_FAILURES };
  }

  if (record.lockedUntilMs > nowMs) {
    const retryAfterSeconds = Math.max(1, Math.ceil((record.lockedUntilMs - nowMs) / 1000));
    return { allowed: false, retryAfterSeconds, remainingAttempts: 0 };
  }

  if (nowMs - record.windowStartMs >= AUTH_WINDOW_MS || record.lockedUntilMs > 0) {
    authFailuresByClient.delete(clientKey);
    return { allowed: true, retryAfterSeconds: 0, remainingAttempts: AUTH_MAX_FAILURES };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
    remainingAttempts: Math.max(0, AUTH_MAX_FAILURES - record.count),
  };
}

export function recordAuthFailure(
  clientKey: string,
  nowMs: number = Date.now()
): { allowed: boolean; retryAfterSeconds: number; remainingAttempts: number } {
  const existing = authFailuresByClient.get(clientKey);
  let record: FailureRecord;

  if (!existing || nowMs - existing.windowStartMs >= AUTH_WINDOW_MS) {
    record = { count: 1, windowStartMs: nowMs, lockedUntilMs: 0 };
  } else {
    record = {
      count: existing.count + 1,
      windowStartMs: existing.windowStartMs,
      lockedUntilMs: existing.lockedUntilMs,
    };
  }

  if (record.count >= AUTH_MAX_FAILURES) {
    record.lockedUntilMs = nowMs + AUTH_LOCKOUT_MS;
    authFailuresByClient.set(clientKey, record);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(AUTH_LOCKOUT_MS / 1000),
      remainingAttempts: 0,
    };
  }

  authFailuresByClient.set(clientKey, record);
  return {
    allowed: true,
    retryAfterSeconds: 0,
    remainingAttempts: AUTH_MAX_FAILURES - record.count,
  };
}

export function clearAuthFailures(clientKey: string): void {
  authFailuresByClient.delete(clientKey);
}

