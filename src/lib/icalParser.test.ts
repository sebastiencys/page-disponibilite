import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIcsEvents, parseIcsDate } from './icalParser.ts';
import {
  DEFAULT_SCHEDULE,
  formatTimeShort,
  getAnonymizedUpcomingSlots,
  createDateInTimezone,
} from './availability.ts';

test('parseIcsDate parses UTC and local iCal dates correctly', () => {
  const utcDate = parseIcsDate('20261109T143000Z');
  assert.equal(utcDate.getUTCFullYear(), 2026);
  assert.equal(utcDate.getUTCMonth(), 10); // 0-indexed November
  assert.equal(utcDate.getUTCDate(), 9);
  assert.equal(utcDate.getUTCHours(), 14);
  assert.equal(utcDate.getUTCMinutes(), 30);
});

test('parseIcsEvents parses TZID and floating times accurately without +4h server shift', () => {
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
X-WR-TIMEZONE:Indian/Reunion
BEGIN:VEVENT
UID:tzid-1
SUMMARY:Point Réunion TZID
DTSTART;TZID=Indian/Reunion:20261116T144500
DTEND;TZID=Indian/Reunion:20261116T153000
END:VEVENT
BEGIN:VEVENT
UID:floating-2
SUMMARY:Point Réunion Flottant
DTSTART:20261116T160000
DTEND:20261116T164500
END:VEVENT
BEGIN:VEVENT
UID:win-3
SUMMARY:Outlook Mauritius Standard Time
DTSTART;TZID="Mauritius Standard Time":20261117T100000
DTEND;TZID="Mauritius Standard Time":20261117T110000
END:VEVENT
END:VCALENDAR`;

  const events = parseIcsEvents(ics, 'Indian/Reunion');
  assert.equal(events.length, 3);

  assert.equal(formatTimeShort(new Date(events[0].start), 'Indian/Reunion'), '14h45');
  assert.equal(formatTimeShort(new Date(events[0].end), 'Indian/Reunion'), '15h30');

  assert.equal(formatTimeShort(new Date(events[1].start), 'Indian/Reunion'), '16h00');
  assert.equal(formatTimeShort(new Date(events[1].end), 'Indian/Reunion'), '16h45');

  assert.equal(formatTimeShort(new Date(events[2].start), 'Indian/Reunion'), '10h00');
  assert.equal(formatTimeShort(new Date(events[2].end), 'Indian/Reunion'), '11h00');
});

test('parseIcsEvents handles VTIMEZONE custom TZOFFSETTO fallback', () => {
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTIMEZONE
TZID:CustomReunionTZ
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:+0400
TZOFFSETTO:+0400
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:vtz-1
SUMMARY:Custom TZ event
DTSTART;TZID=CustomReunionTZ:20261118T144500
DTEND;TZID=CustomReunionTZ:20261118T153000
END:VEVENT
END:VCALENDAR`;

  const events = parseIcsEvents(ics, 'Europe/Paris');
  assert.equal(events.length, 1);
  assert.equal(formatTimeShort(new Date(events[0].start), 'Indian/Reunion'), '14h45');
  assert.equal(formatTimeShort(new Date(events[0].end), 'Indian/Reunion'), '15h30');
});

test('parseIcsEvents parses all-day events and aligns them with configured day hours even if day is disabled', () => {
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:allday-2311
SUMMARY:Journée complète
DTSTART;VALUE=DATE:20261123
DTEND;VALUE=DATE:20261124
END:VEVENT
END:VCALENDAR`;

  const events = parseIcsEvents(ics, 'Indian/Reunion');
  assert.equal(events.length, 1);
  assert.equal(events[0].isAllDay, true);
  assert.equal(events[0].allDayStartDate, '2026-11-23');
  assert.equal(events[0].allDayEndDate, '2026-11-24');

  const scheduleMonDisabled = {
    ...DEFAULT_SCHEDULE,
    days: {
      ...DEFAULT_SCHEDULE.days,
      1: { enabled: false, start: '08:30', end: '17:30' },
    },
  };

  const fromDate = createDateInTimezone('2026-11-22', '10:00', 'Indian/Reunion');
  const slots = getAnonymizedUpcomingSlots(events, fromDate, 8, scheduleMonDisabled, 'Indian/Reunion');
  assert.equal(slots.length, 1);
  assert.equal(formatTimeShort(new Date(slots[0].start), 'Indian/Reunion'), '08h30');
  assert.equal(formatTimeShort(new Date(slots[0].end), 'Indian/Reunion'), '17h30');
});

test('parseIcsEvents parses standard VEVENT blocks and respects TRANSP/STATUS/CDO-BUSYSTATUS', () => {
  const sampleIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//DispoLive//FR
BEGIN:VEVENT
UID:meet-123
SUMMARY:Rendez-vous Client Stratégique
DTSTART:20261109T100000Z
DTEND:20261109T110000Z
TRANSP:OPAQUE
END:VEVENT
BEGIN:VEVENT
UID:meet-456
SUMMARY:Temps libre / Déjeuner perso
DTSTART:20261109T120000Z
DTEND:20261109T130000Z
TRANSP:TRANSPARENT
END:VEVENT
BEGIN:VEVENT
UID:meet-789
SUMMARY:Réunion annulée
DTSTART:20261109T140000Z
DTEND:20261109T150000Z
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR`;

  const events = parseIcsEvents(sampleIcs);
  assert.equal(events.length, 3);
  assert.equal(events[0].title, 'Rendez-vous Client Stratégique');
  assert.equal(events[0].isBusy, true);
  assert.equal(events[1].title, 'Temps libre / Déjeuner perso');
  assert.equal(events[1].isBusy, false); // Transparent = free
  assert.equal(events[2].isBusy, false); // Cancelled = free
});

test('parseIcsEvents expands weekly Thursday 13:00-13:30 RRULE recurring meetings starting weeks earlier', () => {
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
X-WR-TIMEZONE:Indian/Reunion
BEGIN:VEVENT
UID:weekly-thu-13h
SUMMARY:Comité Hebdo Jeudi
DTSTART;TZID=Indian/Reunion:20260903T130000
DTEND;TZID=Indian/Reunion:20260903T133000
RRULE:FREQ=WEEKLY;BYDAY=TH
END:VEVENT
END:VCALENDAR`;

  const now = createDateInTimezone('2026-11-16', '09:00', 'Indian/Reunion');
  const rangeStart = createDateInTimezone('2026-11-15', '00:00', 'Indian/Reunion');
  const rangeEnd = createDateInTimezone('2026-12-05', '23:59', 'Indian/Reunion');

  const events = parseIcsEvents(ics, 'Indian/Reunion', { now, rangeStart, rangeEnd });
  // Thursdays in [2026-11-15 .. 2026-12-05]: 2026-11-19, 2026-11-26, 2026-12-03
  assert.equal(events.length, 3);
  for (const evt of events) {
    assert.equal(evt.isBusy, true);
    assert.equal(formatTimeShort(new Date(evt.start), 'Indian/Reunion'), '13h00');
    assert.equal(formatTimeShort(new Date(evt.end), 'Indian/Reunion'), '13h30');
  }
  assert.ok(String(events[0].start).startsWith('2026-11-19T09:00:00'));
  assert.ok(String(events[1].start).startsWith('2026-11-26T09:00:00'));
  assert.ok(String(events[2].start).startsWith('2026-12-03T09:00:00'));
});

test('parseIcsEvents preserves wall-clock time across DST changes and respects EXDATE, RECURRENCE-ID, COUNT, UNTIL', () => {
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:dst-paris-weekly
SUMMARY:Point DST Paris
DTSTART;TZID=Europe/Paris:20261015T130000
DTEND;TZID=Europe/Paris:20261015T133000
RRULE:FREQ=WEEKLY;BYDAY=TH;COUNT=6
EXDATE;TZID=Europe/Paris:20261029T130000
END:VEVENT
BEGIN:VEVENT
UID:dst-paris-weekly
SUMMARY:Point DST Paris déplacé
RECURRENCE-ID;TZID=Europe/Paris:20261105T130000
DTSTART;TZID=Europe/Paris:20261105T150000
DTEND;TZID=Europe/Paris:20261105T154500
END:VEVENT
END:VCALENDAR`;

  // 6 occurrences starting Oct 15: Oct 15, Oct 22 (summer UTC+2), Oct 29 (EXDATE -> skipped), Nov 5 (RECURRENCE-ID -> moved to 15:00-15:45), Nov 12, Nov 19
  const rangeStart = createDateInTimezone('2026-10-14', '00:00', 'Europe/Paris');
  const rangeEnd = createDateInTimezone('2026-11-30', '23:59', 'Europe/Paris');
  const events = parseIcsEvents(ics, 'Europe/Paris', { rangeStart, rangeEnd });

  // Override event (Nov 5) + 4 remaining master occurrences (Oct 15, Oct 22, Nov 12, Nov 19) = 5
  assert.equal(events.length, 5);
  const sorted = [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  // Oct 15 & Oct 22 (summer CEST) -> 13h00-13h30 Paris
  assert.equal(formatTimeShort(new Date(sorted[0].start), 'Europe/Paris'), '13h00');
  assert.equal(formatTimeShort(new Date(sorted[1].start), 'Europe/Paris'), '13h00');
  // Oct 29 skipped by EXDATE
  // Nov 5 moved by RECURRENCE-ID -> 15h00-15h45 Paris
  assert.equal(formatTimeShort(new Date(sorted[2].start), 'Europe/Paris'), '15h00');
  assert.equal(formatTimeShort(new Date(sorted[2].end), 'Europe/Paris'), '15h45');
  // Nov 12 & Nov 19 (winter CET) -> still 13h00-13h30 Paris!
  assert.equal(formatTimeShort(new Date(sorted[3].start), 'Europe/Paris'), '13h00');
  assert.equal(formatTimeShort(new Date(sorted[3].end), 'Europe/Paris'), '13h30');
  assert.equal(formatTimeShort(new Date(sorted[4].start), 'Europe/Paris'), '13h00');
  assert.equal(formatTimeShort(new Date(sorted[4].end), 'Europe/Paris'), '13h30');
});

test('parseIcsEvents supports MONTHLY BYDAY/BYSETPOS and UNTIL recurrence limits', () => {
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:monthly-last-thu
SUMMARY:Bilan Mensuel
DTSTART;TZID=Indian/Reunion:20261029T130000
DTEND;TZID=Indian/Reunion:20261029T133000
RRULE:FREQ=MONTHLY;BYDAY=-1TH;UNTIL=20261231T235959Z
END:VEVENT
END:VCALENDAR`;

  const rangeStart = createDateInTimezone('2026-10-01', '00:00', 'Indian/Reunion');
  const rangeEnd = createDateInTimezone('2027-02-28', '23:59', 'Indian/Reunion');
  const events = parseIcsEvents(ics, 'Indian/Reunion', { rangeStart, rangeEnd });

  // Last Thursdays in Oct (29), Nov (26), Dec (31) 2026
  assert.equal(events.length, 3);
  assert.ok(String(events[0].start).startsWith('2026-10-29'));
  assert.ok(String(events[1].start).startsWith('2026-11-26'));
  assert.ok(String(events[2].start).startsWith('2026-12-31'));
});

