import type { VercelRequest, VercelResponse } from '@vercel/node';
import { parseIcsEvents } from '../src/lib/icalParser.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL required' });
    }

    const fetchUrl = url.replace(/^webcal:\/\//i, 'https://');
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch ICS: ${response.statusText}`);
    }
    const icsText = await response.text();
    const events = parseIcsEvents(icsText);

    return res.status(200).json({ success: true, count: events.length, events });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
