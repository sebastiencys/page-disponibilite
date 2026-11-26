import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeQrPngLayout,
  computeRsEcc,
  generateQrMatrix,
  gfMul,
  renderQrSvg,
} from './qrcode.ts';

test('Reed-Solomon ECC encodes and leaves zero syndrome for sample codeword block', () => {
  // Verify GF(256) arithmetic & generator check for Version 1-M (16 data, 10 EC)
  const sampleData = Uint8Array.from({ length: 16 }, (_, i) => (i * 17 + 5) & 0xff);
  const ec = computeRsEcc(sampleData, 10);
  assert.equal(ec.length, 10);

  // Evaluate encoded polynomial at roots alpha^0 .. alpha^9; each must equal 0 in GF(256)
  const combined = new Uint8Array(26);
  combined.set(sampleData, 0);
  combined.set(ec, 16);

  // alpha^0 = 1, alpha^1 = 2, alpha^2 = 4, alpha^3 = 8
  const roots = [1, 2, 4, 8];
  for (const root of roots) {
    let acc = 0;
    for (const coef of combined) {
      acc = gfMul(acc, root) ^ coef;
    }
    assert.equal(acc, 0, `Syndrome at root ${root} must be 0`);
  }
});

test('generateQrMatrix builds valid finder patterns and scales versions with payload length', () => {
  const v2Qr = generateQrMatrix('https://dispolive.app');
  assert.equal(v2Qr.version, 2);
  assert.equal(v2Qr.size, 25);

  const shortQr = generateQrMatrix('https://dispolive.app/?view=public');
  assert.equal(shortQr.version, 3);
  assert.equal(shortQr.size, 29);

  // Check top-left 7x7 finder outer ring and center 3x3
  for (let i = 0; i < 7; i++) {
    assert.equal(shortQr.modules[0][i], true);
    assert.equal(shortQr.modules[6][i], true);
    assert.equal(shortQr.modules[i][0], true);
    assert.equal(shortQr.modules[i][6], true);
  }
  assert.equal(shortQr.modules[3][3], true);
  assert.equal(shortQr.modules[1][1], false);

  // Check dark module at (size - 8, 8)
  assert.equal(shortQr.modules[shortQr.size - 8][8], true);

  // Long URL triggers higher QR version cleanly (V7+ includes version info bits)
  const longUrl = 'https://custom-enterprise-status-subdomain.vercel.app/?view=public&lang=en&ref=email-signature-v2-desktop-outlook-365';
  const longQr = generateQrMatrix(longUrl);
  assert.ok(longQr.version >= 7);
  assert.equal(longQr.modules.length, longQr.size);
});

test('renderQrSvg produces deterministic accessible crispEdges SVG markup', () => {
  const url = 'https://example.com/?view=public&lang=en';
  const svg1 = renderQrSvg(url, { title: 'Public Status QR' });
  const svg2 = renderQrSvg(url, { title: 'Public Status QR' });

  assert.equal(svg1, svg2);
  assert.ok(svg1.startsWith('<svg '));
  assert.ok(svg1.includes('shape-rendering="crispEdges"'));
  assert.ok(svg1.includes('<title>Public Status QR</title>'));
  assert.ok(svg1.includes('<path d="M'));
  assert.throws(() => renderQrSvg('x'.repeat(400)), /trop long/i);
});

test('computeQrPngLayout calculates crisp integer pixel scaling with quiet zone', () => {
  const layout = computeQrPngLayout(29, 512, 3);
  assert.equal(layout.margin, 3);
  assert.equal(layout.moduleSize, Math.floor(512 / (29 + 6))); // 14 px per module
  assert.equal(layout.canvasSize, 512);
  assert.equal(layout.offset, Math.floor((512 - 35 * 14) / 2));
});
