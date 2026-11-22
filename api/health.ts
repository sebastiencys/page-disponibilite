import type { VercelRequest, VercelResponse } from '@vercel/node';
import { DEFAULT_SCHEDULE } from '../src/lib/availability.ts';
import { getSyncedCalendarEvents, hasEnvCalendar } from '../src/server/calendarSync.ts';
import { isRequestStudioAuthenticated } from '../src/server/studioAuth.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  const timezone = process.env.TIMEZONE || DEFAULT_SCHEDULE.timezone || 'Europe/Paris';
  const studioAuthed = isRequestStudioAuthenticated(req.headers);
  const synced = await getSyncedCalendarEvents(undefined, false);
  const allCalendarsHealthy = synced.calendars.every(c => c.ok);

  return res.status(200).json({
    ok: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    timezone,
    hasEnvCalendar: hasEnvCalendar(),
    calendarsCount: synced.calendars.length,
    allCalendarsHealthy,
    ...(studioAuthed ? { calendars: synced.calendars } : {}),
  });
}
