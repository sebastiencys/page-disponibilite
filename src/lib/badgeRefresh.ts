import { DEFAULT_PROFILE, formatTimeShort, type AppLang, type AvailabilityResult } from './availability.ts';
import type { BadgeStyle, BadgeTheme } from './badgeRenderer.ts';

export const DEFAULT_AUTO_REFRESH_MS = 10 * 60 * 1000; // 10 minutes
export const AUTO_REFRESH_STORAGE_KEY = 'dispolive_studio_autorefresh_ms_v1';

export interface AutoRefreshOption {
  label: string;
  ms: number;
}

export const AUTO_REFRESH_OPTIONS: AutoRefreshOption[] = [
  { label: 'Désactivé', ms: 0 },
  { label: '1 min', ms: 60 * 1000 },
  { label: '5 min', ms: 5 * 60 * 1000 },
  { label: '10 min', ms: 10 * 60 * 1000 },
  { label: '30 min', ms: 30 * 60 * 1000 },
];

export interface BadgeUrlParams {
  format: 'png' | 'svg';
  style: BadgeStyle;
  theme: BadgeTheme;
  name?: string;
  role?: string;
  company?: string;
  lang?: AppLang;
}

/**
 * Validates a saved or selected auto-refresh interval in milliseconds.
 * Falls back to DEFAULT_AUTO_REFRESH_MS (10 min) for unknown/invalid values.
 */
export function normalizeAutoRefreshMs(rawValue: unknown): number {
  const num = typeof rawValue === 'string' ? Number(rawValue) : rawValue;
  if (typeof num !== 'number' || !Number.isFinite(num)) {
    return DEFAULT_AUTO_REFRESH_MS;
  }
  const match = AUTO_REFRESH_OPTIONS.find(opt => opt.ms === num);
  return match ? match.ms : DEFAULT_AUTO_REFRESH_MS;
}

/**
 * Builds a stable fingerprint of all availability fields rendered inside badges
 * so badge image previews can auto-refresh immediately whenever status text or counts change.
 */
export function buildAvailabilityFingerprint(availability: AvailabilityResult): string {
  const nextChangeRaw = availability.nextChangeDate as Date | string | undefined;
  const nextChangeIso =
    nextChangeRaw instanceof Date ? nextChangeRaw.toISOString() : String(nextChangeRaw || '');
  return [
    availability.status,
    availability.state,
    availability.title,
    availability.subtitle,
    availability.nextFreeTime || '',
    availability.activeCalendarLabel || '',
    String(availability.todayAppointmentsCount ?? 0),
    String(availability.todayAllDayAppointmentsCount ?? 0),
    nextChangeIso,
  ].join('|');
}

/**
 * Builds the canonical shareable badge URL (without cache-busting parameters)
 * for email signatures, Markdown, and direct links.
 */
export function buildBadgePublicUrl(baseUrl: string, params: BadgeUrlParams): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const safeName = encodeURIComponent(params.name || DEFAULT_PROFILE.name);
  const safeRole = encodeURIComponent(params.role || DEFAULT_PROFILE.role);
  const safeCompany = encodeURIComponent(params.company || DEFAULT_PROFILE.company);
  const langSuffix = params.lang === 'en' ? '&lang=en' : '';
  return `${cleanBase}/api/badge.${params.format}?style=${params.style}&theme=${params.theme}&name=${safeName}&role=${safeRole}&company=${safeCompany}${langSuffix}`;
}

/**
 * Builds the Studio preview <img> URL with a cache-busting `v=` parameter so the browser
 * always fetches a fresh image on auto-refresh, status transitions, or manual clicks.
 */
export function buildBadgePreviewUrl(
  baseUrl: string,
  params: BadgeUrlParams,
  cacheBuster: number | string
): string {
  const publicUrl = buildBadgePublicUrl(baseUrl, params);
  return `${publicUrl}&v=${encodeURIComponent(String(cacheBuster))}`;
}

/**
 * Determines whether the wall-clock elapsed time since the last refresh meets or exceeds `intervalMs`.
 */
export function shouldTriggerAutoRefresh(
  lastRefreshedAtMs: number,
  nowMs: number,
  intervalMs: number
): boolean {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return false;
  if (!Number.isFinite(lastRefreshedAtMs) || !Number.isFinite(nowMs)) return false;
  return nowMs - lastRefreshedAtMs >= intervalMs;
}

/**
 * Formats the next remaining refresh countdown concisely (e.g. "9m", "1m", "< 1m").
 */
export function formatRemainingRefreshTime(
  lastRefreshedAtMs: number,
  nowMs: number,
  intervalMs: number
): string {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return 'Manuel';
  const remainingMs = Math.max(0, intervalMs - Math.max(0, nowMs - lastRefreshedAtMs));
  const remainingMinutes = Math.ceil(remainingMs / 60000);
  if (remainingMinutes <= 1) return '< 1 min';
  return `${remainingMinutes} min`;
}

/**
 * Formats a refresh timestamp cleanly in the user's timezone (e.g., "10h05").
 */
export function formatLastRefreshedTime(timestampMs: number, timezone: string): string {
  return formatTimeShort(new Date(timestampMs), timezone);
}
