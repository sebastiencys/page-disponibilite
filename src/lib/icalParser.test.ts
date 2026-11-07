import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIcsEvents, parseIcsDate } from './icalParser.ts';

test('parseIcsDate parses UTC and local iCal dates correctly', () => {
  const utcDate = parseIcsDate('20261109T143000Z');
  assert.equal(utcDate.getUTCFullYear(), 2026);
  assert.equal(utcDate.getUTCMonth(), 10); // 0-indexed November
  assert.equal(utcDate.getUTCDate(), 9);
  assert.equal(utcDate.getUTCHours(), 14);
  assert.equal(utcDate.getUTCMinutes(), 30);
});

test('parseIcsEvents parses standard VEVENT blocks', () => {
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
END:VCALENDAR`;

  const events = parseIcsEvents(sampleIcs);
  assert.equal(events.length, 2);
  assert.equal(events[0].title, 'Rendez-vous Client Stratégique');
  assert.equal(events[0].isBusy, true);
  assert.equal(events[1].title, 'Temps libre / Déjeuner perso');
  assert.equal(events[1].isBusy, false); // Transparent = free
});
