/**
 * Offline ISO/IEC 18004 QR Code generator (Byte mode, ECC Level M, Versions 1–12).
 * Pure TypeScript with zero external network calls or dependencies.
 */

export type QrEccLevel = 'M';

interface QrVersionSpec {
  version: number;
  size: number;
  totalCodewords: number;
  ecPerBlock: number;
  g1Blocks: number;
  g1Data: number;
  g2Blocks: number;
  g2Data: number;
  alignmentCenters: number[];
}

const VERSION_SPECS: QrVersionSpec[] = [
  { version: 1, size: 21, totalCodewords: 26, ecPerBlock: 10, g1Blocks: 1, g1Data: 16, g2Blocks: 0, g2Data: 0, alignmentCenters: [] },
  { version: 2, size: 25, totalCodewords: 44, ecPerBlock: 16, g1Blocks: 1, g1Data: 28, g2Blocks: 0, g2Data: 0, alignmentCenters: [6, 18] },
  { version: 3, size: 29, totalCodewords: 70, ecPerBlock: 26, g1Blocks: 1, g1Data: 44, g2Blocks: 0, g2Data: 0, alignmentCenters: [6, 22] },
  { version: 4, size: 33, totalCodewords: 100, ecPerBlock: 18, g1Blocks: 2, g1Data: 32, g2Blocks: 0, g2Data: 0, alignmentCenters: [6, 26] },
  { version: 5, size: 37, totalCodewords: 134, ecPerBlock: 24, g1Blocks: 2, g1Data: 43, g2Blocks: 0, g2Data: 0, alignmentCenters: [6, 30] },
  { version: 6, size: 41, totalCodewords: 172, ecPerBlock: 16, g1Blocks: 4, g1Data: 27, g2Blocks: 0, g2Data: 0, alignmentCenters: [6, 34] },
  { version: 7, size: 45, totalCodewords: 196, ecPerBlock: 18, g1Blocks: 4, g1Data: 31, g2Blocks: 0, g2Data: 0, alignmentCenters: [6, 22, 38] },
  { version: 8, size: 49, totalCodewords: 242, ecPerBlock: 22, g1Blocks: 2, g1Data: 38, g2Blocks: 2, g2Data: 39, alignmentCenters: [6, 24, 42] },
  { version: 9, size: 53, totalCodewords: 292, ecPerBlock: 22, g1Blocks: 3, g1Data: 36, g2Blocks: 2, g2Data: 37, alignmentCenters: [6, 26, 46] },
  { version: 10, size: 57, totalCodewords: 346, ecPerBlock: 26, g1Blocks: 4, g1Data: 43, g2Blocks: 1, g2Data: 44, alignmentCenters: [6, 28, 50] },
  { version: 11, size: 61, totalCodewords: 404, ecPerBlock: 30, g1Blocks: 1, g1Data: 50, g2Blocks: 4, g2Data: 51, alignmentCenters: [6, 30, 54] },
  { version: 12, size: 65, totalCodewords: 466, ecPerBlock: 22, g1Blocks: 6, g1Data: 36, g2Blocks: 2, g2Data: 37, alignmentCenters: [6, 32, 58] },
];

// GF(256) log / antilog tables with primitive polynomial 0x11D
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_EXP[i + 255] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
})();

export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

export function buildRsGenerator(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

export function computeRsEcc(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = buildRsGenerator(ecCount);
  const msg = new Uint8Array(data.length + ecCount);
  msg.set(data, 0);
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 1; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return msg.slice(data.length);
}

function getDataCapacityBytes(spec: QrVersionSpec): number {
  return spec.g1Blocks * spec.g1Data + spec.g2Blocks * spec.g2Data;
}

function getCharCountBits(version: number): number {
  return version >= 10 ? 16 : 8;
}

function selectVersion(byteLength: number): QrVersionSpec {
  for (const spec of VERSION_SPECS) {
    const capacityBits = getDataCapacityBytes(spec) * 8;
    const neededBits = 4 + getCharCountBits(spec.version) + byteLength * 8;
    if (neededBits <= capacityBits) {
      return spec;
    }
  }
  throw new Error('Contenu trop long pour le générateur de QR Code (max ~287 octets).');
}

function encodeDataCodewords(bytes: Uint8Array, spec: QrVersionSpec): Uint8Array {
  const totalDataBytes = getDataCapacityBytes(spec);
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1);
    }
  };

  // Mode: Byte (0100)
  pushBits(0b0100, 4);
  pushBits(bytes.length, getCharCountBits(spec.version));
  for (const b of bytes) {
    pushBits(b, 8);
  }

  const maxBits = totalDataBytes * 8;
  const terminatorLen = Math.min(4, maxBits - bits.length);
  pushBits(0, terminatorLen);

  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords = new Uint8Array(totalDataBytes);
  for (let i = 0; i < bits.length / 8; i++) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | bits[i * 8 + b];
    }
    codewords[i] = byteVal;
  }

  let idx = bits.length / 8;
  let padToggle = 0;
  while (idx < totalDataBytes) {
    codewords[idx++] = padToggle % 2 === 0 ? 0xec : 0x11;
    padToggle++;
  }

  return codewords;
}

function buildFinalBitStream(bytes: Uint8Array, spec: QrVersionSpec): number[] {
  const dataCodewords = encodeDataCodewords(bytes, spec);
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];

  let offset = 0;
  for (let i = 0; i < spec.g1Blocks; i++) {
    const blk = dataCodewords.slice(offset, offset + spec.g1Data);
    offset += spec.g1Data;
    dataBlocks.push(blk);
    ecBlocks.push(computeRsEcc(blk, spec.ecPerBlock));
  }
  for (let i = 0; i < spec.g2Blocks; i++) {
    const blk = dataCodewords.slice(offset, offset + spec.g2Data);
    offset += spec.g2Data;
    dataBlocks.push(blk);
    ecBlocks.push(computeRsEcc(blk, spec.ecPerBlock));
  }

  const interleaved: number[] = [];
  const maxDataLen = Math.max(spec.g1Data, spec.g2Data);
  for (let col = 0; col < maxDataLen; col++) {
    for (const blk of dataBlocks) {
      if (col < blk.length) interleaved.push(blk[col]);
    }
  }
  for (let col = 0; col < spec.ecPerBlock; col++) {
    for (const ec of ecBlocks) {
      interleaved.push(ec[col]);
    }
  }

  const bitStream: number[] = [];
  for (const byteVal of interleaved) {
    for (let b = 7; b >= 0; b--) {
      bitStream.push((byteVal >>> b) & 1);
    }
  }
  // Remainder bits (0 for V1, 7 for V2-V6, 0 for V7-V12? Wait: V2..V6 have 7 remainder bits, V7..V13 have 0 remainder bits)
  const remainderBits = spec.version >= 2 && spec.version <= 6 ? 7 : 0;
  for (let r = 0; r < remainderBits; r++) {
    bitStream.push(0);
  }
  return bitStream;
}

function computeFormatBits(maskIndex: number): number {
  // ECC Level M = 00 -> 5-bit data = (0b00 << 3) | maskIndex
  const data = maskIndex & 0x7;
  let rem = data << 10;
  const poly = 0x537;
  for (let bit = 14; bit >= 10; bit--) {
    if ((rem >>> bit) & 1) {
      rem ^= poly << (bit - 10);
    }
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function computeVersionBits(version: number): number {
  let rem = version << 12;
  const poly = 0x1f25;
  for (let bit = 17; bit >= 12; bit--) {
    if ((rem >>> bit) & 1) {
      rem ^= poly << (bit - 12);
    }
  }
  return (version << 12) | rem;
}

function isMaskBitFlipped(maskIndex: number, r: number, c: number): boolean {
  switch (maskIndex) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return false;
  }
}

function evaluatePenalty(matrix: Uint8Array[], size: number): number {
  let penalty = 0;

  // Rule 1: runs of 5+ same color modules in rows & cols
  for (let r = 0; r < size; r++) {
    let runColor = matrix[r][0];
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      if (matrix[r][c] === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = matrix[r][c];
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }
  for (let c = 0; c < size; c++) {
    let runColor = matrix[0][c];
    let runLen = 1;
    for (let r = 1; r < size; r++) {
      if (matrix[r][c] === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = matrix[r][c];
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }

  // Rule 2: 2x2 blocks of same color
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = matrix[r][c];
      if (v === matrix[r][c + 1] && v === matrix[r + 1][c] && v === matrix[r + 1][c + 1]) {
        penalty += 3;
      }
    }
  }

  // Rule 3: 1:1:3:1:1:4 finder-like patterns in rows & cols
  const patA = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const patB = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size - 11; c++) {
      let matchA = true;
      let matchB = true;
      for (let k = 0; k < 11; k++) {
        if (matrix[r][c + k] !== patA[k]) matchA = false;
        if (matrix[r][c + k] !== patB[k]) matchB = false;
      }
      if (matchA || matchB) penalty += 40;
    }
  }
  for (let c = 0; c < size; c++) {
    for (let r = 0; r <= size - 11; r++) {
      let matchA = true;
      let matchB = true;
      for (let k = 0; k < 11; k++) {
        if (matrix[r + k][c] !== patA[k]) matchA = false;
        if (matrix[r + k][c] !== patB[k]) matchB = false;
      }
      if (matchA || matchB) penalty += 40;
    }
  }

  // Rule 4: dark/light proportion balance
  let darkCount = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) darkCount++;
    }
  }
  const percent = (darkCount * 100) / (size * size);
  const k = Math.floor(Math.abs(percent - 50) / 5);
  penalty += k * 10;

  return penalty;
}

export interface QrMatrixResult {
  version: number;
  size: number;
  modules: boolean[][];
}

export function generateQrMatrix(text: string): QrMatrixResult {
  const bytes = new TextEncoder().encode(text);
  const spec = selectVersion(bytes.length);
  const size = spec.size;
  const bitStream = buildFinalBitStream(bytes, spec);

  // Build function-module mask & base template
  const isFunction = Array.from({ length: size }, () => new Uint8Array(size));
  const baseModules = Array.from({ length: size }, () => new Uint8Array(size));

  const setFunc = (r: number, c: number, dark: boolean) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    isFunction[r][c] = 1;
    baseModules[r][c] = dark ? 1 : 0;
  };

  const placeFinder = (top: number, left: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = top + dr;
        const c = left + dc;
        if (r < 0 || c < 0 || r >= size || c >= size) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 && (dr === 0 || dr === 6 || dc === 0 || dc === 6);
        const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFunc(r, c, inOuter || inInner);
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Alignment patterns
  const centers = spec.alignmentCenters;
  for (const cr of centers) {
    for (const cc of centers) {
      if (isFunction[cr][cc]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
          setFunc(cr + dr, cc + dc, dark);
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    if (!isFunction[6][i]) setFunc(6, i, dark);
    if (!isFunction[i][6]) setFunc(i, 6, dark);
  }

  // Dark module
  setFunc(size - 8, 8, true);

  // Reserve format info cells
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      isFunction[8][i] = 1;
      isFunction[i][8] = 1;
    }
  }
  for (let i = 0; i < 8; i++) {
    isFunction[8][size - 1 - i] = 1;
  }
  for (let i = 0; i < 7; i++) {
    isFunction[size - 1 - i][8] = 1;
  }

  // Version info for >= V7
  if (spec.version >= 7) {
    const vBits = computeVersionBits(spec.version);
    for (let i = 0; i < 18; i++) {
      const bit = Boolean((vBits >>> i) & 1);
      const a = Math.floor(i / 3);
      const b = size - 11 + (i % 3);
      setFunc(a, b, bit);
      setFunc(b, a, bit);
    }
  }

  // Place data & ECC bits along zigzag columns right-to-left
  const dataGrid = Array.from({ length: size }, (_, r) => Uint8Array.from(baseModules[r]));
  let bitIdx = 0;
  let goingUp = true;
  for (let rightCol = size - 1; rightCol >= 1; rightCol -= 2) {
    if (rightCol === 6) rightCol--; // Skip vertical timing column
    for (let step = 0; step < size; step++) {
      const r = goingUp ? size - 1 - step : step;
      for (let d = 0; d < 2; d++) {
        const c = rightCol - d;
        if (!isFunction[r][c]) {
          dataGrid[r][c] = bitIdx < bitStream.length ? bitStream[bitIdx++] : 0;
        }
      }
    }
    goingUp = !goingUp;
  }

  // Evaluate masks 0..7
  let bestMask = 0;
  let bestPenalty = Infinity;
  let bestMatrix: Uint8Array[] = dataGrid;

  for (let maskIdx = 0; maskIdx < 8; maskIdx++) {
    const candidate = Array.from({ length: size }, (_, r) => {
      const row = new Uint8Array(size);
      for (let c = 0; c < size; c++) {
        const val = dataGrid[r][c];
        row[c] = !isFunction[r][c] && isMaskBitFlipped(maskIdx, r, c) ? val ^ 1 : val;
      }
      return row;
    });

    // Write format info bits
    const fmt = computeFormatBits(maskIdx);
    for (let i = 0; i <= 5; i++) {
      const bit = (fmt >>> i) & 1;
      candidate[8][i] = bit;
      candidate[size - 1 - i][8] = bit;
    }
    candidate[8][7] = (fmt >>> 6) & 1;
    candidate[size - 7][8] = (fmt >>> 6) & 1;
    candidate[8][8] = (fmt >>> 7) & 1;
    candidate[8][size - 8] = (fmt >>> 7) & 1;
    candidate[7][8] = (fmt >>> 8) & 1;
    candidate[8][size - 7] = (fmt >>> 8) & 1;
    for (let i = 9; i < 15; i++) {
      const bit = (fmt >>> i) & 1;
      candidate[14 - i][8] = bit;
      candidate[8][size - 15 + i] = bit;
    }

    const penalty = evaluatePenalty(candidate, size);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = maskIdx;
      bestMatrix = candidate;
    }
  }

  void bestMask;

  return {
    version: spec.version,
    size,
    modules: bestMatrix.map(row => Array.from(row, v => v === 1)),
  };
}

export interface QrSvgOptions {
  margin?: number;
  darkColor?: string;
  lightColor?: string;
  title?: string;
}

export function renderQrSvg(text: string, options: QrSvgOptions = {}): string {
  const { modules, size } = generateQrMatrix(text);
  const margin = options.margin ?? 3;
  const darkColor = options.darkColor ?? '#0f172a';
  const lightColor = options.lightColor ?? '#ffffff';
  const totalSize = size + margin * 2;

  const pathParts: string[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) {
        pathParts.push(`M${c + margin},${r + margin}h1v1h-1z`);
      }
    }
  }

  const escapedTitle = (options.title || 'QR Code')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" shape-rendering="crispEdges" role="img" aria-label="${escapedTitle}"><title>${escapedTitle}</title><rect width="${totalSize}" height="${totalSize}" fill="${lightColor}" rx="2"/><path d="${pathParts.join('')}" fill="${darkColor}"/></svg>`;
}
