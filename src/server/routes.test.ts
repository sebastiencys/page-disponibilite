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
