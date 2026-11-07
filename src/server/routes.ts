/**
 * Server API routes for DispoLive.
 * Compatible with both Vite connect middleware (dev) and Express (prod).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { parse } from 'node:url';
import {
  calculateAvailability,
  DEFAULT_SCHEDULE,
  type ScheduleConfig,
  type CalendarEvent,
  type ManualOverride,
} from '../lib/availability.ts';
import {
  renderBadgeSvg,
  renderBadgePng,
  type BadgeStyle,
  type BadgeTheme,
} from '../lib/badgeRenderer.ts';
import { parseIcsEvents } from '../lib/icalParser.ts';
import {
  hasEnvCalendar,
  getSyncedCalendarEvents,
} from './calendarSync.ts';

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

// In-memory global state (seeded with realistic demo data for today)
export const globalStore: UserState = {
  name: 'Alexandre Martin',
  role: 'Consultant & Développeur Web',
  company: 'Digital Solutions',
  email: 'alexandre@example.com',
  bookingUrl: 'https://calendly.com',
  schedule: DEFAULT_SCHEDULE,
  override: { type: 'auto' },
  events: [],
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function resolveCurrentEvents(): Promise<CalendarEvent[]> {
  if (hasEnvCalendar() || globalStore.icsUrl) {
    const { events } = await getSyncedCalendarEvents(globalStore.icsUrl);
    if (events && events.length > 0) {
      return events;
    }
  }
  return globalStore.events;
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  // Calendar info endpoint (tells the client if CALENDAR_ICS_URL is set in env without leaking it)
  if (pathname === '/api/calendar-info') {
    const currentEvents = await resolveCurrentEvents();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        hasEnvCalendar: hasEnvCalendar(),
        eventCount: currentEvents.length,
      })
    );
    return true;
  }

  // Force refresh calendar endpoint
  if (pathname === '/api/calendar-refresh' && req.method === 'POST') {
    const { events, fromCache, lastSync } = await getSyncedCalendarEvents(globalStore.icsUrl, true);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: true,
        count: events.length,
        fromCache,
        lastSync: lastSync ? lastSync.toISOString() : null,
      })
    );
    return true;
  }

  const serverTimezone = process.env.TIMEZONE || globalStore.schedule.timezone || 'Europe/Paris';

  // 1. Dynamic SVG Badge
  if (pathname === '/api/badge.svg' || pathname === '/badge.svg') {
    let now = new Date();

    const currentEvents = await resolveCurrentEvents();
    const avail = calculateAvailability(
      now,
      globalStore.schedule,
      currentEvents,
      globalStore.override,
      serverTimezone
    );

    const svg = renderBadgeSvg(avail, {
      style: (query.style as BadgeStyle) || 'pill',
      theme: (query.theme as BadgeTheme) || 'light',
      name: (query.name as string) || globalStore.name,
      role: (query.role as string) || globalStore.role,
    });

    serveSvg(res, svg);
    return true;
  }

  // 2. Dynamic PNG Badge
  if (pathname === '/api/badge.png' || pathname === '/badge.png') {
    let now = new Date();
    const currentEvents = await resolveCurrentEvents();
    const avail = calculateAvailability(
      now,
      globalStore.schedule,
      currentEvents,
      globalStore.override,
      serverTimezone
    );

    const png = renderBadgePng(avail, {
      style: (query.style as BadgeStyle) || 'pill',
      theme: (query.theme as BadgeTheme) || 'light',
      name: (query.name as string) || globalStore.name,
      role: (query.role as string) || globalStore.role,
      company: (query.company as string) || globalStore.company,
    });

    servePng(res, png);
    return true;
  }

  // 3. Current Live Status (JSON)
  if (pathname === '/api/status') {
    const now = new Date();
    const currentEvents = await resolveCurrentEvents();
    const avail = calculateAvailability(
      now,
      globalStore.schedule,
      currentEvents,
      globalStore.override,
      serverTimezone
    );

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(
      JSON.stringify({
        now: now.toISOString(),
        timezone: serverTimezone,
        availability: avail,
        hasEnvCalendar: hasEnvCalendar(),
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

  // 4. Sync client state to server store
  if (pathname === '/api/sync' && req.method === 'POST') {
    try {
      const bodyStr = await readBody(req);
      const data = JSON.parse(bodyStr);
      if (data.name) globalStore.name = data.name;
      if (data.role) globalStore.role = data.role;
      if (data.company) globalStore.company = data.company;
      if (data.email) globalStore.email = data.email;
      if (data.bookingUrl) globalStore.bookingUrl = data.bookingUrl;
      // Override is locked to { type: 'auto' } for security & integrity
      globalStore.override = { type: 'auto' };
      if (data.icsUrl !== undefined) globalStore.icsUrl = data.icsUrl;

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, updated: new Date().toISOString() }));
      return true;
    } catch (err: any) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message || 'Invalid JSON' }));
      return true;
    }
  }

  // 5. Fetch & parse remote iCal link
  if (pathname === '/api/fetch-ics' && req.method === 'POST') {
    try {
      const bodyStr = await readBody(req);
      const { url } = JSON.parse(bodyStr);
      if (!url || typeof url !== 'string') {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'URL required' }));
        return true;
      }

      // Convert webcal:// to https://
      const fetchUrl = url.replace(/^webcal:\/\//i, 'https://');
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch ICS: ${response.statusText}`);
      }
      const icsText = await response.text();
      const events = parseIcsEvents(icsText);

      globalStore.events = events;
      globalStore.icsUrl = url;

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, count: events.length, events }));
      return true;
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message }));
      return true;
    }
  }

  // Not an API request handled here
  return false;
}

function serveSvg(res: ServerResponse, svgContent: string) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  // Email clients aggressive cache prevention
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.end(svgContent);
}

function servePng(res: ServerResponse, pngBuffer: Buffer) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Length', pngBuffer.length);
  // Email clients aggressive cache prevention
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.end(pngBuffer);
}
