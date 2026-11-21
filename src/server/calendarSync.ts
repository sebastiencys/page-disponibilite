/**
 * Server-side multi-calendar synchronizer with environment variable discovery and per-source caching.
 * Supports CALENDAR_ICS_URL as well as labeled calendars like CALENDAR_ICS_URL_PRO, CALENDAR_ICS_URL_PERSO, etc.
 * Protects all secret iCal URLs by keeping them strictly server-side.
 */

import dns from 'node:dns/promises';
import net from 'node:net';
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
export const MAX_ICS_BYTES = 5 * 1024 * 1024; // 5 Mo max per .ics feed

export class ExternalCalendarUrlError extends Error {
  statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ExternalCalendarUrlError';
  }
}

export class IcsTooLargeError extends Error {
  statusCode = 413;
  constructor(maxBytes = MAX_ICS_BYTES) {
    super(`Flux iCal trop volumineux (max ${Math.round(maxBytes / (1024 * 1024))} Mo).`);
    this.name = 'IcsTooLargeError';
  }
}

export async function readLimitedIcsText(
  res: globalThis.Response,
  maxBytes = MAX_ICS_BYTES
): Promise<string> {
  const contentLength = res.headers.get('content-length');
  if (contentLength) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      throw new IcsTooLargeError(maxBytes);
    }
  }
  const icsText = await res.text();
  if (Buffer.byteLength(icsText, 'utf8') > maxBytes) {
    throw new IcsTooLargeError(maxBytes);
  }
  return icsText;
}

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
 * Checks whether an IPv4 or IPv6 literal belongs to loopback, private, link-local, or reserved space.
 */
export function isPrivateOrReservedIp(rawIp: string): boolean {
  const stripped = rawIp.trim().replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();
  const ipVer = net.isIP(stripped);
  if (ipVer === 0) return false;

  if (ipVer === 4) {
    const parts = stripped.split('.').map(Number);
    if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  // IPv6 checks
  if (stripped === '::' || stripped === '::1') return true;
  // IPv4-mapped dotted form (::ffff:127.0.0.1)
  if (stripped.startsWith('::ffff:')) {
    const rest = stripped.slice('::ffff:'.length);
    if (net.isIP(rest) === 4) {
      return isPrivateOrReservedIp(rest);
    }
    const hexPair = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(rest);
    if (hexPair) {
      const hi = parseInt(hexPair[1], 16);
      const lo = parseInt(hexPair[2], 16);
      const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      return isPrivateOrReservedIp(ipv4);
    }
  }
  // ULA fc00::/7 (fc.. or fd..) and link-local fe80::/10 (fe80..febf)
  const firstHextetMatch = /^([0-9a-f]{1,4}):/.exec(stripped);
  if (firstHextetMatch) {
    const firstWord = parseInt(firstHextetMatch[1], 16);
    if ((firstWord & 0xfe00) === 0xfc00) return true; // fc00::/7
    if ((firstWord & 0xffc0) === 0xfe80) return true; // fe80::/10
    if ((firstWord & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  }
  return false;
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
    throw new ExternalCalendarUrlError('URL de calendrier invalide.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ExternalCalendarUrlError('Seules les URL http://, https:// ou webcal:// sont autorisées.');
  }
  const host = parsed.hostname.toLowerCase();
  const bareHost = host.replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    isPrivateOrReservedIp(bareHost)
  ) {
    throw new ExternalCalendarUrlError('Adresse locale ou privée non autorisée.');
  }
  return parsed.toString();
}

export type DnsLookupAllFn = (
  hostname: string,
  options: { all: true }
) => Promise<Array<{ address: string; family: number }>>;

/**
 * Resolves external hostname DNS records and rejects any resolution targeting private, loopback, or link-local IPs.
 */
export async function assertPublicExternalHost(
  urlStr: string,
  lookupFn: DnsLookupAllFn = (h, opts) => dns.lookup(h, opts)
): Promise<void> {
  const parsed = new URL(urlStr);
  const bareHost = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (net.isIP(bareHost) !== 0) {
    if (isPrivateOrReservedIp(bareHost)) {
      throw new ExternalCalendarUrlError('Adresse locale ou privée non autorisée.');
    }
    return;
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = await lookupFn(bareHost, { all: true });
  } catch {
    throw new ExternalCalendarUrlError("Nom d'hôte introuvable ou inaccessible.");
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw new ExternalCalendarUrlError("Nom d'hôte introuvable ou inaccessible.");
  }

  for (const rec of records) {
    if (isPrivateOrReservedIp(rec.address)) {
      throw new ExternalCalendarUrlError('Adresse résolue privée ou locale non autorisée.');
    }
  }
}

/**
 * Fetches an external ICS feed safely: validates URL, checks DNS resolution against private networks,
 * follows at most 3 validated redirects, enforces timeout, and limits payload size.
 */
export async function fetchSafeExternalIcs(
  rawUrl: string,
  options: {
    timeoutMs?: number;
    maxBytes?: number;
    lookupFn?: DnsLookupAllFn;
  } = {}
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxBytes = options.maxBytes ?? MAX_ICS_BYTES;
  let currentUrl = validateExternalCalendarUrl(rawUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let hop = 0; hop <= 3; hop++) {
      await assertPublicExternalHost(currentUrl, options.lookupFn);
      const response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual',
        cache: 'no-store',
        headers: { 'User-Agent': 'DispoLive-Calendar-Sync/1.0' },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || hop === 3) {
          throw new ExternalCalendarUrlError('Trop de redirections ou redirection invalide.');
        }
        const resolvedRedirect = new URL(location, currentUrl).toString();
        currentUrl = validateExternalCalendarUrl(resolvedRedirect);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch ICS: ${response.statusText || response.status}`);
      }

      return await readLimitedIcsText(response, maxBytes);
    }
    throw new ExternalCalendarUrlError('Trop de redirections.');
  } finally {
    clearTimeout(timeout);
  }
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

        const icsText = await readLimitedIcsText(res);
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
