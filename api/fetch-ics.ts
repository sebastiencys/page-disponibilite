import type { VercelRequest, VercelResponse } from '@vercel/node';
import { DEFAULT_SCHEDULE } from '../src/lib/availability.ts';
import { parseIcsEvents } from '../src/lib/icalParser.ts';
import { isRequestStudioAuthenticated } from '../src/server/studioAuth.ts';
import {
  ExternalCalendarUrlError,
  IcsTooLargeError,
  fetchSafeExternalIcs,
} from '../src/server/calendarSync.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isRequestStudioAuthenticated(req.headers)) {
    return res.status(401).json({ error: 'Authentification Studio requise' });
  }

  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL requise' });
    }

    const icsText = await fetchSafeExternalIcs(url);
    const timezone = process.env.TIMEZONE || DEFAULT_SCHEDULE.timezone || 'Europe/Paris';
    const events = parseIcsEvents(icsText, timezone);

    return res.status(200).json({ success: true, count: events.length });
  } catch (err: any) {
    const status =
      err instanceof IcsTooLargeError
        ? 413
        : err instanceof ExternalCalendarUrlError
        ? 400
        : 500;
    return res.status(status).json({ error: err.message });
  }
}
