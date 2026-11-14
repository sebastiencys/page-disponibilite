import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAvailability,
  DEFAULT_SCHEDULE,
  DEFAULT_PROFILE,
  getNextWorkStart,
  createDateInTimezone,
  getZonedDateParts,
  type CalendarEvent,
  type ScheduleConfig,
} from './availability.ts';

// Helper to specify exact wall-clock time in Europe/Paris (CET = UTC+1 in November)
const parisDate = (dateTimeStr: string) => new Date(`${dateTimeStr}+01:00`);

test('detects off-hours on weekend (Sunday)', () => {
  // Sunday 14:00 Paris
  const sunday = parisDate('2026-11-08T14:00:00');
  const result = calculateAvailability(sunday, DEFAULT_SCHEDULE, []);
  assert.equal(result.status, 'OFF_HOURS');
  assert.equal(result.state, 'off');
  assert.equal(result.isWorkTime, false);
  assert.match(result.subtitle, /Demain|lundi/i);
});

test('detects off-hours before workday begins on Monday', () => {
  // Monday 07:30 Paris
  const mondayEarly = parisDate('2026-11-09T07:30:00');
  const result = calculateAvailability(mondayEarly, DEFAULT_SCHEDULE, []);
  assert.equal(result.status, 'OFF_HOURS');
  assert.equal(result.state, 'off');
  assert.match(result.subtitle, /09h00/);
});

test('detects available during normal workday without events', () => {
  // Monday 10:15 Paris
  const mondayMid = parisDate('2026-11-09T10:15:00');
  const result = calculateAvailability(mondayMid, DEFAULT_SCHEDULE, []);
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.state, 'available');
  assert.equal(result.badgeColor, '#10B981');
  assert.match(result.subtitle, /Jusqu'à/);
});

test('detects lunch break during scheduled hours in Paris timezone', () => {
  // Monday 13:00 in Paris (Lunch is 12:30 - 13:30)
  const mondayLunch = parisDate('2026-11-09T13:00:00');
  const result = calculateAvailability(mondayLunch, DEFAULT_SCHEDULE, []);
  assert.equal(result.status, 'LUNCH');
  assert.equal(result.state, 'away');
  assert.match(result.subtitle, /13h30/);
});

test('correctly converts UTC server timestamp to Europe/Paris local work hours', () => {
  // 08:30 UTC is 09:30 in Paris (workday started at 09:00 Paris)
  const utcNow = new Date('2026-11-09T08:30:00.000Z');
  const result = calculateAvailability(utcNow, DEFAULT_SCHEDULE, [], undefined, 'Europe/Paris');
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.state, 'available');
});

test('detects busy when currently in a calendar appointment', () => {
  // Monday 14:30 in Paris, meeting from 14:00 to 15:00 in Paris
  const mondayMeetingTime = parisDate('2026-11-09T14:30:00');
  const events: CalendarEvent[] = [
    {
      id: '1',
      title: 'Point d équipe',
      start: parisDate('2026-11-09T14:00:00').toISOString(),
      end: parisDate('2026-11-09T15:00:00').toISOString(),
      isBusy: true,
    },
  ];
  const result = calculateAvailability(mondayMeetingTime, DEFAULT_SCHEDULE, events);
  assert.equal(result.status, 'BUSY');
  assert.equal(result.state, 'busy');
  assert.equal(result.badgeColor, '#EF4444');
  assert.match(result.subtitle, /15h00/);
});

test('handles consecutive chained meetings to display true next free time', () => {
  // Monday 14:30 in Paris, meeting 1 ends at 15:00, meeting 2 runs from 15:00 to 16:30
  const now = parisDate('2026-11-09T14:30:00');
  const events: CalendarEvent[] = [
    {
      id: '1',
      title: 'RDV Client 1',
      start: parisDate('2026-11-09T14:00:00').toISOString(),
      end: parisDate('2026-11-09T15:00:00').toISOString(),
      isBusy: true,
    },
    {
      id: '2',
      title: 'RDV Client 2',
      start: parisDate('2026-11-09T15:00:00').toISOString(),
      end: parisDate('2026-11-09T16:30:00').toISOString(),
      isBusy: true,
    },
  ];
  const result = calculateAvailability(now, DEFAULT_SCHEDULE, events);
  assert.equal(result.status, 'BUSY');
  assert.match(result.subtitle, /16h30/);
});

test('manual override takes precedence over schedule and events', () => {
  const mondayMid = parisDate('2026-11-09T10:15:00');
  const result = calculateAvailability(mondayMid, DEFAULT_SCHEDULE, [], {
    type: 'dnd',
    note: 'Session Focus',
    expiresAt: parisDate('2026-11-09T12:00:00').toISOString(),
  });
  assert.equal(result.status, 'OVERRIDE_DND');
  assert.equal(result.title, 'Session Focus');
  assert.match(result.subtitle, /12h00/);
});

test('event scheduled on a weekend or off-hours does not mark user as busy, remains off-hours', () => {
  // Saturday 10:00 Paris (Saturday is closed/off-day)
  const saturday = parisDate('2026-11-07T10:00:00');
  const events: CalendarEvent[] = [
    {
      id: 'weekend-evt',
      title: 'Événement personnel weekend',
      start: parisDate('2026-11-07T09:30:00').toISOString(),
      end: parisDate('2026-11-07T11:00:00').toISOString(),
      isBusy: true,
    },
  ];
  const result = calculateAvailability(saturday, DEFAULT_SCHEDULE, events);
  assert.equal(result.status, 'OFF_HOURS');
  assert.equal(result.state, 'off');
  assert.equal(result.isWorkTime, false);
  assert.match(result.subtitle, /lundi/i);
});

test('loads DEFAULT_PROFILE securely from config/personal.json', () => {
  assert.ok(DEFAULT_PROFILE, 'DEFAULT_PROFILE should exist');
  assert.equal(typeof DEFAULT_PROFILE.name, 'string');
  assert.ok(DEFAULT_PROFILE.name.length > 0, 'Name must not be empty');
  assert.equal(typeof DEFAULT_PROFILE.role, 'string');
  assert.equal(typeof DEFAULT_PROFILE.company, 'string');
  assert.equal(typeof DEFAULT_PROFILE.email, 'string');
  assert.equal(typeof DEFAULT_PROFILE.bookingUrl, 'string');
});

test('createDateInTimezone constructs precise wall-clock time in any timezone', () => {
  const parisDate = createDateInTimezone('2026-11-16', '14:30', 'Europe/Paris');
  const parisParts = getZonedDateParts(parisDate, 'Europe/Paris');
  assert.equal(parisParts.year, 2026);
  assert.equal(parisParts.month, 11);
  assert.equal(parisParts.day, 16);
  assert.equal(parisParts.hour, 14);
  assert.equal(parisParts.minute, 30);

  const reunionDate = createDateInTimezone('2026-11-16', '08:15', 'Indian/Reunion');
  const reunionParts = getZonedDateParts(reunionDate, 'Indian/Reunion');
  assert.equal(reunionParts.year, 2026);
  assert.equal(reunionParts.month, 11);
  assert.equal(reunionParts.day, 16);
  assert.equal(reunionParts.hour, 8);
  assert.equal(reunionParts.minute, 15);
});


