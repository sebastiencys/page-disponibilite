import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  calculateAvailability,
  getAnonymizedUpcomingSlots,
  DEFAULT_SCHEDULE,
  DEFAULT_PROFILE,
  type CalendarEvent,
} from '../src/lib/availability.ts';
import { getSyncedCalendarEvents, hasEnvCalendar } from '../src/server/calendarSync.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache');

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

  let events: CalendarEvent[] = [];
  const synced = await getSyncedCalendarEvents(undefined, false, now);
  if (synced.events && synced.events.length > 0) {
    events = synced.events;
  }

  const avail = calculateAvailability(now, DEFAULT_SCHEDULE, events, undefined, timezone);
  const upcomingSlots = getAnonymizedUpcomingSlots(events, now, 8, DEFAULT_SCHEDULE, timezone);

  return res.status(200).json({
    now: now.toISOString(),
    timezone,
    availability: avail,
    hasEnvCalendar: hasEnvCalendar(),
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
