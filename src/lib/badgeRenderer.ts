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

export type BadgeStyle = 'pill' | 'dot' | 'card' | 'signature';
export type BadgeTheme = 'light' | 'dark' | 'transparent';

export interface BadgeOptions {
  style?: BadgeStyle;
  theme?: BadgeTheme;
  name?: string;
  role?: string;
  company?: string;
  lang?: 'fr' | 'en';
  showSubtitle?: boolean;
}

/**
 * Escapes XML/SVG special characters
 */
function escapeXml(unsafe: string): string {
  return (unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates dynamic SVG badge with live status and modern multiline typography
 */
export function renderBadgeSvg(
  avail: AvailabilityResult,
  options: BadgeOptions = {}
): string {
  const {
    style = 'pill',
    theme = 'light',
    name = DEFAULT_PROFILE.name,
    role = DEFAULT_PROFILE.role,
    company = DEFAULT_PROFILE.company,
  } = options;

  const isDark = theme === 'dark';
  const bgColor = isDark ? '#0f172a' : '#ffffff';
  const borderColor = isDark ? '#334155' : '#e2e8f0';
  const textPrimary = isDark ? '#f8fafc' : '#0f172a';
  const textSecondary = isDark ? '#94a3b8' : '#64748b';
  const dotColor = avail.dotColor;
  const badgeColor = avail.badgeColor;

  const safeTitle = escapeXml(avail.title);
  const safeSubtitle = escapeXml(avail.subtitle);
  const safeName = escapeXml(name);
  const safeRole = escapeXml(role);
  const safeCompany = escapeXml(company);

  // Modern font family stack with Plus Jakarta Sans & native Apple/Windows system fonts
  const fontDef = `
    <defs>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&amp;display=swap');
        text {
          font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
          text-rendering: geometricPrecision;
        }
      </style>
      <filter id="dot-glow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
      <linearGradient id="cardBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${isDark ? '#1e293b' : '#ffffff'}" />
        <stop offset="100%" stop-color="${isDark ? '#0f172a' : '#f8fafc'}" />
      </linearGradient>
    </defs>`;

  // 1. STYLE: DOT (36x36 px)
  if (style === 'dot') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36" fill="none">
  <defs>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="2.5" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <circle cx="18" cy="18" r="16.5" fill="${bgColor}" stroke="${borderColor}" stroke-width="1.5"/>
  <circle cx="18" cy="18" r="10" fill="${badgeColor}" opacity="0.25">
    <animate attributeName="r" values="8;13;8" dur="2.4s" repeatCount="indefinite" />
    <animate attributeName="opacity" values="0.35;0.08;0.35" dur="2.4s" repeatCount="indefinite" />
  </circle>
  <circle cx="18" cy="18" r="7" fill="${dotColor}" filter="url(#glow)"/>
</svg>`;
  }

  // 2. STYLE: PILL MODERNE (400x54 px - Multiligne aéré avec largeur optimisée PC/Mobile)
  if (style === 'pill') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="54" viewBox="0 0 400 54" fill="none">
  ${fontDef}
  <!-- Pill Container -->
  <rect x="1" y="1" width="398" height="52" rx="26" fill="url(#cardBgGrad)" stroke="${borderColor}" stroke-width="1.5"/>

  <!-- Left Pulsing Aura & Status Dot -->
  <circle cx="26" cy="27" r="12" fill="${badgeColor}" opacity="0.22">
    <animate attributeName="r" values="9;14;9" dur="2.2s" repeatCount="indefinite" />
    <animate attributeName="opacity" values="0.3;0.08;0.3" dur="2.2s" repeatCount="indefinite" />
  </circle>
  <circle cx="26" cy="27" r="5.5" fill="${dotColor}" filter="url(#dot-glow)"/>

  <!-- Multiline Text: Title on line 1, Subtitle on line 2 -->
  <text x="48" y="23" font-size="13" font-weight="700" fill="${badgeColor}" letter-spacing="-0.01em">${safeTitle}</text>
  <text x="48" y="39" font-size="11.5" font-weight="500" fill="${textSecondary}" letter-spacing="-0.01em">${safeSubtitle}</text>
</svg>`;
  }

  // 3. STYLE: CARTE COMPACTE (380x100 px - Widget encadré avec en-tête et boîte multiligne)
  if (style === 'card') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="380" height="100" viewBox="0 0 380 100" fill="none">
  ${fontDef}
  <!-- Outer Card -->
  <rect x="1" y="1" width="378" height="98" rx="14" fill="${bgColor}" stroke="${borderColor}" stroke-width="1.5"/>

  <!-- Header row: Dot + Name + Right Tag -->
  <circle cx="22" cy="20" r="4.5" fill="${dotColor}"/>
  <text x="34" y="24" font-size="14.5" font-weight="700" fill="${textPrimary}" letter-spacing="-0.01em">${safeName}</text>
  <text x="362" y="23" text-anchor="end" font-size="11" font-weight="600" fill="${textSecondary}">Disponibilité en direct</text>

  <!-- Inner Status Container (Multiligne) -->
  <rect x="14" y="36" width="352" height="50" rx="10" fill="${badgeColor}" fill-opacity="0.12" stroke="${badgeColor}" stroke-opacity="0.28" stroke-width="1.2"/>

  <!-- Status Dot inside container -->
  <circle cx="32" cy="61" r="10" fill="${badgeColor}" opacity="0.2">
    <animate attributeName="r" values="7;11;7" dur="2s" repeatCount="indefinite" />
  </circle>
  <circle cx="32" cy="61" r="5" fill="${dotColor}"/>

  <!-- Status Title (Line 1) & Schedule Subtitle (Line 2) -->
  <text x="48" y="55" font-size="12.5" font-weight="700" fill="${badgeColor}" letter-spacing="-0.01em">${safeTitle}</text>
  <text x="48" y="73" font-size="11.5" font-weight="500" fill="${textSecondary}" letter-spacing="-0.01em">${safeSubtitle}</text>
</svg>`;
  }

  // 4. STYLE: SIGNATURE COMPLÈTE (480x114 px - Bannière Tout-en-un spacieuse)
  const initials = (name || 'AM')
    .split(' ')
    .map(part => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'DL';

  const roleText = safeRole ? (safeCompany ? `${safeRole} • ${safeCompany}` : safeRole) : 'Disponibilité en direct';
  const avatarBg = isDark ? '#1e293b' : '#f1f5f9';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="480" height="114" viewBox="0 0 480 114" fill="none">
  ${fontDef}
  <!-- Outer Card -->
  <rect x="1" y="1" width="478" height="112" rx="16" fill="${bgColor}" stroke="${borderColor}" stroke-width="1.5"/>

  <!-- Avatar circle on Left -->
  <circle cx="46" cy="57" r="30" fill="${avatarBg}" stroke="${borderColor}" stroke-width="1.2"/>
  <text x="46" y="64" text-anchor="middle" font-size="19" font-weight="800" fill="${badgeColor}" letter-spacing="-0.02em">${initials}</text>

  <!-- Contact Info (Right of Avatar) -->
  <text x="90" y="31" font-size="16" font-weight="800" fill="${textPrimary}" letter-spacing="-0.01em">${safeName}</text>
  <text x="90" y="48" font-size="12.5" font-weight="500" fill="${textSecondary}" letter-spacing="-0.01em">${roleText}</text>

  <!-- Live Status Box (Multiligne: Title + Subtitle) -->
  <rect x="90" y="58" width="374" height="44" rx="10" fill="${badgeColor}" fill-opacity="0.12" stroke="${badgeColor}" stroke-opacity="0.28" stroke-width="1.2"/>

  <!-- Pulsing dot inside status box -->
  <circle cx="108" cy="80" r="9" fill="${badgeColor}" opacity="0.25">
    <animate attributeName="r" values="7;11;7" dur="2s" repeatCount="indefinite" />
  </circle>
  <circle cx="108" cy="80" r="4.5" fill="${dotColor}"/>

  <!-- Status Title on Line 1, Full Subtitle on Line 2 -->
  <text x="124" y="73" font-size="12" font-weight="700" fill="${badgeColor}" letter-spacing="-0.01em">${safeTitle}</text>
  <text x="124" y="90" font-size="11" font-weight="500" fill="${textSecondary}" letter-spacing="-0.01em">${safeSubtitle}</text>
</svg>`;
}

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