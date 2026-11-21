import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  calculateAvailability,
  DEFAULT_SCHEDULE,
  DEFAULT_PROFILE,
  type ScheduleConfig,
  type CalendarEvent,
  type ManualOverride,
} from '../src/lib/availability.ts';
import {
  renderBadgeSvg,
  renderBadgePng,
  buildBadgeTextPayload,
  ensureFontsLoaded,
  type BadgeStyle,
  type BadgeTheme,
} from '../src/lib/badgeRenderer.ts';
import { getSyncedCalendarEvents } from '../src/server/calendarSync.ts';

const defaultEvents: CalendarEvent[] = [];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const query = req.query || {};
  const style = (query.style as BadgeStyle) || 'pill';
  const theme = (query.theme as BadgeTheme) || 'light';
  const sanitizeField = (val: unknown, fallback: string) => {
    if (typeof val !== 'string') return fallback;
    const trimmed = val.trim();
    return trimmed ? trimmed.slice(0, 120) : fallback;
  };
  const safeName = sanitizeField(query.name, DEFAULT_PROFILE.name);
  const safeRole = sanitizeField(query.role, DEFAULT_PROFILE.role);
  const safeCompany = sanitizeField(query.company, DEFAULT_PROFILE.company);

  // Determine format from query, URL or accept header
  let format = (typeof query.format === 'string' ? query.format : '').toLowerCase();
  if (!format) {
    if (req.url?.includes('.json')) format = 'json';
    else if (req.url?.includes('.svg')) format = 'svg';
    else if (req.url?.includes('.png')) format = 'png';
    else format = 'png'; // default to PNG for email signatures
  }

  let now = new Date();
  if (query.time && typeof query.time === 'string') {
    const parsedTime = new Date(query.time);
    if (!isNaN(parsedTime.getTime())) {
      now = parsedTime;
    }
  }
  let schedule = DEFAULT_SCHEDULE;
  let events = defaultEvents;
  let override: ManualOverride = { type: 'auto' };

  // Fetch from secure CALENDAR_ICS_URL environment variable if set
  const synced = await getSyncedCalendarEvents(undefined, false, now);
  if (synced.events && synced.events.length > 0) {
    events = synced.events;
  }

  // Calculate live availability (automatic truthful calendar & schedule evaluation)
  const timezone = process.env.TIMEZONE || schedule.timezone || 'Europe/Paris';
  const avail = calculateAvailability(now, schedule, events, override, timezone);

  // Set aggressive anti-cache headers for email clients
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (format === 'json') {
    const payload = buildBadgeTextPayload(avail, {
      name: safeName,
      role: safeRole,
      company: safeCompany,
      timezone,
      now,
    });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).send(JSON.stringify(payload, null, 2));
  }

  if (format === 'svg') {
    const svg = renderBadgeSvg(avail, {
      style,
      theme,
      name: safeName,
      role: safeRole,
      company: safeCompany,
    });
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    return res.status(200).send(svg);
  }

  // PNG
  await ensureFontsLoaded();
  const png = renderBadgePng(avail, {
    style,
    theme,
    name: safeName,
    role: safeRole,
    company: safeCompany,
  });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Length', png.length);
  return res.status(200).send(png);

}
