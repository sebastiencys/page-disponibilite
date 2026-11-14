/**
 * Dynamic Badge Renderer for Email Signatures.
 * Generates vector SVG and high-resolution anti-aliased PNG images with modern typography.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { type AvailabilityResult, DEFAULT_PROFILE } from './availability.ts';
import { PLUS_JAKARTA_SANS_BOLD_B64, PLUS_JAKARTA_SANS_REGULAR_B64 } from './fonts.ts';

// Fonts are embedded at build-time as base64 strings and written to os.tmpdir() at runtime.
// @resvg/resvg-js requires actual file paths via `fontFiles` (it does NOT support in-memory buffers).
let cachedFontFiles: string[] | null = null;

export function getFontFiles(): string[] {
  if (cachedFontFiles !== null && cachedFontFiles.length > 0) {
    if (fs.existsSync(cachedFontFiles[0]) && fs.existsSync(cachedFontFiles[1])) {
      return cachedFontFiles;
    }
  }

  const tmpDir = os.tmpdir();
  const boldPath = path.join(tmpDir, 'PlusJakartaSans-Bold.ttf');
  const regPath = path.join(tmpDir, 'PlusJakartaSans-Regular.ttf');

  try {
    if (!fs.existsSync(boldPath) || fs.statSync(boldPath).size === 0) {
      fs.writeFileSync(boldPath, Buffer.from(PLUS_JAKARTA_SANS_BOLD_B64, 'base64'));
    }
    if (!fs.existsSync(regPath) || fs.statSync(regPath).size === 0) {
      fs.writeFileSync(regPath, Buffer.from(PLUS_JAKARTA_SANS_REGULAR_B64, 'base64'));
    }
    cachedFontFiles = [boldPath, regPath];
  } catch (err) {
    console.error('Failed to write fonts to tmp dir:', err);
    // Fallback: check project root fonts directory if exists
    const fallbackBold = path.join(process.cwd(), 'fonts', 'PlusJakartaSans-Bold.ttf');
    const fallbackReg = path.join(process.cwd(), 'fonts', 'PlusJakartaSans-Regular.ttf');
    if (fs.existsSync(fallbackBold) && fs.existsSync(fallbackReg)) {
      cachedFontFiles = [fallbackBold, fallbackReg];
    } else {
      cachedFontFiles = [];
    }
  }

  return cachedFontFiles;
}

// Deprecated alias kept for backwards compatibility
export function getFontBuffers(): Buffer[] {
  return [
    Buffer.from(PLUS_JAKARTA_SANS_BOLD_B64, 'base64'),
    Buffer.from(PLUS_JAKARTA_SANS_REGULAR_B64, 'base64'),
  ];
}

export async function ensureFontsLoaded(): Promise<string[]> {
  return getFontFiles();
}

import {
  renderBadgeSvg,
  type BadgeStyle,
  type BadgeTheme,
  type BadgeOptions,
} from './badgeSvg.ts';

// Re-export pure SVG generation and types from badgeSvg
export {
  renderBadgeSvg,
  type BadgeStyle,
  type BadgeTheme,
  type BadgeOptions,
};

/**
 * Generates dynamic PNG image for email signatures using high-resolution vector rasterization.
 * Produces crisp anti-aliased typography and sharp graphics without pixelation.
 */
export function renderBadgePng(
  avail: AvailabilityResult,
  options: BadgeOptions = {}
): Buffer {
  const svg = renderBadgeSvg(avail, options);
  try {
    const fontFiles = getFontFiles();
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'zoom', value: 1.5 }, // 1.5x crisp rendering for Retina and high-DPI screens
      textRendering: 2, // geometricPrecision
      shapeRendering: 2, // geometricPrecision
      imageRendering: 0, // optimizeQuality
      font: {
        loadSystemFonts: false,
        fontFiles: fontFiles.length > 0 ? fontFiles : undefined,
        defaultFontFamily: 'Plus Jakarta Sans',
      },
    });
    const pngData = resvg.render();
    return Buffer.from(pngData.asPng());
  } catch (err) {
    console.error('Resvg PNG rendering fallback triggered:', err);
    // Return empty fallback PNG if rendering ever throws
    return Buffer.alloc(0);
  }
}