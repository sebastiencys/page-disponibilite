import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  calculateAvailability,
  getAnonymizedUpcomingSlots,
  getCalendarSummaries,
  formatTimeShort,
  getZonedDateParts,
  normalizeAppLang,
  normalizeProfileMode,
  sanitizeOptionalContactField,
  DEFAULT_SCHEDULE,
  DEFAULT_PROFILE,
  type CalendarEvent,
} from '../src/lib/availability.ts';
import { getSyncedCalendarEvents, hasEnvCalendar } from '../src/server/calendarSync.ts';
import { isRequestStudioAuthenticated } from '../src/server/studioAuth.ts';
import { computeSemanticWeakEtag, matchesIfNoneMatch } from '../src/server/etag.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, If-None-Match');
  res.setHeader('Access-Control-Expose-Headers', 'ETag');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  let now = new Date();
  const timeParam = req.query?.time;
  if (typeof timeParam === 'string') {
    const parsed = new Date(timeParam);
    if (!isNaN(parsed.getTime())) now = parsed;
  }
  const lang = normalizeAppLang(req.query?.lang, 'fr');
  const timezone = process.env.TIMEZONE || DEFAULT_SCHEDULE.timezone || 'Europe/Paris';
  const studioAuthed = isRequestStudioAuthenticated(req.headers);
  const forceRefresh =
    (req.query?.refresh === '1' || req.query?.refresh === 'true') && studioAuthed;

  let events: CalendarEvent[] = [];
  const synced = await getSyncedCalendarEvents(undefined, forceRefresh, now);
  if (synced.events && synced.events.length > 0) {
    events = synced.events;
  }

  const avail = calculateAvailability(now, DEFAULT_SCHEDULE, events, undefined, timezone, lang);
  const upcomingSlots = getAnonymizedUpcomingSlots(events, now, 8, DEFAULT_SCHEDULE, timezone, lang);
  const calendarSummaries = getCalendarSummaries(
    now,
    events,
    DEFAULT_SCHEDULE,
    timezone,
    synced.calendars.map(c => ({ id: c.id, label: c.label }))
  );

  const statusPayload = {
    now: now.toISOString(),
    timezone,
    lang,
    availability: avail,
    hasEnvCalendar: hasEnvCalendar(),
    calendars: calendarSummaries,
    envCalendars: studioAuthed ? synced.calendars : [],
    upcomingSlots,
    profile: {
      name: DEFAULT_PROFILE.name,
      role: DEFAULT_PROFILE.role,
      company: DEFAULT_PROFILE.company,
      email: sanitizeOptionalContactField(DEFAULT_PROFILE.email),
      bookingUrl: sanitizeOptionalContactField(DEFAULT_PROFILE.bookingUrl),
      mode: normalizeProfileMode(process.env.PROFILE_MODE ?? DEFAULT_PROFILE.mode, 'person'),
    },
  };
  const zonedNow = getZonedDateParts(now, timezone);
  const etag = computeSemanticWeakEtag({
    ...statusPayload,
    now: undefined,
    localMinute: formatTimeShort(now, timezone, lang),
    localDate: `${zonedNow.year}-${zonedNow.month}-${zonedNow.day}`,
  });
  res.setHeader('ETag', etag);
  if (matchesIfNoneMatch(req.headers['if-none-match'], etag)) {
    return res.status(304).end();
  }

  return res.status(200).json(statusPayload);
}
