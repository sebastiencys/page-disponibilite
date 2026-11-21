import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasEnvCalendar,
  getCalendarUrl,
  getEnvCalendarSources,
  formatCalendarLabel,
  validateExternalCalendarUrl,
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
