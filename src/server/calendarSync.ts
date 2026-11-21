/**
 * Server-side multi-calendar synchronizer with environment variable discovery and per-source caching.
 * Supports CALENDAR_ICS_URL as well as labeled calendars like CALENDAR_ICS_URL_PRO, CALENDAR_ICS_URL_PERSO, etc.
 * Protects all secret iCal URLs by keeping them strictly server-side.
 */

import { parseIcsEvents } from '../lib/icalParser.ts';
import { DEFAULT_SCHEDULE, type CalendarEvent } from '../lib/availability.ts';

export interface EnvCalendarSource {
  id: string;
  label: string;
  envVar: string;
  url: string;
  hasExplicitLabel: boolean;
}

export interface SyncedCalendarInfo {
  id: string;
  label: string;
  envVar: string;
  eventCount: number;
  fromCache: boolean;
  lastSync: string | null;
  ok: boolean;
}

interface CacheEntry {
  events: CalendarEvent[];
  icsText: string;
  windowStartMs: number;
  windowEndMs: number;
  fetchedAt: number;
  url: string;
  timezone: string;
  id: string;
  label: string;
  hasExplicitLabel: boolean;
}

const memoryCacheMap = new Map<string, CacheEntry>();
const inFlightSyncs = new Map<
  string,
  Promise<{
    entry: CacheEntry | null;
    ok: boolean;
    fromCache: boolean;
    fetchedAt: number | null;
  }>
>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache to avoid rate-limiting
const DEFAULT_PAST_MS = 7 * 86400000;
const DEFAULT_FUTURE_MS = 90 * 86400000;

export function clearCalendarSyncCacheForTests(): void {
  memoryCacheMap.clear();
  inFlightSyncs.clear();
}

/**
 * Converts an env var suffix like "PRO", "PERSO", or "CABINET_SUD" into a readable label ("Pro", "Perso", "Cabinet Sud").
 */
export function formatCalendarLabel(suffix: string): string {
  return suffix
    .split('_')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Discovers all configured ICS calendar sources from environment variables:
 * - CALENDAR_ICS_URL (optional CALENDAR_ICS_LABEL, defaults to "Principal")
 * - CALENDAR_ICS_URL_<SUFFIX> (optional CALENDAR_ICS_LABEL_<SUFFIX>, defaults to formatted <SUFFIX>)
 */
export function getEnvCalendarSources(
  env: Record<string, string | undefined> = process.env
): EnvCalendarSource[] {
  const suffixed: EnvCalendarSource[] = [];
  const seenSuffixIds = new Set<string>();

  for (const key of Object.keys(env)) {
    const match = /^CALENDAR_ICS_URL_([A-Za-z0-9_]+)$/.exec(key);
    if (!match) continue;
    const rawUrl = env[key]?.trim();
    if (!rawUrl) continue;

    const suffix = match[1];
    const id = suffix.toLowerCase();
    if (seenSuffixIds.has(id)) continue;
    seenSuffixIds.add(id);

    const customLabel =
      env[`CALENDAR_ICS_LABEL_${suffix}`]?.trim() ||
      env[`CALENDAR_ICS_LABEL_${suffix.toUpperCase()}`]?.trim();

    suffixed.push({
      id,
      label: customLabel || formatCalendarLabel(suffix) || suffix,
      envVar: key,
      url: rawUrl,
      hasExplicitLabel: true,
    });
  }

  const sources: EnvCalendarSource[] = [];
  const baseUrl = env.CALENDAR_ICS_URL?.trim();
  if (baseUrl) {
    const baseCustomLabel = env.CALENDAR_ICS_LABEL?.trim();
    sources.push({
      id: 'default',
      label: baseCustomLabel || 'Principal',
      envVar: 'CALENDAR_ICS_URL',
      url: baseUrl,
      // Keep single legacy CALENDAR_ICS_URL unlabeled unless CALENDAR_ICS_LABEL is provided or >1 calendars exist
      hasExplicitLabel: Boolean(baseCustomLabel) || suffixed.length > 0,
    });
  }

  sources.push(...suffixed);
  return sources;
}

/**
 * Returns whether at least one private calendar URL is configured in environment variables.
 */
export function hasEnvCalendar(): boolean {
  return getEnvCalendarSources().length > 0;
}

/**
 * Gets the primary configured calendar URL (priority: env calendars, then fallbackUrl).
 */
export function getCalendarUrl(fallbackUrl?: string): string | null {
  const sources = getEnvCalendarSources();
  if (sources.length > 0) return sources[0].url;
  if (fallbackUrl && fallbackUrl.trim().length > 0) return fallbackUrl.trim();
  return null;
}

/**
 * Validates and normalizes external iCal URLs (for manual Studio syncs), blocking private/loopback targets.
 */
export function validateExternalCalendarUrl(rawUrl: string): string {
  const normalized = rawUrl.trim().replace(/^webcal:\/\//i, 'https://');
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('URL de calendrier invalide.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Seules les URL http://, https:// ou webcal:// sont autorisées.');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '::1' ||
    host === '[::1]' ||
    host === '0.0.0.0' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new Error('Adresse locale ou privée non autorisée.');
  }
  return parsed.toString();
}

function decorateSourceEvents(
  rawEvents: CalendarEvent[],
  source: Pick<EnvCalendarSource, 'id' | 'label' | 'hasExplicitLabel'>
): CalendarEvent[] {
  return rawEvents.map(evt => ({
    ...evt,
    id: `${source.id}:${evt.id}`,
    calendarId: source.id,
    ...(source.hasExplicitLabel ? { calendarLabel: source.label } : {}),
  }));
}

function getEventsForTargetTime(entry: CacheEntry, targetTime?: Date): CalendarEvent[] {
  let baseEvents = entry.events;
  if (targetTime && entry.icsText) {
    const targetMs = targetTime.getTime();
    if (targetMs < entry.windowStartMs || targetMs > entry.windowEndMs) {
      baseEvents = parseIcsEvents(entry.icsText, entry.timezone, { now: targetTime });
    }
  }
  return decorateSourceEvents(baseEvents, entry);
}

async function syncSingleSource(
  source: EnvCalendarSource,
  timezone: string,
  forceRefresh: boolean,
  targetTime?: Date
): Promise<{
  events: CalendarEvent[];
  info: SyncedCalendarInfo;
  fetchedAt: number | null;
}> {
  const now = Date.now();
  const cacheKey = `${source.id}::${source.envVar}`;
  const cached = memoryCacheMap.get(cacheKey);

  if (
    !forceRefresh &&
    cached &&
    cached.url === source.url &&
    cached.timezone === timezone &&
    cached.label === source.label &&
    cached.hasExplicitLabel === source.hasExplicitLabel &&
    now - cached.fetchedAt < CACHE_TTL_MS
  ) {
    const events = getEventsForTargetTime(cached, targetTime);
    return {
      events,
      fetchedAt: cached.fetchedAt,
      info: {
        id: source.id,
        label: source.label,
        envVar: source.envVar,
        eventCount: events.length,
        fromCache: true,
        lastSync: new Date(cached.fetchedAt).toISOString(),
        ok: true,
      },
    };
  }

  const existingInFlight = !forceRefresh ? inFlightSyncs.get(cacheKey) : undefined;
  const syncPromise =
    existingInFlight ??
    (async () => {
      try {
        const fetchUrl = source.url.trim().replace(/^webcal:\/\//i, 'https://');
        const parsedUrl = new URL(fetchUrl);
        if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
          throw new Error("Protocole d'URL iCal non supporté");
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(parsedUrl.toString(), {
          signal: controller.signal,
          cache: 'no-store',
          headers: {
            'User-Agent': 'DispoLive-Calendar-Sync/1.0',
            'Cache-Control': 'no-cache, no-store',
            Pragma: 'no-cache',
          },
        });
        clearTimeout(timeout);

        if (!res.ok) {
          throw new Error(`Erreur HTTP ${res.status}: ${res.statusText}`);
        }

        const icsText = await res.text();
        const nowDate = new Date(now);
        const parsed = parseIcsEvents(icsText, timezone, { now: nowDate });

        const entry: CacheEntry = {
          events: parsed,
          icsText,
          windowStartMs: now - DEFAULT_PAST_MS,
          windowEndMs: now + DEFAULT_FUTURE_MS,
          fetchedAt: now,
          url: source.url,
          timezone,
          id: source.id,
          label: source.label,
          hasExplicitLabel: source.hasExplicitLabel,
        };
        memoryCacheMap.set(cacheKey, entry);

        return { entry, ok: true, fromCache: false, fetchedAt: now };
      } catch (err: any) {
        console.warn(`[DispoLive] Error syncing calendar (${source.envVar}):`, err.message);
        if (cached && cached.url === source.url) {
          const staleEntry: CacheEntry = {
            ...cached,
            label: source.label,
            hasExplicitLabel: source.hasExplicitLabel,
          };
          return { entry: staleEntry, ok: false, fromCache: true, fetchedAt: cached.fetchedAt };
        }
        return { entry: null, ok: false, fromCache: false, fetchedAt: null };
      }
    })();

  if (!existingInFlight) {
    inFlightSyncs.set(cacheKey, syncPromise);
  }

  let syncResult: {
    entry: CacheEntry | null;
    ok: boolean;
    fromCache: boolean;
    fetchedAt: number | null;
  };
  try {
    syncResult = await syncPromise;
  } finally {
    if (inFlightSyncs.get(cacheKey) === syncPromise) {
      inFlightSyncs.delete(cacheKey);
    }
  }

  if (syncResult.entry) {
    const events = getEventsForTargetTime(syncResult.entry, targetTime);
    return {
      events,
      fetchedAt: syncResult.fetchedAt,
      info: {
        id: source.id,
        label: source.label,
        envVar: source.envVar,
        eventCount: events.length,
        fromCache: syncResult.fromCache,
        lastSync: syncResult.fetchedAt !== null ? new Date(syncResult.fetchedAt).toISOString() : null,
        ok: syncResult.ok,
      },
    };
  }

  return {
    events: [],
    fetchedAt: null,
    info: {
      id: source.id,
      label: source.label,
      envVar: source.envVar,
      eventCount: 0,
      fromCache: false,
      lastSync: null,
      ok: false,
    },
  };
}

/**
 * Fetches and merges calendar events from all configured environment calendars (or fallbackUrl).
 */
export async function getSyncedCalendarEvents(
  fallbackUrl?: string,
  forceRefresh = false,
  targetTime?: Date
): Promise<{
  events: CalendarEvent[];
  fromCache: boolean;
  lastSync: Date | null;
  calendars: SyncedCalendarInfo[];
}> {
  let sources = getEnvCalendarSources();
  if (sources.length === 0 && fallbackUrl && fallbackUrl.trim().length > 0) {
    sources = [
      {
        id: 'manual',
        label: 'Principal',
        envVar: 'MANUAL_URL',
        url: fallbackUrl.trim(),
        hasExplicitLabel: false,
      },
    ];
  }

  if (sources.length === 0) {
    return { events: [], fromCache: false, lastSync: null, calendars: [] };
  }

  const timezone = process.env.TIMEZONE || DEFAULT_SCHEDULE.timezone || 'Europe/Paris';
  const results = await Promise.all(
    sources.map(src => syncSingleSource(src, timezone, forceRefresh, targetTime))
  );

  const mergedEvents: CalendarEvent[] = [];
  const calendars: SyncedCalendarInfo[] = [];
  let allFromCache = true;
  let latestSyncMs: number | null = null;

  for (const r of results) {
    mergedEvents.push(...r.events);
    calendars.push(r.info);
    if (!r.info.fromCache) allFromCache = false;
    if (r.fetchedAt !== null && (latestSyncMs === null || r.fetchedAt > latestSyncMs)) {
      latestSyncMs = r.fetchedAt;
    }
  }

  return {
    events: mergedEvents,
    fromCache: allFromCache,
    lastSync: latestSyncMs !== null ? new Date(latestSyncMs) : null,
    calendars,
  };
}
