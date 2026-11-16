import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAvailability,
  DEFAULT_SCHEDULE,
  DEFAULT_PROFILE,
  getNextWorkStart,
  createDateInTimezone,
  getZonedDateParts,
  getAnonymizedUpcomingSlots,
  getEffectiveLunchBreak,
  formatTimeShort,
  type CalendarEvent,
  type ScheduleConfig,
  type AnonymizedSlot,
} from './availability.ts';

// Helper to specify exact wall-clock time in Europe/Paris (CET = UTC+1 in November)
const parisDate = (dateTimeStr: string) => new Date(`${dateTimeStr}+01:00`);

// Deterministic Mon-Fri schedule fixture independent of user's personal gitignored config/schedule.json
const TEST_SCHEDULE: ScheduleConfig = {
  timezone: 'Europe/Paris',
  days: {
    1: { enabled: true, start: '09:00', end: '18:00' },
    2: { enabled: true, start: '09:00', end: '18:00' },
    3: { enabled: true, start: '09:00', end: '18:00' },
    4: { enabled: true, start: '09:00', end: '18:00' },
    5: { enabled: true, start: '09:00', end: '17:30' },
    6: { enabled: false, start: '09:00', end: '18:00' },
    0: { enabled: false, start: '09:00', end: '18:00' },
  },
  lunchBreak: {
    enabled: true,
    start: '12:30',
    end: '13:30',
    label: 'Pause déjeuner',
  },
  bufferMinutes: 0,
};

test('detects off-hours on weekend (Sunday)', () => {
  // Sunday 14:00 Paris
  const sunday = parisDate('2026-11-08T14:00:00');
  const result = calculateAvailability(sunday, TEST_SCHEDULE, []);
  assert.equal(result.status, 'OFF_HOURS');
  assert.equal(result.state, 'off');
  assert.equal(result.isWorkTime, false);
  assert.match(result.subtitle, /lundi à 09h00/i);
});

test('displays explicit day name instead of "Demain" on weekday evenings (e.g. Monday evening -> mardi)', () => {
  // Monday 20:30 Paris
  const mondayEvening = parisDate('2026-11-09T20:30:00');
  const result = calculateAvailability(mondayEvening, TEST_SCHEDULE, []);
  assert.equal(result.status, 'OFF_HOURS');
  assert.equal(result.state, 'off');
  assert.equal(result.isWorkTime, false);
  assert.equal(result.subtitle, 'Reprise mardi à 09h00');
  assert.ok(!result.subtitle.includes('Demain'), 'Should not use "Demain"');
});

test('detects off-hours before workday begins on Monday', () => {
  // Monday 07:30 Paris
  const mondayEarly = parisDate('2026-11-09T07:30:00');
  const result = calculateAvailability(mondayEarly, TEST_SCHEDULE, []);
  assert.equal(result.status, 'OFF_HOURS');
  assert.equal(result.state, 'off');
  assert.match(result.subtitle, /09h00/);
});

test('detects available during normal workday without events', () => {
  // Monday 10:15 Paris
  const mondayMid = parisDate('2026-11-09T10:15:00');
  const result = calculateAvailability(mondayMid, TEST_SCHEDULE, []);
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.state, 'available');
  assert.equal(result.badgeColor, '#10B981');
  assert.match(result.subtitle, /Jusqu'à/);
});

test('detects lunch break during scheduled hours in Paris timezone', () => {
  // Monday 13:00 in Paris (Lunch is 12:30 - 13:30)
  const mondayLunch = parisDate('2026-11-09T13:00:00');
  const result = calculateAvailability(mondayLunch, TEST_SCHEDULE, []);
  assert.equal(result.status, 'LUNCH');
  assert.equal(result.state, 'away');
  assert.match(result.subtitle, /13h30/);
});

test('correctly converts UTC server timestamp to Europe/Paris local work hours', () => {
  // 08:30 UTC is 09:30 in Paris (workday started at 09:00 Paris)
  const utcNow = new Date('2026-11-09T08:30:00.000Z');
  const result = calculateAvailability(utcNow, TEST_SCHEDULE, [], undefined, 'Europe/Paris');
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
  const result = calculateAvailability(mondayMeetingTime, TEST_SCHEDULE, events);
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
  const result = calculateAvailability(now, TEST_SCHEDULE, events);
  assert.equal(result.status, 'BUSY');
  assert.match(result.subtitle, /16h30/);
});

test('manual override takes precedence over schedule and events', () => {
  const mondayMid = parisDate('2026-11-09T10:15:00');
  const result = calculateAvailability(mondayMid, TEST_SCHEDULE, [], {
    type: 'dnd',
    note: 'Session Focus',
    expiresAt: parisDate('2026-11-09T12:00:00').toISOString(),
  });
  assert.equal(result.status, 'OVERRIDE_DND');
  assert.equal(result.title, 'Session Focus');
  assert.match(result.subtitle, /12h00/);
});

test('timed event scheduled on a weekend or off-hours marks user as busy (meetings evaluated first)', () => {
  // Saturday 10:00 Paris (Saturday is normally closed, but user has an active meeting 09:30 - 11:00)
  const saturday = parisDate('2026-11-07T10:00:00');
  const events: CalendarEvent[] = [
    {
      id: 'weekend-evt',
      title: 'Réunion exceptionnelle weekend',
      start: parisDate('2026-11-07T09:30:00').toISOString(),
      end: parisDate('2026-11-07T11:00:00').toISOString(),
      isBusy: true,
    },
  ];
  const result = calculateAvailability(saturday, TEST_SCHEDULE, events);
  assert.equal(result.status, 'BUSY');
  assert.equal(result.state, 'busy');
  assert.match(result.subtitle, /11h00/);
});

test('all-day event on disabled day (e.g. Monday enabled:false) still displays in upcomingSlots, marks BUSY, and skips consecutive busy Tuesday for Reprise mercredi', () => {
  const tz = 'Indian/Reunion';
  const scheduleWithMonDisabled: ScheduleConfig = {
    timezone: tz,
    days: {
      1: { enabled: false, start: '08:30', end: '17:30' },
      2: { enabled: true, start: '08:30', end: '17:30' },
      3: { enabled: true, start: '08:30', end: '17:30' },
      4: { enabled: true, start: '08:30', end: '17:30' },
      5: { enabled: true, start: '08:30', end: '17:30' },
      6: { enabled: false, start: '08:30', end: '17:30' },
      0: { enabled: false, start: '08:30', end: '17:30' },
    },
    lunchBreak: {
      enabled: true,
      start: '12:30',
      end: '13:30',
      label: 'Pause déjeuner',
    },
    bufferMinutes: 0,
  };

  // All-day event covering Mon 23/11 and Tue 24/11 (DTEND exclusive 2026-11-25)
  const events: CalendarEvent[] = [
    {
      id: 'formation-23-24',
      title: 'Formation / Réunion',
      start: createDateInTimezone('2026-11-23', '00:00', tz).toISOString(),
      end: createDateInTimezone('2026-11-25', '00:00', tz).toISOString(),
      isAllDay: true,
      allDayStartDate: '2026-11-23',
      allDayEndDate: '2026-11-25',
      isBusy: true,
    },
  ];

  // Upcoming anonymized slots from Sun 22/11 10:00 -> Mon 23/11 (08h30-17h30) AND Tue 24/11 (08h30-17h30)
  const fromDate = createDateInTimezone('2026-11-22', '10:00', tz);
  const slots = getAnonymizedUpcomingSlots(events, fromDate, 8, scheduleWithMonDisabled, tz);
  assert.equal(slots.length, 2);

  const monStart = getZonedDateParts(new Date(slots[0].start), tz);
  const monEnd = getZonedDateParts(new Date(slots[0].end), tz);
  assert.equal(monStart.day, 23);
  assert.equal(monStart.hour, 8);
  assert.equal(monStart.minute, 30);
  assert.equal(monEnd.day, 23);
  assert.equal(monEnd.hour, 17);
  assert.equal(monEnd.minute, 30);

  const tueStart = getZonedDateParts(new Date(slots[1].start), tz);
  const tueEnd = getZonedDateParts(new Date(slots[1].end), tz);
  assert.equal(tueStart.day, 24);
  assert.equal(tueStart.hour, 8);
  assert.equal(tueStart.minute, 30);
  assert.equal(tueEnd.day, 24);
  assert.equal(tueEnd.hour, 17);
  assert.equal(tueEnd.minute, 30);

  // During Mon 23/11 at 10:00 -> BUSY (NOT OFF_HOURS!), and Reprise mercredi à 08h30 (not mardi!)
  const monWork = createDateInTimezone('2026-11-23', '10:00', tz);
  const monWorkAvail = calculateAvailability(monWork, scheduleWithMonDisabled, events, undefined, tz);
  assert.equal(monWorkAvail.status, 'BUSY');
  assert.equal(monWorkAvail.title, 'En réunion / Occupé');
  assert.equal(monWorkAvail.subtitle, 'Reprise mercredi à 08h30');

  // Before work on Mon 23/11 at 07:30 -> OFF_HOURS, Reprise mercredi à 08h30
  const monEarly = createDateInTimezone('2026-11-23', '07:30', tz);
  const monEarlyAvail = calculateAvailability(monEarly, scheduleWithMonDisabled, events, undefined, tz);
  assert.equal(monEarlyAvail.status, 'OFF_HOURS');
  assert.equal(monEarlyAvail.subtitle, 'Reprise mercredi à 08h30');

  // After work on Mon 23/11 at 18:00 -> OFF_HOURS, Reprise mercredi à 08h30
  const monEvening = createDateInTimezone('2026-11-23', '18:00', tz);
  const monEveningAvail = calculateAvailability(monEvening, scheduleWithMonDisabled, events, undefined, tz);
  assert.equal(monEveningAvail.status, 'OFF_HOURS');
  assert.equal(monEveningAvail.subtitle, 'Reprise mercredi à 08h30');

  // During Tue 24/11 at 14:00 -> BUSY, Reprise mercredi à 08h30
  const tueWork = createDateInTimezone('2026-11-24', '14:00', tz);
  const tueWorkAvail = calculateAvailability(tueWork, scheduleWithMonDisabled, events, undefined, tz);
  assert.equal(tueWorkAvail.status, 'BUSY');
  assert.equal(tueWorkAvail.subtitle, 'Reprise mercredi à 08h30');

  // Wed 25/11 at 08:30 -> AVAILABLE
  const wedWork = createDateInTimezone('2026-11-25', '08:30', tz);
  assert.equal(calculateAvailability(wedWork, scheduleWithMonDisabled, events, undefined, tz).status, 'AVAILABLE');
});

test('getNextWorkStart skips morning meeting and lunch break to find exact resumption time', () => {
  const tz = 'Indian/Reunion';
  const schedule: ScheduleConfig = {
    ...TEST_SCHEDULE,
    timezone: tz,
    days: {
      ...TEST_SCHEDULE.days,
      2: { enabled: true, start: '08:30', end: '17:30' },
    },
  };
  const monEvening = createDateInTimezone('2026-11-23', '19:00', tz);
  const events: CalendarEvent[] = [
    {
      id: 'tue-morning',
      title: 'Atelier matin',
      start: createDateInTimezone('2026-11-24', '08:30', tz).toISOString(),
      end: createDateInTimezone('2026-11-24', '12:30', tz).toISOString(),
      isBusy: true,
    },
  ];
  // Tuesday 08:30-12:30 is busy and 12:30-13:30 is lunch -> resumes Tuesday 13:30!
  const next = getNextWorkStart(monEvening, schedule, tz, events);
  assert.equal(next.text, 'mardi à 13h30');
});

test('loads DEFAULT_PROFILE and DEFAULT_SCHEDULE securely from config/*.json', () => {
  assert.ok(DEFAULT_PROFILE, 'DEFAULT_PROFILE should exist');
  assert.equal(typeof DEFAULT_PROFILE.name, 'string');
  assert.ok(DEFAULT_PROFILE.name.length > 0, 'Name must not be empty');
  assert.equal(typeof DEFAULT_PROFILE.role, 'string');
  assert.equal(typeof DEFAULT_PROFILE.company, 'string');
  assert.equal(typeof DEFAULT_PROFILE.email, 'string');
  assert.equal(typeof DEFAULT_PROFILE.bookingUrl, 'string');

  assert.ok(DEFAULT_SCHEDULE, 'DEFAULT_SCHEDULE should exist');
  assert.equal(typeof DEFAULT_SCHEDULE.timezone, 'string');
  assert.ok(DEFAULT_SCHEDULE.days[1], 'Monday schedule should exist');
});

test('createDateInTimezone constructs precise wall-clock time in any timezone', () => {
  const parisDateVal = createDateInTimezone('2026-11-16', '14:30', 'Europe/Paris');
  const parisParts = getZonedDateParts(parisDateVal, 'Europe/Paris');
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

test('getAnonymizedUpcomingSlots strips all secret details and merges overlapping slots', () => {
  const events: CalendarEvent[] = [
    {
      id: 'secret-1',
      title: 'CONFIDENTIEL: Réunion stratégique avec M. Untel',
      start: '2026-11-16T10:00:00.000Z',
      end: '2026-11-16T11:00:00.000Z',
      isBusy: true,
    },
    {
      id: 'secret-2',
      title: 'CONFIDENTIEL: Entretien d embauche',
      start: '2026-11-16T11:00:00.000Z',
      end: '2026-11-16T12:00:00.000Z',
      isBusy: true,
    },
    {
      id: 'transparent-3',
      title: 'Rappel perso non bloquant',
      start: '2026-11-16T13:00:00.000Z',
      end: '2026-11-16T14:00:00.000Z',
      isBusy: false,
    },
    {
      id: 'past-4',
      title: 'Réunion passée',
      start: '2026-11-16T07:00:00.000Z',
      end: '2026-11-16T08:00:00.000Z',
      isBusy: true,
    },
  ];

  const fromDate = new Date('2026-11-16T09:00:00.000Z');
  const slots = getAnonymizedUpcomingSlots(events, fromDate);

  // Past event (07:00-08:00) must be excluded
  // Transparent non-busy event must be excluded
  // Two consecutive meetings (10:00-11:00 and 11:00-12:00) must be merged into 10:00-12:00
  assert.equal(slots.length, 1);
  assert.equal(slots[0].start, '2026-11-16T10:00:00.000Z');
  assert.equal(slots[0].end, '2026-11-16T12:00:00.000Z');
  assert.equal(slots[0].label, 'Créneau réservé');

  // Verify that NO private fields exist on the result object
  const slotObj = slots[0] as any;
  assert.equal(slotObj.id, undefined);
  assert.equal(slotObj.title, undefined);
  assert.equal(slotObj.description, undefined);
  assert.equal(slotObj.participants, undefined);
  assert.equal(slotObj.location, undefined);
});

test('Thursday 13:00-13:30 meeting takes precedence over lunch break (12:30-13:30) and shows in upcomingSlots', () => {
  const tz = 'Indian/Reunion';
  const thursday1310 = createDateInTimezone('2026-11-19', '13:10', tz);
  const events: CalendarEvent[] = [
    {
      id: 'thu-13h',
      title: 'Réunion Jeudi 13h',
      start: createDateInTimezone('2026-11-19', '13:00', tz).toISOString(),
      end: createDateInTimezone('2026-11-19', '13:30', tz).toISOString(),
      isBusy: true,
    },
  ];

  const avail = calculateAvailability(thursday1310, DEFAULT_SCHEDULE, events, undefined, tz);
  assert.equal(avail.status, 'BUSY');
  assert.equal(avail.subtitle, 'Libre à 13h30');

  const morning = createDateInTimezone('2026-11-19', '10:00', tz);
  const slots = getAnonymizedUpcomingSlots(events, morning, 8, DEFAULT_SCHEDULE, tz);
  assert.equal(slots.length, 1);
  assert.equal(formatTimeShort(new Date(slots[0].start), tz), '13h00');
  assert.equal(formatTimeShort(new Date(slots[0].end), tz), '13h30');
});

test('per-day lunchBreak.days override takes priority over global lunchBreak and falls back when empty', () => {
  const tz = 'Indian/Reunion';
  const customSchedule: ScheduleConfig = {
    ...DEFAULT_SCHEDULE,
    lunchBreak: {
      enabled: true,
      start: '12:30',
      end: '13:30',
      label: 'Pause déjeuner',
      days: {
        4: { enabled: true, start: '12:00', end: '12:30' }, // Thursday 12:00-12:30
        2: { start: '', end: '' }, // Empty strings fall back to global 12:30-13:30
        3: { enabled: false }, // Wednesday lunch disabled
      },
    },
  };

  // Monday (no override) -> global 12:30-13:30
  const mondayLunch = getEffectiveLunchBreak(customSchedule, 1);
  assert.equal(mondayLunch.start, '12:30');
  assert.equal(mondayLunch.end, '13:30');
  assert.equal(mondayLunch.isCustomForDay, false);

  // Tuesday (blank override) -> falls back to global 12:30-13:30
  const tuesdayLunch = getEffectiveLunchBreak(customSchedule, 2);
  assert.equal(tuesdayLunch.start, '12:30');
  assert.equal(tuesdayLunch.end, '13:30');
  assert.equal(tuesdayLunch.isCustomForDay, false);

  // Wednesday (enabled: false) -> no lunch break
  const wednesday1245 = createDateInTimezone('2026-11-18', '12:45', tz);
  assert.equal(calculateAvailability(wednesday1245, customSchedule, [], undefined, tz).status, 'AVAILABLE');

  // Thursday at 11:00 -> available until 12h00 (pause)
  const thu1100 = createDateInTimezone('2026-11-19', '11:00', tz);
  const thu1100Avail = calculateAvailability(thu1100, customSchedule, [], undefined, tz);
  assert.equal(thu1100Avail.status, 'AVAILABLE');
  assert.equal(thu1100Avail.subtitle, "Jusqu'à 12h00 (pause)");

  // Thursday at 12:15 -> LUNCH (Reprise à 12h30)
  const thu1215 = createDateInTimezone('2026-11-19', '12:15', tz);
  const thu1215Avail = calculateAvailability(thu1215, customSchedule, [], undefined, tz);
  assert.equal(thu1215Avail.status, 'LUNCH');
  assert.equal(thu1215Avail.subtitle, 'Reprise à 12h30');

  // Thursday at 12:45 -> AVAILABLE (not lunch, because Thursday lunch ended at 12:30!)
  const thu1245 = createDateInTimezone('2026-11-19', '12:45', tz);
  const thu1245Avail = calculateAvailability(thu1245, customSchedule, [], undefined, tz);
  assert.equal(thu1245Avail.status, 'AVAILABLE');
});

