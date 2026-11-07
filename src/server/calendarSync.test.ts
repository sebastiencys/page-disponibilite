import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasEnvCalendar,
  getCalendarUrl,
  getSyncedCalendarEvents,
} from './calendarSync.ts';

test('hasEnvCalendar returns false when env var is not set', () => {
  const orig = process.env.CALENDAR_ICS_URL;
  delete process.env.CALENDAR_ICS_URL;
  assert.equal(hasEnvCalendar(), false);
  process.env.CALENDAR_ICS_URL = orig;
});

test('hasEnvCalendar returns true when env var is provided', () => {
  const orig = process.env.CALENDAR_ICS_URL;
  process.env.CALENDAR_ICS_URL = 'https://calendar.google.com/calendar/ical/test/basic.ics';
  assert.equal(hasEnvCalendar(), true);
  process.env.CALENDAR_ICS_URL = orig;
});

test('getCalendarUrl prioritizes process.env.CALENDAR_ICS_URL over fallbackUrl', () => {
  const orig = process.env.CALENDAR_ICS_URL;
  process.env.CALENDAR_ICS_URL = 'https://secret.com/calendar.ics';
  assert.equal(getCalendarUrl('https://fallback.com/cal.ics'), 'https://secret.com/calendar.ics');

  delete process.env.CALENDAR_ICS_URL;
  assert.equal(getCalendarUrl('https://fallback.com/cal.ics'), 'https://fallback.com/cal.ics');
  process.env.CALENDAR_ICS_URL = orig;
});
