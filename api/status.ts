import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  calculateAvailability,
  getAnonymizedUpcomingSlots,
  getCalendarSummaries,
  DEFAULT_SCHEDULE,
  DEFAULT_PROFILE,
  type CalendarEvent,
} from '../src/lib/availability.ts';
import { getSyncedCalendarEvents, hasEnvCalendar } from '../src/server/calendarSync.ts';
import { isRequestStudioAuthenticated } from '../src/server/studioAuth.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  let now = new Date();
  const timeParam = req.query?.time;
  if (typeof timeParam === 'string') {
    const parsed = new Date(timeParam);
    if (!isNaN(parsed.getTime())) now = parsed;
  }
  const timezone = process.env.TIMEZONE || DEFAULT_SCHEDULE.timezone || 'Europe/Paris';
  const forceRefresh =
    (req.query?.refresh === '1' || req.query?.refresh === 'true') &&
    isRequestStudioAuthenticated(req.headers);

  let events: CalendarEvent[] = [];
  const synced = await getSyncedCalendarEvents(undefined, forceRefresh, now);
  if (synced.events && synced.events.length > 0) {
    events = synced.events;
  }

  const avail = calculateAvailability(now, DEFAULT_SCHEDULE, events, undefined, timezone);
  const upcomingSlots = getAnonymizedUpcomingSlots(events, now, 8, DEFAULT_SCHEDULE, timezone);
  const calendarSummaries = getCalendarSummaries(
    now,
    events,
    DEFAULT_SCHEDULE,
    timezone,
    synced.calendars.map(c => ({ id: c.id, label: c.label }))
  );

  return res.status(200).json({
    now: now.toISOString(),
    timezone,
    availability: avail,
    hasEnvCalendar: hasEnvCalendar(),
    calendars: calendarSummaries,
    envCalendars: synced.calendars,
    upcomingSlots,
    profile: {
      name: DEFAULT_PROFILE.name,
      role: DEFAULT_PROFILE.role,
      company: DEFAULT_PROFILE.company,
      email: DEFAULT_PROFILE.email,
      bookingUrl: DEFAULT_PROFILE.bookingUrl,
    },
  });
}
