import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyStudioPassword,
  createStudioSessionToken,
  verifyStudioSessionToken,
  extractStudioToken,
  isRequestStudioAuthenticated,
  extractClientIp,
  checkAuthRateLimit,
  recordAuthFailure,
  clearAuthFailures,
  AUTH_MAX_FAILURES,
  AUTH_WINDOW_MS,
  AUTH_LOCKOUT_MS,
} from './studioAuth.ts';

test('verifyStudioPassword validates exact match safely and rejects wrong inputs', () => {
  assert.equal(verifyStudioPassword('mon-super-mdp', 'mon-super-mdp'), true);
  assert.equal(verifyStudioPassword('mon-super-mdp-2', 'mon-super-mdp'), false);
  assert.equal(verifyStudioPassword('', 'mon-super-mdp'), false);
  assert.equal(verifyStudioPassword('anything', ''), false);
});

test('createStudioSessionToken & verifyStudioSessionToken enforce signature and expiry', () => {
  const pwd = 'secret-studio-password';
  const now = 1700000000000;
  const token = createStudioSessionToken(pwd, now, 60_000);

  assert.equal(verifyStudioSessionToken(token, pwd, now + 30_000), true);
  assert.equal(verifyStudioSessionToken(token, pwd, now + 60_000), false); // expired
  assert.equal(verifyStudioSessionToken(token, 'other-password', now + 1000), false);

  const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
  assert.equal(verifyStudioSessionToken(tampered, pwd, now + 1000), false);
});

test('extractStudioToken reads Bearer header and HttpOnly cookie', () => {
  assert.equal(
    extractStudioToken({ authorization: 'Bearer abc.123' }),
    'abc.123'
  );
  assert.equal(
    extractStudioToken({ cookie: 'other=1; dispolive_studio_session=tok%2Ehex; foo=bar' }),
    'tok.hex'
  );
  assert.equal(extractStudioToken({}), null);
});

test('isRequestStudioAuthenticated requires valid token when STUDIO_PASSWORD is set', () => {
  const pwd = 'studio-pass-2026';
  const now = 1700000000000;
  const token = createStudioSessionToken(pwd, now, 60_000);

  assert.equal(isRequestStudioAuthenticated({}, pwd, now + 1000), false);
  assert.equal(
    isRequestStudioAuthenticated({ authorization: `Bearer ${token}` }, pwd, now + 1000),
    true
  );
  // When no password configured, Studio is unlocked
  assert.equal(isRequestStudioAuthenticated({}, '', now), true);
});

test('extractClientIp parses x-forwarded-for, x-real-ip, and fallback socket IP', () => {
  assert.equal(
    extractClientIp({ 'x-forwarded-for': '203.0.113.10, 10.0.0.1' }, '127.0.0.1'),
    '203.0.113.10'
  );
  assert.equal(extractClientIp({ 'x-real-ip': '198.51.100.42' }, '127.0.0.1'), '198.51.100.42');
  assert.equal(extractClientIp({}, '::1'), '::1');
});

test('checkAuthRateLimit & recordAuthFailure block IP after AUTH_MAX_FAILURES until lockout expires or cleared', () => {
  const clientIp = 'test-rate-limit-client-ip-1';
  clearAuthFailures(clientIp);

  const t0 = 1_750_000_000_000;
  assert.equal(checkAuthRateLimit(clientIp, t0).allowed, true);

  for (let i = 1; i < AUTH_MAX_FAILURES; i++) {
    const step = recordAuthFailure(clientIp, t0 + i * 100);
    assert.equal(step.allowed, true);
    assert.equal(step.remainingAttempts, AUTH_MAX_FAILURES - i);
  }

  // 5th consecutive failure triggers lockout
  const blocked = recordAuthFailure(clientIp, t0 + 1000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remainingAttempts, 0);
  assert.ok(blocked.retryAfterSeconds >= Math.ceil(AUTH_LOCKOUT_MS / 1000));

  const whileLocked = checkAuthRateLimit(clientIp, t0 + 15_000);
  assert.equal(whileLocked.allowed, false);
  assert.ok(whileLocked.retryAfterSeconds > 0);

  // After lockout passes, client is allowed again
  const afterLockout = checkAuthRateLimit(clientIp, t0 + 1000 + AUTH_LOCKOUT_MS + 100);
  assert.equal(afterLockout.allowed, true);

  // clearAuthFailures immediately resets counter
  const clientIp2 = 'test-rate-limit-client-ip-2';
  clearAuthFailures(clientIp2);
  recordAuthFailure(clientIp2, t0);
  recordAuthFailure(clientIp2, t0 + 100);
  clearAuthFailures(clientIp2);
  assert.equal(checkAuthRateLimit(clientIp2, t0 + 200).remainingAttempts, AUTH_MAX_FAILURES);

  // Failures older than AUTH_WINDOW_MS expire automatically
  recordAuthFailure(clientIp2, t0);
  assert.equal(
    checkAuthRateLimit(clientIp2, t0 + AUTH_WINDOW_MS + 1).remainingAttempts,
    AUTH_MAX_FAILURES
  );
  clearAuthFailures(clientIp);
  clearAuthFailures(clientIp2);
});

