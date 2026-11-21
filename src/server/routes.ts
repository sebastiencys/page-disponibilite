/**
 * Server API routes for DispoLive.
 * Compatible with both Vite connect middleware (dev) and Express (prod).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { parse } from 'node:url';
import {
  calculateAvailability,
  getAnonymizedUpcomingSlots,
  getCalendarSummaries,
  DEFAULT_SCHEDULE,
  DEFAULT_PROFILE,
  type ScheduleConfig,
  type CalendarEvent,
  type ManualOverride,
} from '../lib/availability.ts';
import {
  renderBadgeSvg,
  renderBadgePng,
  buildBadgeTextPayload,
  normalizeBadgeStyle,
  normalizeBadgeTheme,
  ensureFontsLoaded,
  type BadgeStyle,
  type BadgeTheme,
} from '../lib/badgeRenderer.ts';
import { parseIcsEvents } from '../lib/icalParser.ts';
import {
  hasEnvCalendar,
  getSyncedCalendarEvents,
  validateExternalCalendarUrl,
  type SyncedCalendarInfo,
} from './calendarSync.ts';
import {
  isStudioPasswordRequired,
  verifyStudioPassword,
  createStudioSessionToken,
  isRequestStudioAuthenticated,
  buildSessionCookieHeader,
  buildClearSessionCookieHeader,
  extractClientIp,
  checkAuthRateLimit,
  recordAuthFailure,
  clearAuthFailures,
} from './studioAuth.ts';

export interface UserState {
  name: string;
  role: string;
  company: string;
  email: string;
  bookingUrl: string;
  schedule: ScheduleConfig;
  events: CalendarEvent[];
  override: ManualOverride;
  icsUrl?: string;
}

// In-memory global state (seeded from read-only personal.json & schedule.json)
export const globalStore: UserState = {
  name: DEFAULT_PROFILE.name,
  role: DEFAULT_PROFILE.role,
  company: DEFAULT_PROFILE.company,
  email: DEFAULT_PROFILE.email,
  bookingUrl: DEFAULT_PROFILE.bookingUrl,
  schedule: DEFAULT_SCHEDULE,
  override: { type: 'auto' },
  events: [],
};

const MAX_JSON_BODY_BYTES = 64 * 1024;

class PayloadTooLargeError extends Error {
  statusCode = 413;
  constructor() {
    super('Requête trop volumineuse (max 64 Ko).');
  }
}

function readBody(req: IncomingMessage, maxBytes = MAX_JSON_BODY_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    let totalBytes = 0;
    const chunks: Buffer[] = [];
    let aborted = false;

    req.on('data', (chunk: Buffer | string) => {
      if (aborted) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
      totalBytes += buf.length;
      if (totalBytes > maxBytes) {
        aborted = true;
        reject(new PayloadTooLargeError());
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => {
      if (!aborted) {
        resolve(Buffer.concat(chunks).toString('utf8'));
      }
    });
    req.on('error', err => {
      if (!aborted) reject(err);
    });
  });
}

async function resolveCurrentCalendarState(
  targetTime?: Date,
  forceRefresh = false
): Promise<{ events: CalendarEvent[]; calendars: SyncedCalendarInfo[] }> {
  if (hasEnvCalendar() || globalStore.icsUrl) {
    const { events, calendars } = await getSyncedCalendarEvents(
      globalStore.icsUrl,
      forceRefresh,
      targetTime
    );
    if (events && events.length > 0) {
      return { events, calendars };
    }
    if (calendars.length > 0) {
      const anyOk = calendars.some(c => c.ok);
      return { events: anyOk ? events : globalStore.events, calendars };
    }
  }
  return { events: globalStore.events, calendars: [] };
}

async function resolveCurrentEvents(targetTime?: Date): Promise<CalendarEvent[]> {
  const { events } = await resolveCurrentCalendarState(targetTime);
  return events;
}

export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const urlObj = parse(req.url || '', true);
  const pathname = urlObj.pathname || '';
  const query = urlObj.query;

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  const isHead = req.method === 'HEAD';

  // Studio authentication endpoint (password stored in process.env.STUDIO_PASSWORD)
  if (pathname === '/api/studio-auth') {
    const passwordRequired = isStudioPasswordRequired();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      const authenticated = isRequestStudioAuthenticated(req.headers);
      res.statusCode = 200;
      res.end(JSON.stringify({ passwordRequired, authenticated }));
      return true;
    }

    if (req.method === 'DELETE') {
      res.setHeader('Set-Cookie', buildClearSessionCookieHeader());
      res.statusCode = 200;
      res.end(JSON.stringify({ authenticated: false, passwordRequired }));
      return true;
    }

    if (req.method === 'POST') {
      if (!passwordRequired) {
        res.statusCode = 200;
        res.end(JSON.stringify({ authenticated: true, passwordRequired: false, token: '' }));
        return true;
      }

      const clientIp = extractClientIp(req.headers, req.socket?.remoteAddress);
      const rateCheck = checkAuthRateLimit(clientIp);
      if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        res.statusCode = 429;
        res.end(
          JSON.stringify({
            authenticated: false,
            passwordRequired: true,
            error: `Trop de tentatives. Réessayez dans ${rateCheck.retryAfterSeconds} s.`,
          })
        );
        return true;
      }

      try {
        const bodyStr = await readBody(req);
        const data = JSON.parse(bodyStr || '{}');
        const candidate = typeof data.password === 'string' ? data.password : '';
        if (!verifyStudioPassword(candidate)) {
          const failure = recordAuthFailure(clientIp);
          if (!failure.allowed) {
            res.setHeader('Retry-After', String(failure.retryAfterSeconds));
            res.statusCode = 429;
            res.end(
              JSON.stringify({
                authenticated: false,
                passwordRequired: true,
                error: `Trop de tentatives. Réessayez dans ${failure.retryAfterSeconds} s.`,
              })
            );
            return true;
          }
          res.statusCode = 401;
          res.end(
            JSON.stringify({
              authenticated: false,
              passwordRequired: true,
              error: 'Mot de passe incorrect.',
            })
          );
          return true;
        }

        clearAuthFailures(clientIp);
        const token = createStudioSessionToken();
        res.setHeader('Set-Cookie', buildSessionCookieHeader(token));
        res.statusCode = 200;
        res.end(JSON.stringify({ authenticated: true, passwordRequired: true, token }));
        return true;
      } catch (err: any) {
        res.statusCode = err instanceof PayloadTooLargeError ? 413 : 400;
        res.end(JSON.stringify({ error: err instanceof PayloadTooLargeError ? err.message : 'Requête invalide' }));
        return true;
      }
    }
  }

  if (pathname === '/api/studio-logout' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Set-Cookie', buildClearSessionCookieHeader());
    res.statusCode = 200;
    res.end(JSON.stringify({ authenticated: false, passwordRequired: isStudioPasswordRequired() }));
    return true;
  }

  // Calendar info endpoint (tells the client if CALENDAR_ICS_URL* are set in env without leaking URLs)
  if (pathname === '/api/calendar-info') {
    const { events, calendars } = await resolveCurrentCalendarState();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        hasEnvCalendar: hasEnvCalendar(),
        eventCount: events.length,
        calendars,
      })
    );
    return true;
  }

  // Force refresh calendar endpoint (Studio-protected when STUDIO_PASSWORD is set)
  if (pathname === '/api/calendar-refresh' && req.method === 'POST') {
    if (!isRequestStudioAuthenticated(req.headers)) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Authentification Studio requise' }));
      return true;
    }
    const { events, fromCache, lastSync, calendars } = await getSyncedCalendarEvents(
      globalStore.icsUrl,
      true
    );
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: true,
        count: events.length,
        fromCache,
        lastSync: lastSync ? lastSync.toISOString() : null,
        calendars,
      })
    );
    return true;
  }

  const serverTimezone = process.env.TIMEZONE || globalStore.schedule.timezone || 'Europe/Paris';

  // Healthcheck / ICS warm-up endpoint (anonymized)
  if (pathname === '/api/health') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    if (isHead) {
      res.end();
      return true;
    }
    const { calendars } = await resolveCurrentCalendarState();
    res.end(
      JSON.stringify({
        ok: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        timezone: serverTimezone,
        hasEnvCalendar: hasEnvCalendar(),
        calendarsCount: calendars.length,
        calendars,
      })
    );
    return true;
  }

  const badgeStyle = normalizeBadgeStyle(query.style, 'pill');
  const badgeTheme = normalizeBadgeTheme(query.theme, 'light');
  const badgeName = sanitizeQueryField(query.name, globalStore.name);
  const badgeRole = sanitizeQueryField(query.role, globalStore.role);
  const badgeCompany = sanitizeQueryField(query.company, globalStore.company);
  const queryFormat = typeof query.format === 'string' ? query.format.trim().toLowerCase() : '';

  // 1. Dynamic SVG Badge
  if (
    pathname === '/api/badge.svg' ||
    pathname === '/badge.svg' ||
    ((pathname === '/api/badge' || pathname === '/badge') && queryFormat === 'svg')
  ) {
    if (isHead) {
      serveSvg(res, '', true);
      return true;
    }

    let now = new Date();
    if (query.time && typeof query.time === 'string') {
      const parsed = new Date(query.time);
      if (!isNaN(parsed.getTime())) now = parsed;
    }

    const currentEvents = await resolveCurrentEvents(now);
    const avail = calculateAvailability(
      now,
      globalStore.schedule,
      currentEvents,
      globalStore.override,
      serverTimezone
    );

    const svg = renderBadgeSvg(avail, {
      style: badgeStyle,
      theme: badgeTheme,
      name: badgeName,
      role: badgeRole,
      company: badgeCompany,
    });

    serveSvg(res, svg);
    return true;
  }

  // 2. Dynamic JSON Badge (text version of the badge info)
  if (
    pathname === '/api/badge.json' ||
    pathname === '/badge.json' ||
    ((pathname === '/api/badge' || pathname === '/badge') && queryFormat === 'json')
  ) {
    if (isHead) {
      serveJson(res, null, true);
      return true;
    }

    let now = new Date();
    if (query.time && typeof query.time === 'string') {
      const parsed = new Date(query.time);
      if (!isNaN(parsed.getTime())) now = parsed;
    }

    const { events: currentEvents, calendars: syncedCalendars } =
      await resolveCurrentCalendarState(now);
    const avail = calculateAvailability(
      now,
      globalStore.schedule,
      currentEvents,
      globalStore.override,
      serverTimezone
    );
    const calendarSummaries = getCalendarSummaries(
      now,
      currentEvents,
      globalStore.schedule,
      serverTimezone,
      syncedCalendars.map(c => ({ id: c.id, label: c.label }))
    );

    const payload = buildBadgeTextPayload(avail, {
      name: badgeName,
      role: badgeRole,
      company: badgeCompany,
      timezone: serverTimezone,
      now,
      calendars: calendarSummaries,
    });

    serveJson(res, payload);
    return true;
  }

  // 3. Dynamic PNG Badge (also default when calling /api/badge without extension)
  if (
    pathname === '/api/badge.png' ||
    pathname === '/badge.png' ||
    pathname === '/api/badge' ||
    pathname === '/badge'
  ) {
    if (isHead) {
      servePng(res, Buffer.alloc(0), true);
      return true;
    }

    let now = new Date();
    if (query.time && typeof query.time === 'string') {
      const parsed = new Date(query.time);
      if (!isNaN(parsed.getTime())) now = parsed;
    }
    const currentEvents = await resolveCurrentEvents(now);
    const avail = calculateAvailability(
      now,
      globalStore.schedule,
      currentEvents,
      globalStore.override,
      serverTimezone
    );

    await ensureFontsLoaded();
    const png = renderBadgePng(avail, {
      style: badgeStyle,
      theme: badgeTheme,
      name: badgeName,
      role: badgeRole,
      company: badgeCompany,
    });

    servePng(res, png);
    return true;
  }

  // 4. Current Live Status (JSON) — also supports ?time=<ISO> for simulation and ?refresh=1 (Studio-authenticated)
  if (pathname === '/api/status') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    if (isHead) {
      res.end();
      return true;
    }

    let now = new Date();
    if (query.time && typeof query.time === 'string') {
      const parsed = new Date(query.time);
      if (!isNaN(parsed.getTime())) now = parsed;
    }
    const forceRefresh =
      (query.refresh === '1' || query.refresh === 'true') &&
      isRequestStudioAuthenticated(req.headers);

    const { events: currentEvents, calendars: syncedCalendars } =
      await resolveCurrentCalendarState(now, forceRefresh);
    const avail = calculateAvailability(
      now,
      globalStore.schedule,
      currentEvents,
      globalStore.override,
      serverTimezone
    );
    const upcomingSlots = getAnonymizedUpcomingSlots(
      currentEvents,
      now,
      8,
      globalStore.schedule,
      serverTimezone
    );
    const calendarSummaries = getCalendarSummaries(
      now,
      currentEvents,
      globalStore.schedule,
      serverTimezone,
      syncedCalendars.map(c => ({ id: c.id, label: c.label }))
    );

    res.end(
      JSON.stringify({
        now: now.toISOString(),
        timezone: serverTimezone,
        availability: avail,
        hasEnvCalendar: hasEnvCalendar(),
        calendars: calendarSummaries,
        envCalendars: syncedCalendars,
        upcomingSlots,
        profile: {
          name: globalStore.name,
          role: globalStore.role,
          company: globalStore.company,
          email: globalStore.email,
          bookingUrl: globalStore.bookingUrl,
        },
      })
    );
    return true;
  }

  // 4. Sync client state to server store (profile is read-only from personal.json)
  if (pathname === '/api/sync' && req.method === 'POST') {
    if (!isRequestStudioAuthenticated(req.headers)) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Authentification Studio requise' }));
      return true;
    }
    try {
      const bodyStr = await readBody(req);
      const data = JSON.parse(bodyStr);
      // Profile fields are strictly read-only and loaded from config/personal.json
      // Override is locked to { type: 'auto' } for security & integrity
      globalStore.override = { type: 'auto' };
      if (data.icsUrl !== undefined) globalStore.icsUrl = data.icsUrl;

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, updated: new Date().toISOString() }));
      return true;
    } catch (err: any) {
      res.statusCode = err instanceof PayloadTooLargeError ? 413 : 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message || 'Invalid JSON' }));
      return true;
    }
  }

  // 5. Fetch & parse remote iCal link
  if (pathname === '/api/fetch-ics' && req.method === 'POST') {
    if (!isRequestStudioAuthenticated(req.headers)) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Authentification Studio requise' }));
      return true;
    }
    try {
      const bodyStr = await readBody(req);
      const { url } = JSON.parse(bodyStr);
      if (!url || typeof url !== 'string') {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'URL required' }));
        return true;
      }

      const fetchUrl = validateExternalCalendarUrl(url);
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch ICS: ${response.statusText}`);
      }
      const icsText = await response.text();
      const events = parseIcsEvents(icsText, serverTimezone);

      globalStore.events = events;
      globalStore.icsUrl = url;

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, count: events.length, events }));
      return true;
    } catch (err: any) {
      res.statusCode = err instanceof PayloadTooLargeError ? 413 : 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message }));
      return true;
    }
  }

  // Not an API request handled here
  return false;
}

function serveSvg(res: ServerResponse, svgContent: string, headOnly = false) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  // Email clients aggressive cache prevention
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.end(headOnly ? undefined : svgContent);
}

function servePng(res: ServerResponse, pngBuffer: Buffer, headOnly = false) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'image/png');
  if (!headOnly) {
    res.setHeader('Content-Length', pngBuffer.length);
  }
  // Email clients aggressive cache prevention
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.end(headOnly ? undefined : pngBuffer);
}

function sanitizeQueryField(val: unknown, fallback: string, maxLen = 120): string {
  if (typeof val !== 'string') return fallback;
  const trimmed = val.trim();
  return trimmed ? trimmed.slice(0, maxLen) : fallback;
}

function serveJson(res: ServerResponse, payload: unknown, headOnly = false) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.end(headOnly ? undefined : JSON.stringify(payload, null, 2));
}
