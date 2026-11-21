import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasEnvCalendar,
  getCalendarUrl,
  getEnvCalendarSources,
  formatCalendarLabel,
  validateExternalCalendarUrl,
  getSyncedCalendarEvents,
  clearCalendarSyncCacheForTests,
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

test('formatCalendarLabel formats underscores and casing cleanly', () => {
  assert.equal(formatCalendarLabel('PRO'), 'Pro');
  assert.equal(formatCalendarLabel('PERSO'), 'Perso');
  assert.equal(formatCalendarLabel('CABINET_SUD'), 'Cabinet Sud');
});

test('getEnvCalendarSources discovers CALENDAR_ICS_URL_* with automatic and custom labels', () => {
  const singleLegacy = getEnvCalendarSources({
    CALENDAR_ICS_URL: 'https://example.com/main.ics',
  });
  assert.equal(singleLegacy.length, 1);
  assert.equal(singleLegacy[0].id, 'default');
  assert.equal(singleLegacy[0].label, 'Principal');
  assert.equal(singleLegacy[0].hasExplicitLabel, false);

  const multi = getEnvCalendarSources({
    CALENDAR_ICS_URL: 'https://example.com/main.ics',
    CALENDAR_ICS_URL_PRO: 'https://example.com/pro.ics',
    CALENDAR_ICS_LABEL_PRO: 'Clinique SMR',
    CALENDAR_ICS_URL_PERSO: 'https://example.com/perso.ics',
    CALENDAR_ICS_URL_EMPTY: '   ',
  });

  assert.equal(multi.length, 3);
  assert.deepEqual(
    multi.map(c => ({ id: c.id, label: c.label, envVar: c.envVar, explicit: c.hasExplicitLabel })),
    [
      { id: 'default', label: 'Principal', envVar: 'CALENDAR_ICS_URL', explicit: true },
      { id: 'pro', label: 'Clinique SMR', envVar: 'CALENDAR_ICS_URL_PRO', explicit: true },
      { id: 'perso', label: 'Perso', envVar: 'CALENDAR_ICS_URL_PERSO', explicit: true },
    ]
  );

  // Single suffixed calendar still gets its explicit label
  const singlePro = getEnvCalendarSources({
    CALENDAR_ICS_URL_PRO: 'https://example.com/pro.ics',
  });
  assert.equal(singlePro.length, 1);
  assert.equal(singlePro[0].label, 'Pro');
  assert.equal(singlePro[0].hasExplicitLabel, true);
});

test('validateExternalCalendarUrl accepts https/webcal and blocks private/loopback URLs', () => {
  assert.equal(
    validateExternalCalendarUrl('webcal://calendar.google.com/cal.ics'),
    'https://calendar.google.com/cal.ics'
  );
  assert.throws(() => validateExternalCalendarUrl('http://localhost:8080/cal.ics'));
  assert.throws(() => validateExternalCalendarUrl('http://127.0.0.1/cal.ics'));
  assert.throws(() => validateExternalCalendarUrl('http://169.254.169.254/latest/meta-data/'));
  assert.throws(() => validateExternalCalendarUrl('file:///etc/passwd'));
});

test('getSyncedCalendarEvents coalesces concurrent cold fetches and serves subsequent calls from cache', async () => {
  const origFetch = globalThis.fetch;
  const origUrl = process.env.CALENDAR_ICS_URL;
  clearCalendarSyncCacheForTests();

  const sampleIcs = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:coalesce-evt-1',
    'DTSTART:20261109T090000Z',
    'DTEND:20261109T100000Z',
    'SUMMARY:Réunion test',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  let fetchCalls = 0;
  let releaseFetch!: () => void;
  const gate = new Promise<void>(resolve => {
    releaseFetch = resolve;
  });

  globalThis.fetch = (async () => {
    fetchCalls++;
    await gate;
    return new Response(sampleIcs, { status: 200, headers: { 'content-type': 'text/calendar' } });
  }) as typeof fetch;

  try {
    process.env.CALENDAR_ICS_URL = 'https://example.com/coalesce.ics';
    const target = new Date('2026-11-09T09:30:00Z');

    // Launch two concurrent non-forced syncs while fetch is pending
    const p1 = getSyncedCalendarEvents(undefined, false, target);
    const p2 = getSyncedCalendarEvents(undefined, false, target);

    releaseFetch();
    const [res1, res2] = await Promise.all([p1, p2]);

    assert.equal(fetchCalls, 1, 'Concurrent cold fetches should share a single upstream HTTP request');
    assert.equal(res1.events.length, 1);
    assert.equal(res2.events.length, 1);
    assert.equal(res1.fromCache, false);
    assert.equal(res2.fromCache, false);

    // Subsequent call should hit in-memory cache with 0 extra fetch calls
    const resCached = await getSyncedCalendarEvents(undefined, false, target);
    assert.equal(fetchCalls, 1);
    assert.equal(resCached.fromCache, true);
    assert.equal(resCached.events.length, 1);
  } finally {
    globalThis.fetch = origFetch;
    if (origUrl === undefined) {
      delete process.env.CALENDAR_ICS_URL;
    } else {
      process.env.CALENDAR_ICS_URL = origUrl;
    }
    clearCalendarSyncCacheForTests();
  }
});

