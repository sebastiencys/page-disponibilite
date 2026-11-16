/**
 * Server-side calendar synchronizer with environment variable support and in-memory caching.
 * Protects the secret iCal URL by keeping it strictly server-side.
 */

import { parseIcsEvents } from '../lib/icalParser.ts';
import { DEFAULT_SCHEDULE, type CalendarEvent } from '../lib/availability.ts';

interface CacheEntry {
  events: CalendarEvent[];
  icsText: string;
  windowStartMs: number;
  windowEndMs: number;
  fetchedAt: number;
  url: string;
  timezone: string;
}

let memoryCache: CacheEntry | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache to avoid rate-limiting
const DEFAULT_PAST_MS = 7 * 86400000;
const DEFAULT_FUTURE_MS = 90 * 86400000;

/**
 * Returns whether a private calendar URL is configured in environment variables
 */
export function hasEnvCalendar(): boolean {
  return Boolean(process.env.CALENDAR_ICS_URL && process.env.CALENDAR_ICS_URL.trim().length > 0);
}

/**
 * Gets the configured calendar URL (priority: process.env.CALENDAR_ICS_URL, then fallback)
 */
export function getCalendarUrl(fallbackUrl?: string): string | null {
  const envUrl = process.env.CALENDAR_ICS_URL?.trim();
  if (envUrl) return envUrl;
  if (fallbackUrl && fallbackUrl.trim().length > 0) return fallbackUrl.trim();
  return null;
}

function getEventsForTargetTime(entry: CacheEntry, targetTime?: Date): CalendarEvent[] {
  if (!targetTime || !entry.icsText) {
    return entry.events;
  }
  const targetMs = targetTime.getTime();
  if (targetMs >= entry.windowStartMs && targetMs <= entry.windowEndMs) {
    return entry.events;
  }
  return parseIcsEvents(entry.icsText, entry.timezone, { now: targetTime });
}

/**
 * Fetches and parses calendar events from the secure URL with caching
 */
export async function getSyncedCalendarEvents(
  fallbackUrl?: string,
  forceRefresh = false,
  targetTime?: Date
): Promise<{ events: CalendarEvent[]; fromCache: boolean; lastSync: Date | null }> {
  const url = getCalendarUrl(fallbackUrl);
  if (!url) {
    return { events: [], fromCache: false, lastSync: null };
  }

  const now = Date.now();
  const timezone = process.env.TIMEZONE || DEFAULT_SCHEDULE.timezone || 'Europe/Paris';

  // Check cache validity
  if (
    !forceRefresh &&
    memoryCache &&
    memoryCache.url === url &&
    memoryCache.timezone === timezone &&
    now - memoryCache.fetchedAt < CACHE_TTL_MS
  ) {
    return {
      events: getEventsForTargetTime(memoryCache, targetTime),
      fromCache: true,
      lastSync: new Date(memoryCache.fetchedAt),
    };
  }

  try {
    const fetchUrl = url.replace(/^webcal:\/\//i, 'https://');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const res = await fetch(fetchUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'DispoLive-Calendar-Sync/1.0',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Erreur HTTP ${res.status}: ${res.statusText}`);
    }

    const icsText = await res.text();
    const nowDate = new Date(now);
    const parsed = parseIcsEvents(icsText, timezone, { now: nowDate });

    memoryCache = {
      events: parsed,
      icsText,
      windowStartMs: now - DEFAULT_PAST_MS,
      windowEndMs: now + DEFAULT_FUTURE_MS,
      fetchedAt: now,
      url,
      timezone,
    };

    return {
      events: getEventsForTargetTime(memoryCache, targetTime),
      fromCache: false,
      lastSync: new Date(now),
    };
  } catch (err: any) {
    console.warn('[DispoLive] Error syncing calendar from secret URL:', err.message);
    // If fetch failed but we have a cached version, return cached even if stale
    if (memoryCache && memoryCache.url === url) {
      return {
        events: getEventsForTargetTime(memoryCache, targetTime),
        fromCache: true,
        lastSync: new Date(memoryCache.fetchedAt),
      };
    }
    return { events: [], fromCache: false, lastSync: null };
  }
}
