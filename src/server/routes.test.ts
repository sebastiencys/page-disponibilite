import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleApiRequest, globalStore } from './routes.ts';
import { createStudioSessionToken } from './studioAuth.ts';

interface MockResponseData {
  statusCode: number;
  headers: Record<string, string>;
  body: Buffer;
  text: string;
}

function createMockReqRes(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  bodyStr?: string
): { req: IncomingMessage; res: ServerResponse; done: Promise<MockResponseData> } {
  const reqEmitter = new EventEmitter() as IncomingMessage & EventEmitter;
  reqEmitter.method = method;
  reqEmitter.url = url;
  reqEmitter.headers = headers;
  (reqEmitter as any).socket = { remoteAddress: '127.0.0.1' };

  const headerStore: Record<string, string> = {};
  let resolveDone!: (data: MockResponseData) => void;
  const done = new Promise<MockResponseData>(resolve => {
    resolveDone = resolve;
  });

  const resState = { statusCode: 200 };
  const resMock = {
    get statusCode() {
      return resState.statusCode;
    },
    set statusCode(code: number) {
      resState.statusCode = code;
    },
    setHeader(name: string, value: string | number | readonly string[]) {
      headerStore[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
      return resMock;
    },
    getHeader(name: string) {
      return headerStore[name.toLowerCase()];
    },
    end(chunk?: Buffer | string) {
      const buf = chunk
        ? Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(String(chunk), 'utf8')
        : Buffer.alloc(0);
      resolveDone({
        statusCode: resState.statusCode,
        headers: headerStore,
        body: buf,
        text: buf.toString('utf8'),
      });
    },
  } as unknown as ServerResponse;

  // Emit request body asynchronously if present (needed for readBody listeners attached inside handler)
  if (bodyStr !== undefined) {
    queueMicrotask(() => {
      reqEmitter.emit('data', Buffer.from(bodyStr, 'utf8'));
      reqEmitter.emit('end');
    });
  }

  return { req: reqEmitter, res: resMock, done };
}

test('/api/calendar-info requires Studio authentication when STUDIO_PASSWORD is set', async () => {
  const prevPassword = process.env.STUDIO_PASSWORD;
  process.env.STUDIO_PASSWORD = 'test-studio-password';
  try {
    const unauth = createMockReqRes('GET', '/api/calendar-info');
    await handleApiRequest(unauth.req, unauth.res);
    const unauthRes = await unauth.done;
    assert.equal(unauthRes.statusCode, 401);

    const token = createStudioSessionToken();
    const auth = createMockReqRes('GET', '/api/calendar-info', {
      authorization: `Bearer ${token}`,
    });
    await handleApiRequest(auth.req, auth.res);
    const authRes = await auth.done;
    assert.equal(authRes.statusCode, 200);
    const payload = JSON.parse(authRes.text);
    assert.equal(typeof payload.eventCount, 'number');
    assert.ok(Array.isArray(payload.calendars));
  } finally {
    if (prevPassword === undefined) {
      delete process.env.STUDIO_PASSWORD;
    } else {
      process.env.STUDIO_PASSWORD = prevPassword;
    }
  }
});

test('/api/health omits detailed calendars list unless authenticated and exposes allCalendarsHealthy', async () => {
  const prevPassword = process.env.STUDIO_PASSWORD;
  process.env.STUDIO_PASSWORD = 'test-studio-password';
  try {
    const unauth = createMockReqRes('GET', '/api/health');
    await handleApiRequest(unauth.req, unauth.res);
    const unauthRes = await unauth.done;
    assert.equal(unauthRes.statusCode, 200);
    const unauthJson = JSON.parse(unauthRes.text);
    assert.equal(unauthJson.ok, true);
    assert.equal(typeof unauthJson.allCalendarsHealthy, 'boolean');
    assert.equal(unauthJson.calendars, undefined);

    const token = createStudioSessionToken();
    const auth = createMockReqRes('GET', '/api/health', {
      authorization: `Bearer ${token}`,
    });
    await handleApiRequest(auth.req, auth.res);
    const authRes = await auth.done;
    assert.equal(authRes.statusCode, 200);
    const authJson = JSON.parse(authRes.text);
    assert.ok(Array.isArray(authJson.calendars));
  } finally {
    if (prevPassword === undefined) {
      delete process.env.STUDIO_PASSWORD;
    } else {
      process.env.STUDIO_PASSWORD = prevPassword;
    }
  }
});

test('/api/status sanitizes "null" email/bookingUrl and respects PROFILE_MODE env override', async () => {
  const prevPassword = process.env.STUDIO_PASSWORD;
  const prevMode = process.env.PROFILE_MODE;
  const prevEmail = globalStore.email;
  const prevBooking = globalStore.bookingUrl;
  const prevStoreMode = globalStore.mode;

  process.env.STUDIO_PASSWORD = 'test-studio-password';
  process.env.PROFILE_MODE = 'shop';
  globalStore.email = 'null';
  globalStore.bookingUrl = 'none';
  globalStore.mode = 'person';

  try {
    const reqRes = createMockReqRes('GET', '/api/status?time=2026-11-09T10:15:00%2B01:00');
    await handleApiRequest(reqRes.req, reqRes.res);
    const result = await reqRes.done;
    assert.equal(result.statusCode, 200);
    const json = JSON.parse(result.text);

    assert.equal(json.profile.email, '');
    assert.equal(json.profile.bookingUrl, '');
    assert.equal(json.profile.mode, 'shop');
    assert.deepEqual(json.envCalendars, []);
  } finally {
    globalStore.email = prevEmail;
    globalStore.bookingUrl = prevBooking;
    globalStore.mode = prevStoreMode;
    if (prevMode === undefined) delete process.env.PROFILE_MODE;
    else process.env.PROFILE_MODE = prevMode;
    if (prevPassword === undefined) delete process.env.STUDIO_PASSWORD;
    else process.env.STUDIO_PASSWORD = prevPassword;
  }
});

test('/api/badge.svg and /api/badge.png emit ETag and honor If-None-Match with 304 Not Modified', async () => {
  const svgUrl = '/api/badge.svg?style=pill&theme=dark&time=2026-11-09T10:15:00%2B01:00';
  const firstSvg = createMockReqRes('GET', svgUrl);
  await handleApiRequest(firstSvg.req, firstSvg.res);
  const svgRes1 = await firstSvg.done;
  assert.equal(svgRes1.statusCode, 200);
  const svgEtag = svgRes1.headers['etag'];
  assert.ok(svgEtag && svgEtag.startsWith('W/"'));
  assert.ok(svgRes1.text.includes('<svg'));

  const secondSvg = createMockReqRes('GET', svgUrl, { 'if-none-match': svgEtag });
  await handleApiRequest(secondSvg.req, secondSvg.res);
  const svgRes2 = await secondSvg.done;
  assert.equal(svgRes2.statusCode, 304);
  assert.equal(svgRes2.headers['etag'], svgEtag);
  assert.equal(svgRes2.body.length, 0);

  const pngUrl = '/api/badge.png?style=pill&theme=light&time=2026-11-09T10:15:00%2B01:00';
  const firstPng = createMockReqRes('GET', pngUrl);
  await handleApiRequest(firstPng.req, firstPng.res);
  const pngRes1 = await firstPng.done;
  assert.equal(pngRes1.statusCode, 200);
  const pngEtag = pngRes1.headers['etag'];
  assert.ok(pngEtag && pngEtag.startsWith('W/"'));
  assert.ok(pngRes1.body.length > 100);

  const secondPng = createMockReqRes('GET', pngUrl, { 'if-none-match': pngEtag });
  await handleApiRequest(secondPng.req, secondPng.res);
  const pngRes2 = await secondPng.done;
  assert.equal(pngRes2.statusCode, 304);
  assert.equal(pngRes2.body.length, 0);
});

test('/api/fetch-ics rejects private/loopback SSRF URLs with 400 when authenticated', async () => {
  const prevPassword = process.env.STUDIO_PASSWORD;
  process.env.STUDIO_PASSWORD = 'test-studio-password';
  try {
    const token = createStudioSessionToken();
    const ssrfReq = createMockReqRes(
      'POST',
      '/api/fetch-ics',
      {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      JSON.stringify({ url: 'http://127.0.0.1:8080/secret.ics' })
    );
    await handleApiRequest(ssrfReq.req, ssrfReq.res);
    const ssrfRes = await ssrfReq.done;
    assert.equal(ssrfRes.statusCode, 400);
    const payload = JSON.parse(ssrfRes.text);
    assert.ok(typeof payload.error === 'string' && payload.error.length > 0);
  } finally {
    if (prevPassword === undefined) delete process.env.STUDIO_PASSWORD;
    else process.env.STUDIO_PASSWORD = prevPassword;
  }
});

test('/api/status and /api/badge.svg support ?mode=shop and emit API security headers', async () => {
  const statusReq = createMockReqRes('GET', '/api/status?mode=shop&time=2026-11-08T14:00:00%2B01:00');
  await handleApiRequest(statusReq.req, statusReq.res);
  const statusRes = await statusReq.done;
  assert.equal(statusRes.statusCode, 200);
  assert.equal(statusRes.headers['x-content-type-options'], 'nosniff');
  assert.equal(statusRes.headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.equal(statusRes.headers['x-robots-tag'], 'noindex, nofollow');
  const json = JSON.parse(statusRes.text);
  assert.equal(json.profile.mode, 'shop');
  assert.equal(json.availability.status, 'OFF_HOURS');
  assert.equal(json.availability.title, 'Fermé');

  const svgReq = createMockReqRes('GET', '/api/badge.svg?mode=shop&lang=en&time=2026-11-08T14:00:00%2B01:00');
  await handleApiRequest(svgReq.req, svgReq.res);
  const svgRes = await svgReq.done;
  assert.equal(svgRes.statusCode, 200);
  assert.equal(svgRes.headers['x-content-type-options'], 'nosniff');
  assert.equal(svgRes.headers['x-robots-tag'], 'noindex, nofollow');
  assert.ok(svgRes.text.includes('Closed'));
});

test('POST /api/studio-auth sets Secure cookie only over HTTPS requests', async () => {
  const prevPassword = process.env.STUDIO_PASSWORD;
  process.env.STUDIO_PASSWORD = 'test-studio-password';
  try {
    const httpLogin = createMockReqRes(
      'POST',
      '/api/studio-auth',
      { 'content-type': 'application/json' },
      JSON.stringify({ password: 'test-studio-password' })
    );
    await handleApiRequest(httpLogin.req, httpLogin.res);
    const httpRes = await httpLogin.done;
    assert.equal(httpRes.statusCode, 200);
    assert.ok(httpRes.headers['set-cookie']?.includes('HttpOnly'));
    assert.ok(!httpRes.headers['set-cookie']?.includes('; Secure'));

    const httpsLogin = createMockReqRes(
      'POST',
      '/api/studio-auth',
      { 'content-type': 'application/json', 'x-forwarded-proto': 'https' },
      JSON.stringify({ password: 'test-studio-password' })
    );
    await handleApiRequest(httpsLogin.req, httpsLogin.res);
    const httpsRes = await httpsLogin.done;
    assert.equal(httpsRes.statusCode, 200);
    assert.ok(httpsRes.headers['set-cookie']?.includes('; Secure'));
  } finally {
    if (prevPassword === undefined) delete process.env.STUDIO_PASSWORD;
    else process.env.STUDIO_PASSWORD = prevPassword;
  }
});

test('/api/status and /api/badge.svg dynamically honor PROFILE_* and SCHEDULE_JSON env vars', async () => {
  const prevEnv = {
    PROFILE_NAME: process.env.PROFILE_NAME,
    PROFILE_ROLE: process.env.PROFILE_ROLE,
    PROFILE_COMPANY: process.env.PROFILE_COMPANY,
    PROFILE_EMAIL: process.env.PROFILE_EMAIL,
    PROFILE_BOOKING_URL: process.env.PROFILE_BOOKING_URL,
    PROFILE_MODE: process.env.PROFILE_MODE,
    SCHEDULE_JSON: process.env.SCHEDULE_JSON,
  };

  process.env.PROFILE_NAME = 'Pharmacie du Centre';
  process.env.PROFILE_ROLE = 'Officine';
  process.env.PROFILE_COMPANY = 'Saint-Denis';
  process.env.PROFILE_EMAIL = '';
  process.env.PROFILE_BOOKING_URL = '';
  process.env.PROFILE_MODE = 'shop';
  // Enable Sunday 08:00-12:00 in Europe/Paris via SCHEDULE_JSON
  process.env.SCHEDULE_JSON = JSON.stringify({
    timezone: 'Europe/Paris',
    days: { 0: { enabled: true, start: '08:00', end: '12:00' } },
  });

  try {
    const statusReq = createMockReqRes('GET', '/api/status?time=2026-11-08T10:00:00%2B01:00');
    await handleApiRequest(statusReq.req, statusReq.res);
    const statusRes = await statusReq.done;
    assert.equal(statusRes.statusCode, 200);
    const json = JSON.parse(statusRes.text);

    assert.equal(json.profile.name, 'Pharmacie du Centre');
    assert.equal(json.profile.role, 'Officine');
    assert.equal(json.profile.company, 'Saint-Denis');
    assert.equal(json.profile.email, '');
    assert.equal(json.profile.bookingUrl, '');
    assert.equal(json.profile.mode, 'shop');
    assert.equal(json.timezone, 'Europe/Paris');
    assert.equal(json.availability.status, 'AVAILABLE');
    assert.equal(json.availability.title, 'Ouvert');
    assert.equal(json.schedule.days[0].enabled, true);

    const svgReq = createMockReqRes('GET', '/api/badge.svg?style=signature&time=2026-11-08T10:00:00%2B01:00');
    await handleApiRequest(svgReq.req, svgReq.res);
    const svgRes = await svgReq.done;
    assert.equal(svgRes.statusCode, 200);
    assert.ok(svgRes.text.includes('Pharmacie du Centre'));
    assert.ok(svgRes.text.includes('Ouvert'));

    const svgEnReq = createMockReqRes('GET', '/api/badge.svg?lang=en&time=2026-11-08T10:00:00%2B01:00');
    await handleApiRequest(svgEnReq.req, svgEnReq.res);
    const svgEnRes = await svgEnReq.done;
    assert.equal(svgEnRes.statusCode, 200);
    assert.ok(svgEnRes.text.includes('Open'));
  } finally {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('/api/status and /api/badge.svg honor single PERSONAL_JSON variable without individual PROFILE_* vars', async () => {
  const prevPersonalJson = process.env.PERSONAL_JSON;
  const prevEmail = process.env.PROFILE_EMAIL;
  delete process.env.PROFILE_EMAIL;

  process.env.PERSONAL_JSON = JSON.stringify({
    name: 'Dr. Dupont',
    role: 'Cardiologue',
    company: 'Cabinet Sud',
    email: '',
    bookingUrl: '',
    mode: 'shop',
  });

  try {
    const reqRes = createMockReqRes('GET', '/api/status?time=2026-11-08T10:00:00%2B01:00');
    await handleApiRequest(reqRes.req, reqRes.res);
    const result = await reqRes.done;
    assert.equal(result.statusCode, 200);
    const json = JSON.parse(result.text);

    assert.deepEqual(json.profile, {
      name: 'Dr. Dupont',
      role: 'Cardiologue',
      company: 'Cabinet Sud',
      email: '',
      bookingUrl: '',
      mode: 'shop',
    });
    assert.equal(json.availability.title, 'Fermé');
  } finally {
    if (prevPersonalJson === undefined) delete process.env.PERSONAL_JSON;
    else process.env.PERSONAL_JSON = prevPersonalJson;
    if (prevEmail === undefined) delete process.env.PROFILE_EMAIL;
    else process.env.PROFILE_EMAIL = prevEmail;
  }
});

test('/api/status and /api/badge.svg honor granular SCHEDULE_* env overrides (hours, day suffixes, closures)', async () => {
  const keys = [
    'SCHEDULE_TIMEZONE',
    'SCHEDULE_WORK_DAYS',
    'SCHEDULE_HOURS',
    'SCHEDULE_HOURS_FRI',
    'SCHEDULE_LUNCH_HOURS_FRI',
    'SCHEDULE_CLOSURES',
  ] as const;
  const prev: Record<string, string | undefined> = {};
  for (const k of keys) prev[k] = process.env[k];

  process.env.SCHEDULE_TIMEZONE = 'Europe/Paris';
  process.env.SCHEDULE_WORK_DAYS = 'tue-fri';
  process.env.SCHEDULE_HOURS = '08:00-16:00';
  process.env.SCHEDULE_HOURS_FRI = '09:00-12:00';
  process.env.SCHEDULE_LUNCH_HOURS_FRI = 'off';
  process.env.SCHEDULE_CLOSURES = '2026-12-25|Noël|holiday';

  try {
    // Friday 2026-11-13 at 10:30 CET -> AVAILABLE until 12h00 (no lunch break on Friday)
    const friMorning = createMockReqRes('GET', '/api/status?time=2026-11-13T10:30:00%2B01:00');
    await handleApiRequest(friMorning.req, friMorning.res);
    const friRes = await friMorning.done;
    assert.equal(friRes.statusCode, 200);
    const friJson = JSON.parse(friRes.text);
    assert.equal(friJson.availability.status, 'AVAILABLE');
    assert.equal(friJson.schedule.days[1].enabled, false);
    assert.deepEqual(friJson.schedule.days[5], { enabled: true, start: '09:00', end: '12:00' });

    // Friday 2026-11-13 at 13:00 CET -> OFF_HOURS (Friday closed at 12:00; next work is Tuesday 08:00)
    const friAfternoon = createMockReqRes('GET', '/api/status?time=2026-11-13T13:00:00%2B01:00');
    await handleApiRequest(friAfternoon.req, friAfternoon.res);
    const friAfterJson = JSON.parse((await friAfternoon.done).text);
    assert.equal(friAfterJson.availability.status, 'OFF_HOURS');
    assert.match(friAfterJson.availability.subtitle, /mardi à 08h00/i);

    // Christmas 2026-12-25 at 10:00 CET -> HOLIDAY badge rendered
    const xmasSvg = createMockReqRes('GET', '/api/badge.svg?time=2026-12-25T10:00:00%2B01:00');
    await handleApiRequest(xmasSvg.req, xmasSvg.res);
    const xmasRes = await xmasSvg.done;
    assert.equal(xmasRes.statusCode, 200);
    assert.ok(xmasRes.text.includes('Noël'));
  } finally {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
});
