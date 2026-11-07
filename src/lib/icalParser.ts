/**
 * Lightweight RFC 5545 iCalendar (ICS) parser for calendar events.
 */

import type { CalendarEvent } from './availability.ts';

/**
 * Parses iCalendar datetime string (e.g., 20261109T143000Z, 20261109T143000, 20261109)
 */
export function parseIcsDate(dateStr: string): Date {
  const clean = dateStr.trim();

  // All day event YYYYMMDD
  if (/^\d{8}$/.test(clean)) {
    const y = parseInt(clean.substring(0, 4), 10);
    const m = parseInt(clean.substring(4, 6), 10) - 1;
    const d = parseInt(clean.substring(6, 8), 10);
    return new Date(y, m, d, 0, 0, 0);
  }

  // Format: YYYYMMDDTHHmmss or YYYYMMDDTHHmmssZ
  const match = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?/);
  if (match) {
    const [_, y, mo, d, h, mi, s, isUtc] = match;
    if (isUtc) {
      return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
    }
    return new Date(+y, +mo - 1, +d, +h, +mi, +s);
  }

  // Fallback to standard Date parse
  const fallback = new Date(dateStr);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
}

/**
 * Unfolds folded lines in ICS text (lines starting with space or tab)
 */
function unfoldIcs(icsText: string): string[] {
  const rawLines = icsText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const unfolded: string[] = [];

  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }

  return unfolded;
}

/**
 * Parses raw ICS string into CalendarEvent objects
 */
export function parseIcsEvents(icsText: string): CalendarEvent[] {
  const lines = unfoldIcs(icsText);
  const events: CalendarEvent[] = [];

  let inEvent = false;
  let curEvent: Partial<CalendarEvent> = {};
  let curTransp = 'OPAQUE';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      inEvent = true;
      curEvent = {
        id: `event-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title: 'Événement',
        isBusy: true,
      };
      curTransp = 'OPAQUE';
      continue;
    }

    if (trimmed === 'END:VEVENT') {
      inEvent = false;
      if (curEvent.start && curEvent.end) {
        // If TRANSP:TRANSPARENT, it is marked as Free
        curEvent.isBusy = curTransp !== 'TRANSPARENT';
        events.push(curEvent as CalendarEvent);
      }
      curEvent = {};
      continue;
    }

    if (!inEvent) continue;

    // Parse KEY;PARAMS:VALUE or KEY:VALUE
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const keyPart = trimmed.slice(0, colonIdx);
    const value = trimmed.slice(colonIdx + 1);
    const mainKey = keyPart.split(';')[0].toUpperCase();

    switch (mainKey) {
      case 'UID':
        curEvent.id = value;
        break;
      case 'SUMMARY':
        curEvent.title = value.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' ');
        break;
      case 'DTSTART':
        curEvent.start = parseIcsDate(value).toISOString();
        if (keyPart.includes('VALUE=DATE')) {
          curEvent.isAllDay = true;
        }
        break;
      case 'DTEND':
        curEvent.end = parseIcsDate(value).toISOString();
        break;
      case 'TRANSP':
        curTransp = value.toUpperCase();
        break;
    }
  }

  return events;
}
