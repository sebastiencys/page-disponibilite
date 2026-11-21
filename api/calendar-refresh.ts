import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSyncedCalendarEvents } from '../src/server/calendarSync.ts';
import { isRequestStudioAuthenticated } from '../src/server/studioAuth.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isRequestStudioAuthenticated(req.headers)) {
    return res.status(401).json({ error: 'Authentification Studio requise' });
  }

  const { events, fromCache, lastSync, calendars } = await getSyncedCalendarEvents(undefined, true);

  return res.status(200).json({
    success: true,
    count: events.length,
    fromCache,
    lastSync: lastSync ? lastSync.toISOString() : null,
    calendars,
  });
}
