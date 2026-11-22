import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  calculateAvailability,
  getAnonymizedUpcomingSlots,
  getCalendarSummaries,
  formatTimeShort,
  getZonedDateParts,
  normalizeAppLang,
  normalizeProfileMode,
  resolveProfileFromEnv,
  resolveScheduleFromEnv,
  resolveEffectiveTimezone,
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
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

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
  const schedule = resolveScheduleFromEnv(process.env, DEFAULT_SCHEDULE);
  const timezone = resolveEffectiveTimezone(process.env, schedule);
  const studioAuthed = isRequestStudioAuthenticated(req.headers);
  const forceRefresh =
    (req.query?.refresh === '1' || req.query?.refresh === 'true') && studioAuthed;

  let events: CalendarEvent[] = [];
  const synced = await getSyncedCalendarEvents(undefined, forceRefresh, now);
  if (synced.events && synced.events.length > 0) {
    events = synced.events;
  }

  const effectiveProfile = resolveProfileFromEnv(process.env, DEFAULT_PROFILE);
  const mode = normalizeProfileMode(req.query?.mode, effectiveProfile.mode ?? 'person');

  const avail = calculateAvailability(now, schedule, events, undefined, timezone, lang, mode);
  const upcomingSlots = getAnonymizedUpcomingSlots(events, now, 8, schedule, timezone, lang);
  const calendarSummaries = getCalendarSummaries(
    now,
    events,
    schedule,
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
    schedule,
    profile: {
      name: effectiveProfile.name,
      role: effectiveProfile.role,
      company: effectiveProfile.company,
      email: effectiveProfile.email,
      bookingUrl: effectiveProfile.bookingUrl,
      mode,
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
