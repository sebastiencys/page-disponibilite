import test from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { convertJsonToEnvOutput } from './envJson.ts';

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
