import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAvailability, DEFAULT_SCHEDULE } from './availability.ts';
import { renderBadgeSvg, renderBadgePng } from './badgeRenderer.ts';

test('renderBadgeSvg generates valid SVG markup with correct colors', () => {
  const now = new Date('2026-11-09T10:15:00+01:00'); // Available in Europe/Paris
  const avail = calculateAvailability(now, DEFAULT_SCHEDULE, []);

  const svg = renderBadgeSvg(avail, { style: 'pill', theme: 'light' });
  assert.ok(svg.includes('<svg'));
  assert.ok(svg.includes('</svg>'));
  assert.ok(svg.includes('Disponible'));
  assert.ok(svg.includes('#10B981') || svg.includes('#10b981'));
});

test('renderBadgeSvg supports dot, card, and signature styles', () => {
  const now = new Date('2026-11-09T14:30:00+01:00');
  const avail = calculateAvailability(now, DEFAULT_SCHEDULE, [
    {
      id: '1',
      title: 'Réunion Client',
      start: '2026-11-09T14:00:00+01:00',
      end: '2026-11-09T15:00:00+01:00',
    },
  ]);

  const dotSvg = renderBadgeSvg(avail, { style: 'dot' });
  assert.ok(dotSvg.includes('width="36"') || dotSvg.includes('width="32"'));
  assert.ok(dotSvg.includes('#DC2626') || dotSvg.includes('#dc2626'));

  const cardSvg = renderBadgeSvg(avail, { style: 'card', name: 'Sophie Martin' });
  assert.ok(cardSvg.includes('Sophie Martin'));

  const sigSvg = renderBadgeSvg(avail, { style: 'signature', name: 'Sophie Martin' });
  assert.ok(sigSvg.includes('SM'));
});

test('renderBadgePng generates valid PNG binary buffer with correct magic bytes', () => {
  const now = new Date('2026-11-09T10:15:00');
  const avail = calculateAvailability(now, DEFAULT_SCHEDULE, []);

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
  const avail = calculateAvailability(now, DEFAULT_SCHEDULE, []);

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
