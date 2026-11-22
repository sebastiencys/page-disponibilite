import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  calculateAvailability,
  getCalendarSummaries,
  normalizeAppLang,
  normalizeProfileMode,
  resolveProfileFromEnv,
  resolveScheduleFromEnv,
  resolveEffectiveTimezone,
  DEFAULT_SCHEDULE,
  DEFAULT_PROFILE,
  type CalendarEvent,
  type ManualOverride,
} from '../src/lib/availability.ts';
import {
  renderBadgeSvg,
  renderBadgePng,
  buildBadgeTextPayload,
  normalizeBadgeStyle,
  normalizeBadgeTheme,
  ensureFontsLoaded,
} from '../src/lib/badgeRenderer.ts';
import { getSyncedCalendarEvents } from '../src/server/calendarSync.ts';
import { computeSemanticWeakEtag, matchesIfNoneMatch } from '../src/server/etag.ts';

const defaultEvents: CalendarEvent[] = [];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, If-None-Match');
  res.setHeader('Access-Control-Expose-Headers', 'ETag');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const query = req.query || {};
  const style = normalizeBadgeStyle(query.style, 'pill');
  const theme = normalizeBadgeTheme(query.theme, 'light');
  const lang = normalizeAppLang(query.lang, 'fr');
  const effectiveProfile = resolveProfileFromEnv(process.env, DEFAULT_PROFILE);
  const mode = normalizeProfileMode(query.mode, effectiveProfile.mode ?? 'person');
  const sanitizeField = (val: unknown, fallback: string) => {
    if (typeof val !== 'string') return fallback;
    const trimmed = val.trim();
    return trimmed ? trimmed.slice(0, 120) : fallback;
  };
  const safeName = sanitizeField(query.name, effectiveProfile.name);
  const safeRole = sanitizeField(query.role, effectiveProfile.role);
  const safeCompany = sanitizeField(query.company, effectiveProfile.company);

  // Determine format from query, URL or accept header
  let format = (typeof query.format === 'string' ? query.format : '').toLowerCase();
  if (!format) {
    if (req.url?.includes('.json')) format = 'json';
    else if (req.url?.includes('.svg')) format = 'svg';
    else if (req.url?.includes('.png')) format = 'png';
    else format = 'png'; // default to PNG for email signatures
  }

  // Set aggressive anti-cache headers for email clients
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'HEAD') {
    if (format === 'json') res.setHeader('Content-Type', 'application/json; charset=utf-8');
    else if (format === 'svg') res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    else res.setHeader('Content-Type', 'image/png');
    return res.status(200).end();
  }

  let now = new Date();
  if (query.time && typeof query.time === 'string') {
    const parsedTime = new Date(query.time);
    if (!isNaN(parsedTime.getTime())) {
      now = parsedTime;
    }
  }
  const schedule = resolveScheduleFromEnv(process.env, DEFAULT_SCHEDULE);
  let events = defaultEvents;
  const override: ManualOverride = { type: 'auto' };

  // Fetch from secure CALENDAR_ICS_URL* environment variables if set
  const synced = await getSyncedCalendarEvents(undefined, false, now);
  if (synced.events && synced.events.length > 0) {
    events = synced.events;
  }

  // Calculate live availability (automatic truthful calendar & schedule evaluation)
  const timezone = resolveEffectiveTimezone(process.env, schedule);
  const avail = calculateAvailability(now, schedule, events, override, timezone, lang, mode);

  if (format === 'json') {
    const calendarSummaries = getCalendarSummaries(
      now,
      events,
      schedule,
      timezone,
      synced.calendars.map(c => ({ id: c.id, label: c.label }))
    );
    const payload = buildBadgeTextPayload(avail, {
      name: safeName,
      role: safeRole,
      company: safeCompany,
      timezone,
      now,
      lang,
      calendars: calendarSummaries,
    });
    const etag = computeSemanticWeakEtag({ ...payload, updatedAt: undefined });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('ETag', etag);
    if (matchesIfNoneMatch(req.headers['if-none-match'], etag)) {
      return res.status(304).end();
    }
    return res.status(200).send(JSON.stringify(payload, null, 2));
  }

  if (format === 'svg' || format === 'png') {
    const etag = computeSemanticWeakEtag({
      format,
      style,
      theme,
      lang,
      name: safeName,
      role: safeRole,
      company: safeCompany,
      status: avail.status,
      state: avail.state,
      isWorkTime: avail.isWorkTime,
      title: avail.title,
      subtitle: avail.subtitle,
      badgeColor: avail.badgeColor,
      dotColor: avail.dotColor,
      todayAppointmentsCount: avail.todayAppointmentsCount ?? 0,
      todayAllDayAppointmentsCount: avail.todayAllDayAppointmentsCount ?? 0,
    });
    res.setHeader(
      'Content-Type',
      format === 'svg' ? 'image/svg+xml; charset=utf-8' : 'image/png'
    );
    res.setHeader('ETag', etag);
    if (matchesIfNoneMatch(req.headers['if-none-match'], etag)) {
      return res.status(304).end();
    }
  }

  if (format === 'svg') {
    const svg = renderBadgeSvg(avail, {
      style,
      theme,
      name: safeName,
      role: safeRole,
      company: safeCompany,
      lang,
    });
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
    lang,
  });
  res.setHeader('Content-Length', png.length);
  return res.status(200).send(png);
}
