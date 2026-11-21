import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AUTO_REFRESH_MS,
  AUTO_REFRESH_OPTIONS,
  normalizeAutoRefreshMs,
  buildAvailabilityFingerprint,
  buildBadgePublicUrl,
  buildBadgePreviewUrl,
  shouldTriggerAutoRefresh,
  formatRemainingRefreshTime,
} from './badgeRefresh.ts';
import type { AvailabilityResult } from './availability.ts';

function makeAvailability(overrides: Partial<AvailabilityResult> = {}): AvailabilityResult {
  return {
    state: 'available',
    status: 'AVAILABLE',
    title: 'Disponible',
    subtitle: "Jusqu'à 12h30",
    badgeColor: '#10B981',
    dotColor: '#059669',
    isWorkTime: true,
    todayAppointmentsCount: 0,
    todayAllDayAppointmentsCount: 0,
    activeCalendarLabel: undefined,
    nextChangeDate: new Date('2026-11-23T08:30:00.000Z'),
    ...overrides,
  };
}

test('DEFAULT_AUTO_REFRESH_MS defaults to 10 minutes and normalizes invalid inputs', () => {
  assert.equal(DEFAULT_AUTO_REFRESH_MS, 10 * 60 * 1000);
  assert.ok(AUTO_REFRESH_OPTIONS.some(o => o.ms === DEFAULT_AUTO_REFRESH_MS));
  assert.equal(normalizeAutoRefreshMs(undefined), DEFAULT_AUTO_REFRESH_MS);
  assert.equal(normalizeAutoRefreshMs('invalid'), DEFAULT_AUTO_REFRESH_MS);
  assert.equal(normalizeAutoRefreshMs(99999), DEFAULT_AUTO_REFRESH_MS);
  assert.equal(normalizeAutoRefreshMs('0'), 0);
  assert.equal(normalizeAutoRefreshMs(300000), 300000);
});

test('buildAvailabilityFingerprint changes when any badge-visible field changes', () => {
  const base = makeAvailability();
  const same = makeAvailability();
  assert.equal(buildAvailabilityFingerprint(base), buildAvailabilityFingerprint(same));

  const busy = makeAvailability({ state: 'busy', status: 'BUSY', title: 'En réunion (Pro)' });
  assert.notEqual(buildAvailabilityFingerprint(base), buildAvailabilityFingerprint(busy));

  const withRdv = makeAvailability({ todayAppointmentsCount: 2, todayAllDayAppointmentsCount: 1 });
  assert.notEqual(buildAvailabilityFingerprint(base), buildAvailabilityFingerprint(withRdv));
});

test('buildBadgePublicUrl stays clean while buildBadgePreviewUrl includes cache-buster v', () => {
  const pub = buildBadgePublicUrl('https://dispolive.example.com/', {
    format: 'png',
    style: 'pill',
    theme: 'light',
    name: 'Jean Dupont',
    role: 'Consultant',
    company: 'Acme',
  });
  assert.equal(
    pub,
    'https://dispolive.example.com/api/badge.png?style=pill&theme=light&name=Jean%20Dupont&role=Consultant&company=Acme'
  );
  assert.ok(!pub.includes('&v='));

  const preview = buildBadgePreviewUrl(
    'https://dispolive.example.com/',
    {
      format: 'svg',
      style: 'card',
      theme: 'dark',
      name: 'Jean Dupont',
      role: 'Consultant',
      company: 'Acme',
    },
    1763715322000
  );
  assert.equal(
    preview,
    'https://dispolive.example.com/api/badge.svg?style=card&theme=dark&name=Jean%20Dupont&role=Consultant&company=Acme&v=1763715322000'
  );
});

test('shouldTriggerAutoRefresh triggers accurately at >= 10 min and stays off when disabled (0)', () => {
  const start = 1_700_000_000_000;
  assert.equal(shouldTriggerAutoRefresh(start, start + 9 * 60 * 1000, DEFAULT_AUTO_REFRESH_MS), false);
  assert.equal(shouldTriggerAutoRefresh(start, start + 10 * 60 * 1000, DEFAULT_AUTO_REFRESH_MS), true);
  assert.equal(shouldTriggerAutoRefresh(start, start + 25 * 60 * 1000, DEFAULT_AUTO_REFRESH_MS), true);
  assert.equal(shouldTriggerAutoRefresh(start, start + 60 * 60 * 1000, 0), false);
});

test('formatRemainingRefreshTime formats countdown cleanly', () => {
  const start = 1_700_000_000_000;
  assert.equal(formatRemainingRefreshTime(start, start, 600_000), '10 min');
  assert.equal(formatRemainingRefreshTime(start, start + 4 * 60 * 1000, 600_000), '6 min');
  assert.equal(formatRemainingRefreshTime(start, start + 9 * 60 * 1000 + 30_000, 600_000), '< 1 min');
  assert.equal(formatRemainingRefreshTime(start, start, 0), 'Manuel');
});

test('buildBadgePublicUrl includes lang=en only when English is requested', () => {
  const baseParams = {
    format: 'svg' as const,
    style: 'signature' as const,
    theme: 'transparent-dark' as const,
    name: 'Jean Dupont',
    role: 'Consultant',
    company: 'Acme',
  };
  const frUrl = buildBadgePublicUrl('https://dispolive.example.com', { ...baseParams, lang: 'fr' });
  assert.ok(!frUrl.includes('lang='));

  const enUrl = buildBadgePublicUrl('https://dispolive.example.com', { ...baseParams, lang: 'en' });
  assert.ok(enUrl.endsWith('&lang=en'));
  assert.ok(enUrl.includes('theme=transparent-dark'));
});

