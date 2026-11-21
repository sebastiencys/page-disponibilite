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
  getTodayAppointmentsCount,
  getCalendarSummaries,
  getClosureForDate,
  getUpcomingClosures,
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

test('getTodayAppointmentsCount counts only same-day busy events starting at local midnight', () => {
  const events: CalendarEvent[] = [
    {
      id: 'yesterday-ends-midnight',
      title: 'Réunion veille',
      start: parisDate('2026-11-18T22:00:00').toISOString(),
      end: parisDate('2026-11-19T00:00:00').toISOString(),
      isBusy: true,
    },
    {
      id: 'today-morning',
      title: 'RDV Matin',
      start: parisDate('2026-11-19T08:30:00').toISOString(),
      end: parisDate('2026-11-19T09:00:00').toISOString(),
      isBusy: true,
    },
    {
      id: 'today-transparent',
      title: 'Note libre non bloquante',
      start: parisDate('2026-11-19T11:00:00').toISOString(),
      end: parisDate('2026-11-19T12:00:00').toISOString(),
      isBusy: false,
    },
    {
      id: 'today-afternoon',
      title: 'RDV Après-midi',
      start: parisDate('2026-11-19T14:00:00').toISOString(),
      end: parisDate('2026-11-19T15:30:00').toISOString(),
      isBusy: true,
    },
    {
      id: 'today-evening',
      title: 'RDV Soirée',
      start: parisDate('2026-11-19T18:30:00').toISOString(),
      end: parisDate('2026-11-19T19:00:00').toISOString(),
      isBusy: true,
    },
    {
      id: 'tomorrow-morning',
      title: 'RDV Demain',
      start: parisDate('2026-11-20T09:00:00').toISOString(),
      end: parisDate('2026-11-20T10:00:00').toISOString(),
      isBusy: true,
    },
  ];

  // Just before midnight on Nov 18 (23:59) -> only Nov 18 evening event (1), NOT Nov 19 events
  const beforeMidnight = parisDate('2026-11-18T23:59:00');
  assert.equal(getTodayAppointmentsCount(beforeMidnight, events, TEST_SCHEDULE, 'Europe/Paris'), 1);
  assert.equal(calculateAvailability(beforeMidnight, TEST_SCHEDULE, events).todayAppointmentsCount, 1);

  // Just after midnight on Nov 19 (00:01) -> 3 busy events on Nov 19 (excludes yesterday & tomorrow & transparent)
  const afterMidnight = parisDate('2026-11-19T00:01:00');
  assert.equal(getTodayAppointmentsCount(afterMidnight, events, TEST_SCHEDULE, 'Europe/Paris'), 3);
  assert.equal(calculateAvailability(afterMidnight, TEST_SCHEDULE, events).todayAppointmentsCount, 3);

  // Mid-afternoon on Nov 19 (15:00) -> still 3 busy events for the day
  const afternoon = parisDate('2026-11-19T15:00:00');
  assert.equal(calculateAvailability(afternoon, TEST_SCHEDULE, events).todayAppointmentsCount, 3);

  // After midnight on Nov 20 (00:01) -> only tomorrow's (now today's) 1 event
  const nextDayMidnight = parisDate('2026-11-20T00:01:00');
  assert.equal(calculateAvailability(nextDayMidnight, TEST_SCHEDULE, events).todayAppointmentsCount, 1);
});

test('getTodayAppointmentsCount respects target timezone midnight and multi-day all-day events', () => {
  const tz = 'Indian/Reunion';
  const scheduleReunion: ScheduleConfig = { ...TEST_SCHEDULE, timezone: tz };
  const events: CalendarEvent[] = [
    {
      id: 'formation-multi',
      title: 'Formation',
      start: createDateInTimezone('2026-11-23', '00:00', tz).toISOString(),
      end: createDateInTimezone('2026-11-25', '00:00', tz).toISOString(),
      isAllDay: true,
      allDayStartDate: '2026-11-23',
      allDayEndDate: '2026-11-25',
      isBusy: true,
    },
  ];

  // 19:59 UTC is 23:59 Nov 22 in Indian/Reunion -> 0 appointments on Nov 22
  assert.equal(
    calculateAvailability(new Date('2026-11-22T19:59:00.000Z'), scheduleReunion, events, undefined, tz)
      .todayAppointmentsCount,
    0
  );
  // 20:01 UTC is 00:01 Nov 23 in Indian/Reunion -> 1 appointment on Nov 23
  assert.equal(
    calculateAvailability(new Date('2026-11-22T20:01:00.000Z'), scheduleReunion, events, undefined, tz)
      .todayAppointmentsCount,
    1
  );
  // Nov 24 -> 1 appointment (all-day)
  const nov24Avail = calculateAvailability(
    createDateInTimezone('2026-11-24', '10:00', tz),
    scheduleReunion,
    events,
    undefined,
    tz
  );
  assert.equal(nov24Avail.todayAppointmentsCount, 1);
  assert.equal(nov24Avail.todayAllDayAppointmentsCount, 1);

  // Nov 25 -> 0 appointments
  assert.equal(
    calculateAvailability(createDateInTimezone('2026-11-25', '09:00', tz), scheduleReunion, events, undefined, tz)
      .todayAppointmentsCount,
    0
  );
});

test('todayAllDayAppointmentsCount detects timed events covering the full working day and mixed days', () => {
  const tz = 'Europe/Paris';
  const monday = parisDate('2026-11-09T10:30:00');
  const events: CalendarEvent[] = [
    {
      id: 'timed-full-workday',
      title: 'Séminaire journée',
      start: parisDate('2026-11-09T09:00:00').toISOString(),
      end: parisDate('2026-11-09T18:00:00').toISOString(),
      isBusy: true,
    },
    {
      id: 'extra-meeting',
      title: 'Point rapide',
      start: parisDate('2026-11-09T19:00:00').toISOString(),
      end: parisDate('2026-11-09T19:30:00').toISOString(),
      isBusy: true,
    },
  ];

  const availMixed = calculateAvailability(monday, TEST_SCHEDULE, events, undefined, tz);
  assert.equal(availMixed.todayAppointmentsCount, 2);
  assert.equal(availMixed.todayAllDayAppointmentsCount, 1);

  // Single timed event covering more than workday (08:00-19:00) -> allDayCount = 1, total = 1
  const availSingleFull = calculateAvailability(monday, TEST_SCHEDULE, [events[0]], undefined, tz);
  assert.equal(availSingleFull.todayAppointmentsCount, 1);
  assert.equal(availSingleFull.todayAllDayAppointmentsCount, 1);
});

test('multi-calendar labels propagate to BUSY title, anonymized slots, and per-calendar summaries', () => {
  const tz = 'Europe/Paris';
  const nowMorning = parisDate('2026-11-09T10:15:00');
  const events: CalendarEvent[] = [
    {
      id: 'pro:1',
      title: 'Confidentiel Patient',
      start: parisDate('2026-11-09T10:00:00').toISOString(),
      end: parisDate('2026-11-09T11:00:00').toISOString(),
      isBusy: true,
      calendarId: 'pro',
      calendarLabel: 'Pro',
    },
    {
      id: 'perso:1',
      title: 'Médecin famille',
      start: parisDate('2026-11-09T10:30:00').toISOString(),
      end: parisDate('2026-11-09T11:30:00').toISOString(),
      isBusy: true,
      calendarId: 'perso',
      calendarLabel: 'Perso',
    },
    {
      id: 'perso:2',
      title: 'Sport',
      start: parisDate('2026-11-09T18:30:00').toISOString(),
      end: parisDate('2026-11-09T19:30:00').toISOString(),
      isBusy: true,
      calendarId: 'perso',
      calendarLabel: 'Perso',
    },
  ];

  // At 10:15 only "Pro" is active
  const availPro = calculateAvailability(nowMorning, TEST_SCHEDULE, events, undefined, tz);
  assert.equal(availPro.status, 'BUSY');
  assert.equal(availPro.activeCalendarLabel, 'Pro');
  assert.equal(availPro.title, 'En réunion / Occupé (Pro)');
  assert.equal(availPro.todayAppointmentsCount, 3);

  // At 10:45 both "Pro" and "Perso" overlap
  const nowOverlap = parisDate('2026-11-09T10:45:00');
  const availBoth = calculateAvailability(nowOverlap, TEST_SCHEDULE, events, undefined, tz);
  assert.equal(availBoth.activeCalendarLabel, 'Pro • Perso');
  assert.equal(availBoth.title, 'En réunion / Occupé (Pro • Perso)');

  // upcomingSlots merges overlapping slots and preserves both labels without leaking titles
  const slots = getAnonymizedUpcomingSlots(events, nowMorning, 8, TEST_SCHEDULE, tz);
  assert.equal(slots.length, 2);
  assert.equal(slots[0].calendarLabel, 'Pro • Perso');
  assert.deepEqual(slots[0].calendarLabels, ['Pro', 'Perso']);
  assert.equal(slots[1].calendarLabel, 'Perso');
  assert.ok(!JSON.stringify(slots).includes('Confidentiel Patient'));

  // Per-calendar summaries at 10:15
  const summaries = getCalendarSummaries(nowMorning, events, TEST_SCHEDULE, tz, [
    { id: 'pro', label: 'Pro' },
    { id: 'perso', label: 'Perso' },
    { id: 'vide', label: 'Vide' },
  ]);
  assert.deepEqual(summaries, [
    { id: 'pro', label: 'Pro', todayAppointmentsCount: 1, todayAllDayAppointmentsCount: 0, isBusyNow: true },
    { id: 'perso', label: 'Perso', todayAppointmentsCount: 2, todayAllDayAppointmentsCount: 0, isBusyNow: false },
    { id: 'vide', label: 'Vide', todayAppointmentsCount: 0, todayAllDayAppointmentsCount: 0, isBusyNow: false },
  ]);
});

test('multi-calendar with more than 2 simultaneous busy calendars builds compact summary with +N', () => {
  const tz = 'Europe/Paris';
  const monday = parisDate('2026-11-09T10:15:00');
  const events: CalendarEvent[] = [
    {
      id: 'c1',
      title: 'A',
      start: parisDate('2026-11-09T10:00:00').toISOString(),
      end: parisDate('2026-11-09T11:00:00').toISOString(),
      isBusy: true,
      calendarLabel: 'Pro',
    },
    {
      id: 'c2',
      title: 'B',
      start: parisDate('2026-11-09T10:00:00').toISOString(),
      end: parisDate('2026-11-09T11:00:00').toISOString(),
      isBusy: true,
      calendarLabel: 'Perso',
    },
    {
      id: 'c3',
      title: 'C',
      start: parisDate('2026-11-09T10:00:00').toISOString(),
      end: parisDate('2026-11-09T11:00:00').toISOString(),
      isBusy: true,
      calendarLabel: 'Cabinet Nord',
    },
  ];
  const avail = calculateAvailability(monday, TEST_SCHEDULE, events, undefined, tz);
  assert.equal(avail.status, 'BUSY');
  assert.equal(avail.activeCalendarLabel, 'Pro • Perso • Cabinet Nord');
  assert.equal(avail.title, 'En réunion / Occupé (Pro • Perso +1)');
});

test('closures / holidays trigger HOLIDAY status, skip entire closure in getNextWorkStart, yet keep timed ICS meetings priority', () => {
  const tz = 'Europe/Paris';
  const scheduleWithClosures: ScheduleConfig = {
    ...TEST_SCHEDULE,
    closures: [
      {
        startDate: '2026-11-11',
        endDate: '2026-11-12',
        label: 'Armistice & Pont',
        type: 'holiday',
      },
      {
        startDate: '12-25',
        label: 'Noël',
        type: 'holiday',
        annual: true,
      },
    ],
  };

  assert.equal(getClosureForDate('2026-11-11', scheduleWithClosures)?.label, 'Armistice & Pont');
  assert.equal(getClosureForDate('2026-11-12', scheduleWithClosures)?.label, 'Armistice & Pont');
  assert.equal(getClosureForDate('2026-11-13', scheduleWithClosures), null);
  assert.equal(getClosureForDate('2027-12-25', scheduleWithClosures)?.label, 'Noël');

  // Wednesday Nov 11 at 10:00 -> HOLIDAY, Reprise vendredi à 09h00 (skips Nov 11 & Nov 12)
  const wedHoliday = parisDate('2026-11-11T10:00:00');
  const holidayResult = calculateAvailability(wedHoliday, scheduleWithClosures, [], undefined, tz);
  assert.equal(holidayResult.status, 'HOLIDAY');
  assert.equal(holidayResult.state, 'off');
  assert.equal(holidayResult.isWorkTime, false);
  assert.equal(holidayResult.title, 'Armistice & Pont');
  assert.equal(holidayResult.subtitle, 'Reprise vendredi à 09h00');

  // Tuesday evening Nov 10 -> next work start skips Nov 11 & 12 to Friday Nov 13 09h00
  const tueEvening = parisDate('2026-11-10T19:00:00');
  const next = getNextWorkStart(tueEvening, scheduleWithClosures, tz, []);
  assert.equal(next.text, 'vendredi à 09h00');

  // Explicit timed ICS meeting during holiday still shows BUSY
  const timedDuringHoliday: CalendarEvent[] = [
    {
      id: 'urgent',
      title: 'Astreinte',
      start: parisDate('2026-11-11T09:30:00').toISOString(),
      end: parisDate('2026-11-11T10:30:00').toISOString(),
      isBusy: true,
    },
  ];
  const busyHoliday = calculateAvailability(wedHoliday, scheduleWithClosures, timedDuringHoliday, undefined, tz);
  assert.equal(busyHoliday.status, 'BUSY');
  assert.equal(busyHoliday.subtitle, 'Libre à 10h30');
});

test('getUpcomingClosures merges contiguous days, resolves annual closures across year boundary, and respects withinDays', () => {
  const tz = 'Europe/Paris';
  const scheduleWithClosures: ScheduleConfig = {
    ...TEST_SCHEDULE,
    closures: [
      { startDate: '2026-12-24', endDate: '2026-12-24', label: 'Congés fin année', type: 'vacation' },
      { startDate: '12-25', label: 'Noël', type: 'holiday', annual: true },
      { startDate: '01-01', label: 'Jour de l’an', type: 'holiday', annual: true },
      { startDate: '2027-02-15', label: 'Trop loin', type: 'vacation' },
    ],
  };

  // On Dec 24, 2026 with withinDays = 14: Dec 24 is current (vacation), Dec 25 is Noël, Jan 1 is Jour de l'an; Feb 15 is excluded
  const dec24 = createDateInTimezone('2026-12-24', '10:00', tz);
  const items = getUpcomingClosures(dec24, scheduleWithClosures, tz, 14);
  assert.deepEqual(items, [
    { startDate: '2026-12-24', endDate: '2026-12-24', label: 'Congés fin année', type: 'vacation', isCurrent: true },
    { startDate: '2026-12-25', endDate: '2026-12-25', label: 'Noël', type: 'holiday', isCurrent: false },
    { startDate: '2027-01-01', endDate: '2027-01-01', label: 'Jour de l’an', type: 'holiday', isCurrent: false },
  ]);

  // Multi-day contiguous closure collapses into a single item
  const multiDaySchedule: ScheduleConfig = {
    ...TEST_SCHEDULE,
    closures: [
      { startDate: '2026-11-10', endDate: '2026-11-12', label: 'Pont novembre', type: 'vacation' },
    ],
  };
  const nov10 = createDateInTimezone('2026-11-10', '09:00', tz);
  assert.deepEqual(getUpcomingClosures(nov10, multiDaySchedule, tz, 30), [
    { startDate: '2026-11-10', endDate: '2026-11-12', label: 'Pont novembre', type: 'vacation', isCurrent: true },
  ]);
});

test('supports lang="en" for all availability states and HH:MM time formatting', () => {
  const tz = 'Europe/Paris';
  const availNow = parisDate('2026-11-09T10:15:00');
  assert.equal(formatTimeShort(availNow, tz, 'fr'), '10h15');
  assert.equal(formatTimeShort(availNow, tz, 'en'), '10:15');

  const resAvail = calculateAvailability(availNow, TEST_SCHEDULE, [], undefined, tz, 'en');
  assert.equal(resAvail.title, 'Available');
  assert.equal(resAvail.subtitle, 'Until 12:30 (break)');

  const lunchNow = parisDate('2026-11-09T13:00:00');
  const resLunch = calculateAvailability(lunchNow, TEST_SCHEDULE, [], undefined, tz, 'en');
  assert.equal(resLunch.title, 'Lunch break');
  assert.equal(resLunch.subtitle, 'Back at 13:30');

  const offNow = parisDate('2026-11-09T20:30:00');
  const resOff = calculateAvailability(offNow, TEST_SCHEDULE, [], undefined, tz, 'en');
  assert.equal(resOff.title, 'Outside working hours');
  assert.equal(resOff.subtitle, 'Back Tuesday at 09:00');

  const busyNow = parisDate('2026-11-09T14:30:00');
  const resBusy = calculateAvailability(
    busyNow,
    TEST_SCHEDULE,
    [
      {
        id: 'en-busy',
        title: 'Private Sync',
        start: parisDate('2026-11-09T14:00:00').toISOString(),
        end: parisDate('2026-11-09T15:00:00').toISOString(),
        isBusy: true,
        calendarLabel: 'Pro',
      },
    ],
    undefined,
    tz,
    'en'
  );
  assert.equal(resBusy.title, 'In a meeting / Busy (Pro)');
  assert.equal(resBusy.subtitle, 'Free at 15:00');

  const closureSchedule: ScheduleConfig = {
    ...TEST_SCHEDULE,
    closures: [{ startDate: '2026-11-11', endDate: '2026-11-11', label: 'Veterans Day', type: 'holiday' }],
  };
  const holidayNow = parisDate('2026-11-11T10:00:00');
  const resHoliday = calculateAvailability(holidayNow, closureSchedule, [], undefined, tz, 'en');
  assert.equal(resHoliday.status, 'HOLIDAY');
  assert.equal(resHoliday.title, 'Veterans Day');
  assert.equal(resHoliday.subtitle, 'Back Thursday at 09:00');
});





