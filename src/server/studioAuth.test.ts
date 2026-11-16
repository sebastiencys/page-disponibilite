import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyStudioPassword,
  createStudioSessionToken,
  verifyStudioSessionToken,
  extractStudioToken,
  isRequestStudioAuthenticated,
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
