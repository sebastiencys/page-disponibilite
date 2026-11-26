import test from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {
  convertJsonToEnvOutput,
  convertProfileToGranularEnv,
  convertScheduleToGranularEnv,
} from './envJson.ts';
import {
  DEFAULT_PROFILE,
  resolveProfileFromEnv,
  resolveScheduleFromEnv,
  type ScheduleConfig,
} from './availability.ts';

test('convertJsonToEnvOutput minifies multi-line personal.json into dotenv-safe PERSONAL_JSON', () => {
  const input = `{
    "name": "Jean-Luc d'Artagnan",
    "role": "Médecin généraliste",
    "company": "Clinique d'Est",
    "email": null,
    "bookingUrl": "",
    "mode": "shop"
  }`;

  const res = convertJsonToEnvOutput(input, 'PERSONAL_JSON');
  assert.equal(res.ok, true);
  if (!res.ok) return;

  assert.ok(res.envLine.startsWith("PERSONAL_JSON='"));
  assert.ok(res.envLine.endsWith("'"));
  assert.ok(!res.minifiedValue.includes('\n'));
  // Single quotes escaped as \u0027 so dotenv preserves intact single-quoted string
  assert.ok(!res.minifiedValue.includes("'"));

  const parsedEnv = dotenv.parse(res.envLine);
  const parsedObj = JSON.parse(parsedEnv.PERSONAL_JSON);
  assert.deepEqual(parsedObj, {
    name: "Jean-Luc d'Artagnan",
    role: 'Médecin généraliste',
    company: "Clinique d'Est",
    email: '',
    bookingUrl: '',
    mode: 'shop',
  });
});

test('convertJsonToEnvOutput minifies schedule.json with apostrophes and rejects invalid payloads', () => {
  const scheduleInput = `{
    "timezone": "Indian/Reunion",
    "days": {
      "1": { "enabled": false, "start": "08:30", "end": "17:30" },
      "2": { "enabled": true, "start": "08:30", "end": "17:30" }
    },
    "lunchBreak": {
      "enabled": true,
      "start": "12:30",
      "end": "13:30",
      "label": "Pause déjeuner"
    },
    "closures": [
      { "startDate": "01-01", "label": "Jour de l'an", "annual": true }
    ]
  }`;

  const res = convertJsonToEnvOutput(scheduleInput, 'SCHEDULE_JSON');
  assert.equal(res.ok, true);
  if (!res.ok) return;

  const parsedEnv = dotenv.parse(res.envLine);
  const parsedObj = JSON.parse(parsedEnv.SCHEDULE_JSON);
  assert.equal(parsedObj.timezone, 'Indian/Reunion');
  assert.equal(parsedObj.closures[0].label, "Jour de l'an");

  assert.equal(convertJsonToEnvOutput('', 'SCHEDULE_JSON').ok, false);
  assert.equal(convertJsonToEnvOutput('{invalid', 'SCHEDULE_JSON').ok, false);
  assert.equal(convertJsonToEnvOutput('["not", "an", "object"]', 'PERSONAL_JSON').ok, false);
  assert.equal(convertJsonToEnvOutput('{"foo":"bar"}', 'PERSONAL_JSON').ok, false);
  assert.equal(convertJsonToEnvOutput('{"foo":"bar"}', 'SCHEDULE_JSON').ok, false);
});

test('convertScheduleToGranularEnv emits readable SCHEDULE_* lines that round-trip cleanly through resolveScheduleFromEnv', () => {
  const sourceSchedule: ScheduleConfig = {
    timezone: 'Indian/Reunion',
    days: {
      1: { enabled: false, start: '09:00', end: '18:00' },
      2: { enabled: true, start: '08:30', end: '17:30' },
      3: { enabled: true, start: '08:30', end: '17:30' },
      4: { enabled: true, start: '08:30', end: '17:30' },
      5: { enabled: true, start: '08:30', end: '12:30' },
      6: { enabled: false, start: '09:00', end: '13:00' },
      0: { enabled: false, start: '09:00', end: '18:00' },
    },
    lunchBreak: {
      enabled: true,
      start: '12:30',
      end: '13:30',
      label: 'Pause méridienne',
      days: {
        4: { enabled: true, start: '12:00', end: '12:45' },
        5: { enabled: false },
      },
    },
    bufferMinutes: 10,
    closures: [
      { startDate: '12-25', label: 'Noël', type: 'holiday', annual: true },
      { startDate: '2026-08-01', endDate: '2026-08-15', label: 'Congés été', type: 'vacation' },
    ],
  };

  const granular = convertScheduleToGranularEnv(sourceSchedule);
  assert.ok(granular.lines.includes('SCHEDULE_TIMEZONE="Indian/Reunion"'));
  assert.ok(granular.lines.includes('SCHEDULE_WORK_DAYS="tue,wed,thu,fri"'));
  assert.ok(granular.lines.includes('SCHEDULE_HOURS="08:30-17:30"'));
  assert.ok(granular.lines.includes('SCHEDULE_HOURS_FRI="08:30-12:30"'));
  assert.ok(granular.lines.includes('SCHEDULE_LUNCH_LABEL="Pause méridienne"'));
  assert.ok(granular.lines.includes('SCHEDULE_LUNCH_HOURS_THU="12:00-12:45"'));
  assert.ok(granular.lines.includes('SCHEDULE_LUNCH_HOURS_FRI="off"'));
  assert.ok(granular.lines.includes('SCHEDULE_BUFFER_MINUTES="10"'));

  const emptyBase: ScheduleConfig = {
    timezone: 'Europe/Paris',
    days: {
      0: { enabled: false, start: '09:00', end: '18:00' },
      1: { enabled: false, start: '09:00', end: '18:00' },
      2: { enabled: false, start: '09:00', end: '18:00' },
      3: { enabled: false, start: '09:00', end: '18:00' },
      4: { enabled: false, start: '09:00', end: '18:00' },
      5: { enabled: false, start: '09:00', end: '18:00' },
      6: { enabled: false, start: '09:00', end: '18:00' },
    },
    lunchBreak: { enabled: false, start: '12:30', end: '13:30', label: 'Pause déjeuner' },
    bufferMinutes: 0,
  };

  const parsedEnv = dotenv.parse(granular.envBlock);
  const roundTripped = resolveScheduleFromEnv(parsedEnv, emptyBase);

  assert.equal(roundTripped.timezone, 'Indian/Reunion');
  assert.equal(roundTripped.days[1].enabled, false);
  assert.deepEqual(roundTripped.days[2], { enabled: true, start: '08:30', end: '17:30' });
  assert.deepEqual(roundTripped.days[5], { enabled: true, start: '08:30', end: '12:30' });
  assert.equal(roundTripped.lunchBreak.label, 'Pause méridienne');
  assert.deepEqual(roundTripped.lunchBreak.days?.[4], { enabled: true, start: '12:00', end: '12:45' });
  assert.deepEqual(roundTripped.lunchBreak.days?.[5], { enabled: false });
  assert.equal(roundTripped.bufferMinutes, 10);
  assert.deepEqual(roundTripped.closures, sourceSchedule.closures);
});

test('convertProfileToGranularEnv emits PROFILE_* lines that round-trip through resolveProfileFromEnv', () => {
  const sourceProfile = {
    name: 'Cabinet Santé',
    role: 'Consultations & Soins',
    company: 'Clinique "Sud"',
    email: '',
    bookingUrl: 'https://cal.example.com/rdv',
    mode: 'shop' as const,
  };

  const granular = convertProfileToGranularEnv(sourceProfile);
  assert.equal(granular.lines.length, 6);
  assert.ok(granular.lines.includes('PROFILE_NAME="Cabinet Santé"'));
  assert.ok(granular.lines.includes('PROFILE_EMAIL=""'));
  assert.ok(granular.lines.includes('PROFILE_MODE="shop"'));

  const parsedEnv = dotenv.parse(granular.envBlock);
  const resolved = resolveProfileFromEnv(parsedEnv, DEFAULT_PROFILE);

  assert.deepEqual(resolved, sourceProfile);
});


