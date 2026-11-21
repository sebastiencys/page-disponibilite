import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAvailability, type ScheduleConfig } from './availability.ts';
import { renderBadgeSvg, renderBadgePng, buildBadgeTextPayload } from './badgeRenderer.ts';
import { truncateBadgeText } from './badgeSvg.ts';

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

test('renderBadgeSvg generates valid SVG markup with correct colors', () => {
  const now = new Date('2026-11-09T10:15:00+01:00'); // Available in Europe/Paris
  const avail = calculateAvailability(now, TEST_SCHEDULE, []);

  const svg = renderBadgeSvg(avail, { style: 'pill', theme: 'light' });
  assert.ok(svg.includes('<svg'));
  assert.ok(svg.includes('</svg>'));
  assert.ok(svg.includes('Disponible'));
  assert.ok(svg.includes('#10B981') || svg.includes('#10b981'));
});

test('renderBadgeSvg supports dot, card, and signature styles', () => {
  const now = new Date('2026-11-09T14:30:00+01:00');
  const avail = calculateAvailability(now, TEST_SCHEDULE, [
    {
      id: '1',
      title: 'Réunion Client',
      start: '2026-11-09T14:00:00+01:00',
      end: '2026-11-09T15:00:00+01:00',
    },
  ]);

  const dotSvg = renderBadgeSvg(avail, { style: 'dot' });
  assert.ok(dotSvg.includes('width="42"'));
  assert.ok(dotSvg.includes('#DC2626') || dotSvg.includes('#dc2626'));

  const dotPlainSvg = renderBadgeSvg({ ...avail, todayAppointmentsCount: 0 }, { style: 'dot' });
  assert.ok(dotPlainSvg.includes('width="36"'));

  const cardSvg = renderBadgeSvg(avail, { style: 'card', name: 'Sophie Martin' });
  assert.ok(cardSvg.includes('Sophie Martin'));

  const sigSvg = renderBadgeSvg(avail, { style: 'signature', name: 'Sophie Martin' });
  assert.ok(sigSvg.includes('SM'));
});

test('renderBadgePng generates valid PNG binary buffer with correct magic bytes', () => {
  const now = new Date('2026-11-09T10:15:00');
  const avail = calculateAvailability(now, TEST_SCHEDULE, []);

  const pngBuf = renderBadgePng(avail, { style: 'pill' });
  assert.ok(Buffer.isBuffer(pngBuf));
  assert.ok(pngBuf.length > 100);

  // Check PNG magic bytes: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  const expectedMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < expectedMagic.length; i++) {
    assert.equal(pngBuf[i], expectedMagic[i], `Byte at ${i} should match PNG signature`);
  }

  // Check IHDR and IEND chunks
  const asAscii = pngBuf.toString('ascii');
  assert.ok(asAscii.includes('IHDR'));
  assert.ok(asAscii.includes('IDAT'));
  assert.ok(asAscii.includes('IEND'));
});

test('renderBadgePng produces distinct outputs for pill, card, signature, and dot styles', () => {
  const now = new Date('2026-11-09T10:15:00');
  const avail = calculateAvailability(now, TEST_SCHEDULE, []);

  const dotPng = renderBadgePng(avail, { style: 'dot' });
  const pillPng = renderBadgePng(avail, { style: 'pill' });
  const cardPng = renderBadgePng(avail, { style: 'card', name: 'Alexandre Martin' });
  const sigPng = renderBadgePng(avail, { style: 'signature', name: 'Alexandre Martin', role: 'Dev' });

  // Each style must generate valid PNG
  assert.ok(dotPng.length > 0);
  assert.ok(pillPng.length > 0);
  assert.ok(cardPng.length > 0);
  assert.ok(sigPng.length > 0);

  // Each style must produce different byte lengths/dimensions
  assert.notEqual(dotPng.length, pillPng.length, 'Dot and Pill PNG sizes should differ');
  assert.notEqual(pillPng.length, cardPng.length, 'Pill and Card PNG sizes should differ');
  assert.notEqual(cardPng.length, sigPng.length, 'Card and Signature PNG sizes should differ');
});

test('badges stay on 2 lines / plain 36x36 dot when todayAppointmentsCount is 0 even if future events exist', () => {
  const now = new Date('2026-11-09T10:15:00+01:00');
  const avail = calculateAvailability(now, TEST_SCHEDULE, [
    {
      id: 'tomorrow-only',
      title: 'RDV demain',
      start: '2026-11-10T10:00:00+01:00',
      end: '2026-11-10T11:00:00+01:00',
      isBusy: true,
    },
  ]);

  assert.equal(avail.todayAppointmentsCount, 0);

  const pill = renderBadgeSvg(avail, { style: 'pill' });
  assert.ok(pill.includes('width="400" height="54"'));
  assert.ok(!pill.includes('RDV'));

  const card = renderBadgeSvg(avail, { style: 'card' });
  assert.ok(card.includes('width="380" height="100"'));
  assert.ok(!card.includes('RDV'));

  const sig = renderBadgeSvg(avail, { style: 'signature' });
  assert.ok(sig.includes('width="480" height="114"'));
  assert.ok(!sig.includes('RDV'));

  const dot = renderBadgeSvg(avail, { style: 'dot' });
  assert.ok(dot.includes('width="36" height="36"'));
  assert.ok(!dot.includes('#4f46e5'));
});

test('badges show 3rd line on pill/card/signature and counter pill on dot when todayAppointmentsCount > 0', () => {
  const now = new Date('2026-11-09T10:15:00+01:00');

  // 1 appointment today -> singular label
  const availOne = calculateAvailability(now, TEST_SCHEDULE, [
    {
      id: 'rdv-1',
      title: 'RDV 1',
      start: '2026-11-09T14:00:00+01:00',
      end: '2026-11-09T14:30:00+01:00',
      isBusy: true,
    },
  ]);
  assert.equal(availOne.todayAppointmentsCount, 1);

  const pillOne = renderBadgeSvg(availOne, { style: 'pill' });
  assert.ok(pillOne.includes('width="400" height="70"'));
  assert.ok(pillOne.includes('1 RDV prévu aujourd&apos;hui'));

  const cardOne = renderBadgeSvg(availOne, { style: 'card' });
  assert.ok(cardOne.includes('width="380" height="118"'));
  assert.ok(cardOne.includes('1 RDV prévu aujourd&apos;hui'));

  const sigOne = renderBadgeSvg(availOne, { style: 'signature' });
  assert.ok(sigOne.includes('width="480" height="132"'));
  assert.ok(sigOne.includes('1 RDV prévu aujourd&apos;hui'));

  const dotOne = renderBadgeSvg(availOne, { style: 'dot' });
  assert.ok(dotOne.includes('width="42" height="38"'));
  assert.ok(dotOne.includes('>1</text>'));

  // 3 appointments today -> plural label + distinct PNG outputs
  const availThree = { ...availOne, todayAppointmentsCount: 3 };
  const pillThree = renderBadgeSvg(availThree, { style: 'pill', theme: 'dark' });
  assert.ok(pillThree.includes('3 RDV prévus aujourd&apos;hui'));

  const dotTwelve = renderBadgeSvg({ ...availOne, todayAppointmentsCount: 12 }, { style: 'dot' });
  assert.ok(dotTwelve.includes('width="44" height="38"'));
  assert.ok(dotTwelve.includes('>12</text>'));

  const pillZeroPng = renderBadgePng({ ...availOne, todayAppointmentsCount: 0 }, { style: 'pill' });
  const pillThreePng = renderBadgePng(availThree, { style: 'pill' });
  const dotZeroPng = renderBadgePng({ ...availOne, todayAppointmentsCount: 0 }, { style: 'dot' });
  const dotThreePng = renderBadgePng(availThree, { style: 'dot' });

  assert.ok(pillThreePng.length > 100);
  assert.ok(dotThreePng.length > 100);
  assert.notEqual(pillZeroPng.length, pillThreePng.length, '3-line pill PNG should differ from 2-line pill PNG');
  assert.notEqual(dotZeroPng.length, dotThreePng.length, 'Dot PNG with counter pill should differ from plain dot PNG');
});

test('badges specify (journée entière) when today appointments span full day', () => {
  const now = new Date('2026-11-23T10:00:00+04:00');
  const availAllDay = calculateAvailability(now, TEST_SCHEDULE, [
    {
      id: 'all-day-1',
      title: 'Formation',
      start: '2026-11-23T00:00:00+04:00',
      end: '2026-11-24T00:00:00+04:00',
      isAllDay: true,
      allDayStartDate: '2026-11-23',
      allDayEndDate: '2026-11-24',
      isBusy: true,
    },
  ], undefined, 'Indian/Reunion');

  assert.equal(availAllDay.todayAppointmentsCount, 1);
  assert.equal(availAllDay.todayAllDayAppointmentsCount, 1);

  const pill = renderBadgeSvg(availAllDay, { style: 'pill' });
  assert.ok(pill.includes('1 RDV (journée entière) aujourd&apos;hui'));

  const card = renderBadgeSvg(availAllDay, { style: 'card' });
  assert.ok(card.includes('1 RDV (journée entière) aujourd&apos;hui'));

  const sig = renderBadgeSvg(availAllDay, { style: 'signature' });
  assert.ok(sig.includes('1 RDV (journée entière) aujourd&apos;hui'));

  // 2 all-day appointments -> "2 RDV (journée entière) aujourd'hui"
  const pillTwoAllDay = renderBadgeSvg(
    { ...availAllDay, todayAppointmentsCount: 2, todayAllDayAppointmentsCount: 2 },
    { style: 'pill' }
  );
  assert.ok(pillTwoAllDay.includes('2 RDV (journée entière) aujourd&apos;hui'));

  // Mixed: 2 total with 1 all-day -> "2 RDV (dont journée entière) aujourd'hui"
  const pillMixed = renderBadgeSvg(
    { ...availAllDay, todayAppointmentsCount: 2, todayAllDayAppointmentsCount: 1 },
    { style: 'pill' }
  );
  assert.ok(pillMixed.includes('2 RDV (dont journée entière) aujourd&apos;hui'));

  const pngAllDay = renderBadgePng(availAllDay, { style: 'card' });
  assert.ok(pngAllDay.length > 100);
});

test('buildBadgeTextPayload returns structured text lines matching badge labels', () => {
  const nowZero = new Date('2026-11-22T10:00:00+04:00');
  const availZero = calculateAvailability(nowZero, TEST_SCHEDULE, [], undefined, 'Indian/Reunion');
  const payloadZero = buildBadgeTextPayload(availZero, {
    name: 'Dr Test',
    role: 'Médecin',
    company: 'Clinique',
    timezone: 'Indian/Reunion',
    now: nowZero,
  });

  assert.equal(payloadZero.status, 'OFF_HOURS');
  assert.equal(payloadZero.state, 'off');
  assert.equal(payloadZero.todayAppointmentsCount, 0);
  assert.equal(payloadZero.todayAllDayAppointmentsCount, 0);
  assert.equal(payloadZero.appointmentsLabel, null);
  assert.deepEqual(payloadZero.lines, [availZero.title, availZero.subtitle]);
  assert.equal(payloadZero.text, `${availZero.title} — ${availZero.subtitle}`);
  assert.equal(payloadZero.localDate, '2026-11-22');
  assert.equal(payloadZero.localTime, '10h00');
  assert.equal(payloadZero.timezone, 'Indian/Reunion');
  assert.deepEqual(payloadZero.profile, {
    name: 'Dr Test',
    role: 'Médecin',
    company: 'Clinique',
  });

  const nowAllDay = new Date('2026-11-23T10:00:00+04:00');
  const availAllDay = calculateAvailability(
    nowAllDay,
    TEST_SCHEDULE,
    [
      {
        id: 'all-day-mon',
        title: 'Secret Title Must Not Leak',
        start: '2026-11-23T00:00:00+04:00',
        end: '2026-11-24T00:00:00+04:00',
        isAllDay: true,
        allDayStartDate: '2026-11-23',
        allDayEndDate: '2026-11-24',
        isBusy: true,
      },
    ],
    undefined,
    'Indian/Reunion'
  );
  const payloadAllDay = buildBadgeTextPayload(availAllDay, {
    timezone: 'Indian/Reunion',
    now: nowAllDay,
  });

  assert.equal(payloadAllDay.status, 'BUSY');
  assert.equal(payloadAllDay.todayAppointmentsCount, 1);
  assert.equal(payloadAllDay.todayAllDayAppointmentsCount, 1);
  assert.equal(payloadAllDay.appointmentsLabel, "1 RDV (journée entière) aujourd'hui");
  assert.equal(payloadAllDay.lines.length, 3);
  assert.equal(payloadAllDay.lines[2], "1 RDV (journée entière) aujourd'hui");
  assert.ok(payloadAllDay.text.includes("• 1 RDV (journée entière) aujourd'hui"));
  assert.ok(!JSON.stringify(payloadAllDay).includes('Secret Title Must Not Leak'));

  // Mixed day: 2 appointments with 1 all-day
  const payloadMixed = buildBadgeTextPayload({
    ...availAllDay,
    todayAppointmentsCount: 2,
    todayAllDayAppointmentsCount: 1,
  });
  assert.equal(payloadMixed.appointmentsLabel, "2 RDV (dont journée entière) aujourd'hui");
});

test('truncateBadgeText prevents text overflow inside fixed-width pill, card, and signature SVGs', () => {
  assert.equal(truncateBadgeText('Court', 20), 'Court');
  const trimmed = truncateBadgeText('Texte extrêmement long qui doit être coupé', 15);
  assert.equal(trimmed.length, 15);
  assert.ok(trimmed.endsWith('…'));

  const now = new Date('2026-11-09T10:15:00+01:00');
  const baseAvail = calculateAvailability(now, TEST_SCHEDULE, []);
  const longAvail = {
    ...baseAvail,
    title: 'En réunion très urgente avec beaucoup trop de caractères pour un petit badge',
    subtitle: 'Reprise exceptionnelle après une longue absence prévue lundi prochain à 08h30',
  };

  const pillSvg = renderBadgeSvg(longAvail, { style: 'pill', theme: 'light' });
  assert.ok(!pillSvg.includes(longAvail.title));
  assert.ok(!pillSvg.includes(longAvail.subtitle));
  assert.ok(pillSvg.includes('…'));

  const cardSvg = renderBadgeSvg(longAvail, {
    style: 'card',
    name: 'Dr Jean-Baptiste-Alexandre De La Rochefoucauld',
  });
  assert.ok(!cardSvg.includes('De La Rochefoucauld'));
  assert.ok(cardSvg.includes('…'));
});

