import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSemanticWeakEtag,
  buildBadgeImageEtag,
  matchesIfNoneMatch,
} from './etag.ts';

test('computeSemanticWeakEtag produces stable weak ETag and matches If-None-Match headers', () => {
  const etagA = computeSemanticWeakEtag({ status: 'AVAILABLE', localTime: '10:00', count: 1 });
  const etagB = computeSemanticWeakEtag({ status: 'AVAILABLE', localTime: '10:00', count: 1 });
  const etagC = computeSemanticWeakEtag({ status: 'BUSY', localTime: '10:00', count: 1 });

  assert.ok(etagA.startsWith('W/"'));
  assert.equal(etagA, etagB);
  assert.notEqual(etagA, etagC);

  assert.equal(matchesIfNoneMatch(etagA, etagA), true);
  assert.equal(matchesIfNoneMatch(`"other", ${etagA}`, etagA), true);
  assert.equal(matchesIfNoneMatch('*', etagA), true);
  assert.equal(matchesIfNoneMatch(etagC, etagA), false);
  assert.equal(matchesIfNoneMatch(undefined, etagA), false);
});

test('buildBadgeImageEtag isolates mode, format, theme, and activeCalendarLabel', () => {
  const baseAvail = {
    status: 'BUSY',
    state: 'BUSY',
    isWorkTime: true,
    title: 'En rendez-vous',
    subtitle: "Jusqu'à 11:00",
    badgeColor: '#fef2f2',
    dotColor: '#ef4444',
    activeCalendarLabel: 'Pro',
    todayAppointmentsCount: 2,
    todayAllDayAppointmentsCount: 0,
  };
  const baseOptions = {
    style: 'pill',
    theme: 'light',
    name: 'Alice',
    role: 'Design',
    company: 'Studio',
    lang: 'fr',
    mode: 'person',
  };

  const pngPerson = buildBadgeImageEtag('png', baseAvail, baseOptions);
  const pngPersonSame = buildBadgeImageEtag('png', baseAvail, { ...baseOptions });
  const svgPerson = buildBadgeImageEtag('svg', baseAvail, baseOptions);
  const pngShop = buildBadgeImageEtag('png', baseAvail, { ...baseOptions, mode: 'shop' });
  const pngPersoCal = buildBadgeImageEtag(
    'png',
    { ...baseAvail, activeCalendarLabel: 'Perso' },
    baseOptions
  );

  assert.equal(pngPerson, pngPersonSame);
  assert.notEqual(pngPerson, svgPerson);
  assert.notEqual(pngPerson, pngShop);
  assert.notEqual(pngPerson, pngPersoCal);
});
