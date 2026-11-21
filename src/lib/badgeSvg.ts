/**
 * Pure SVG generator for dynamic availability badges.
 * Zero Node.js / C++ dependencies — safe for both browser and serverless runtimes.
 */

import {
  type AvailabilityResult,
  type CalendarSummaryItem,
  DEFAULT_PROFILE,
  formatTimeShort,
  getZonedDateParts,
} from './availability.ts';

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

export interface BadgeTextOptions {
  name?: string;
  role?: string;
  company?: string;
  timezone?: string;
  now?: Date;
  calendars?: CalendarSummaryItem[];
}

export interface BadgeTextPayload {
  status: AvailabilityResult['status'];
  state: AvailabilityResult['state'];
  isWorkTime: boolean;
  title: string;
  subtitle: string;
  appointmentsLabel: string | null;
  activeCalendarLabel: string | null;
  lines: string[];
  text: string;
  todayAppointmentsCount: number;
  todayAllDayAppointmentsCount: number;
  calendars?: CalendarSummaryItem[];
  nextFreeTime: string | null;
  nextChangeAt: string | null;
  colors: {
    badge: string;
    dot: string;
  };
  profile: {
    name: string;
    role: string;
    company: string;
  };
  timezone: string;
  localTime: string;
  localDate: string;
  updatedAt: string;
}

/**
 * Escapes XML/SVG/HTML special characters safely.
 */
export function escapeHtml(unsafe: string): string {
  return (unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

const VALID_BADGE_STYLES: ReadonlySet<string> = new Set(['pill', 'dot', 'card', 'signature']);
const VALID_BADGE_THEMES: ReadonlySet<string> = new Set(['light', 'dark', 'transparent']);

/**
 * Normalizes any style query parameter to a valid BadgeStyle (defaults safely to 'pill').
 */
export function normalizeBadgeStyle(value: unknown, fallback: BadgeStyle = 'pill'): BadgeStyle {
  if (typeof value === 'string') {
    const clean = value.trim().toLowerCase();
    if (VALID_BADGE_STYLES.has(clean)) {
      return clean as BadgeStyle;
    }
  }
  return fallback;
}

/**
 * Normalizes any theme query parameter to a valid BadgeTheme (defaults safely to 'light').
 */
export function normalizeBadgeTheme(value: unknown, fallback: BadgeTheme = 'light'): BadgeTheme {
  if (typeof value === 'string') {
    const clean = value.trim().toLowerCase();
    if (VALID_BADGE_THEMES.has(clean)) {
      return clean as BadgeTheme;
    }
  }
  return fallback;
}

/**
 * Truncates long badge strings cleanly with an ellipsis so fixed-width SVGs never overflow.
 */
export function truncateBadgeText(text: string, maxChars: number): string {
  const clean = (text || '').trim();
  if (maxChars <= 1 || clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 1).trimEnd()}…`;
}

/**
 * Formats the today appointments count label for the 3rd badge line
 */
export function formatTodayAppointmentsLabel(count: number, allDayCount: number = 0): string {
  const safeCount = Math.max(0, Math.floor(count || 0));
  const safeAllDay = Math.max(0, Math.min(safeCount, Math.floor(allDayCount || 0)));
  if (safeCount <= 0) return '';
  if (safeAllDay > 0) {
    if (safeAllDay === safeCount) {
      return `${safeCount} RDV (journée entière) aujourd'hui`;
    }
    return `${safeCount} RDV (dont journée entière) aujourd'hui`;
  }
  return safeCount === 1
    ? "1 RDV prévu aujourd'hui"
    : `${safeCount} RDV prévus aujourd'hui`;
}

/**
 * Builds the pure text / JSON representation matching the exact lines rendered on the badges.
 * Contains only anonymized availability status, counts, and public profile labels.
 */
export function buildBadgeTextPayload(
  avail: AvailabilityResult,
  options: BadgeTextOptions = {}
): BadgeTextPayload {
  const now = options.now ?? new Date();
  const timezone = options.timezone || 'Europe/Paris';
  const todayAppointmentsCount = Math.max(0, Math.floor(avail.todayAppointmentsCount ?? 0));
  const todayAllDayAppointmentsCount = Math.max(
    0,
    Math.min(todayAppointmentsCount, Math.floor(avail.todayAllDayAppointmentsCount ?? 0))
  );

  const label = formatTodayAppointmentsLabel(todayAppointmentsCount, todayAllDayAppointmentsCount);
  const appointmentsLabel = label ? label : null;
  const lines = appointmentsLabel
    ? [avail.title, avail.subtitle, appointmentsLabel]
    : [avail.title, avail.subtitle];
  const text = appointmentsLabel
    ? `${avail.title} — ${avail.subtitle} • ${appointmentsLabel}`
    : `${avail.title} — ${avail.subtitle}`;

  const zoned = getZonedDateParts(now, timezone);
  const localDate = `${zoned.year}-${String(zoned.month).padStart(2, '0')}-${String(zoned.day).padStart(2, '0')}`;

  return {
    status: avail.status,
    state: avail.state,
    isWorkTime: avail.isWorkTime,
    title: avail.title,
    subtitle: avail.subtitle,
    appointmentsLabel,
    activeCalendarLabel: avail.activeCalendarLabel ?? null,
    lines,
    text,
    todayAppointmentsCount,
    todayAllDayAppointmentsCount,
    ...(options.calendars && options.calendars.length > 0 ? { calendars: options.calendars } : {}),
    nextFreeTime: avail.nextFreeTime ?? null,
    nextChangeAt: avail.nextChangeDate ? avail.nextChangeDate.toISOString() : null,
    colors: {
      badge: avail.badgeColor,
      dot: avail.dotColor,
    },
    profile: {
      name: options.name ?? DEFAULT_PROFILE.name,
      role: options.role ?? DEFAULT_PROFILE.role,
      company: options.company ?? DEFAULT_PROFILE.company,
    },
    timezone,
    localTime: formatTimeShort(now, timezone),
    localDate,
    updatedAt: now.toISOString(),
  };
}

/**
 * Generates dynamic SVG badge with live status and modern multiline typography
 */
export function renderBadgeSvg(
  avail: AvailabilityResult,
  options: BadgeOptions = {}
): string {
  const style = normalizeBadgeStyle(options.style, 'pill');
  const theme = normalizeBadgeTheme(options.theme, 'light');
  const name = options.name ?? DEFAULT_PROFILE.name;
  const role = options.role ?? DEFAULT_PROFILE.role;
  const company = options.company ?? DEFAULT_PROFILE.company;

  const isDark = theme === 'dark';
  const isTransparent = theme === 'transparent';
  const bgColor = isTransparent ? 'none' : isDark ? '#0f172a' : '#ffffff';
  const borderColor = isTransparent ? 'rgba(148,163,184,0.45)' : isDark ? '#334155' : '#e2e8f0';
  const dotPillStroke = isTransparent ? '#ffffff' : bgColor;
  const textPrimary = isTransparent ? '#334155' : isDark ? '#f8fafc' : '#0f172a';
  const textSecondary = isTransparent ? '#64748b' : isDark ? '#94a3b8' : '#64748b';
  const countLineColor = isDark ? '#a5b4fc' : '#4338ca';
  const dotColor = avail.dotColor;
  const badgeColor = avail.badgeColor;

  const todayCount = Math.max(0, Math.floor(avail.todayAppointmentsCount ?? 0));
  const todayAllDayCount = Math.max(
    0,
    Math.min(todayCount, Math.floor(avail.todayAllDayAppointmentsCount ?? 0))
  );
  const hasTodayRdvs = todayCount > 0;
  const rawTodayLabel = formatTodayAppointmentsLabel(todayCount, todayAllDayCount);
  const safeTodayLabel = escapeXml(truncateBadgeText(rawTodayLabel, style === 'card' ? 42 : 46));

  const titleMax = style === 'card' ? 35 : style === 'signature' ? 38 : 38;
  const subMax = style === 'card' ? 42 : style === 'signature' ? 45 : 44;
  const safeTitle = escapeXml(truncateBadgeText(avail.title, titleMax));
  const safeSubtitle = escapeXml(truncateBadgeText(avail.subtitle, subMax));
  const safeName = escapeXml(truncateBadgeText(name, style === 'card' ? 24 : 30));

  // Modern font family stack with Plus Jakarta Sans & native Apple/Windows system fonts
  const cardBgGradient = isTransparent
    ? `<linearGradient id="cardBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
      </linearGradient>`
    : `<linearGradient id="cardBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${isDark ? '#1e293b' : '#ffffff'}" />
        <stop offset="100%" stop-color="${isDark ? '#0f172a' : '#f8fafc'}" />
      </linearGradient>`;

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
      ${cardBgGradient}
    </defs>`;

  // 1. STYLE: DOT (36x36 px, or 42..46 x 38 px with mini RDV counter pill when todayCount > 0)
  if (style === 'dot') {
    if (!hasTodayRdvs) {
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

    const countText = todayCount > 99 ? '99+' : String(todayCount);
    const pillW = countText.length >= 3 ? 25 : countText.length === 2 ? 21 : 16;
    const pillX = countText.length >= 3 ? 19 : countText.length === 2 ? 21 : 24;
    const svgW = pillX + pillW + 2;
    const countFontSize = countText.length >= 3 ? '8.5' : countText.length === 2 ? '9.5' : '10';

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="38" viewBox="0 0 ${svgW} 38" fill="none">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&amp;display=swap');
      text {
        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        text-rendering: geometricPrecision;
      }
    </style>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="2.5" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <circle cx="18" cy="21" r="15.5" fill="${bgColor}" stroke="${borderColor}" stroke-width="1.5"/>
  <circle cx="18" cy="21" r="9.5" fill="${badgeColor}" opacity="0.25">
    <animate attributeName="r" values="7.5;12;7.5" dur="2.4s" repeatCount="indefinite" />
    <animate attributeName="opacity" values="0.35;0.08;0.35" dur="2.4s" repeatCount="indefinite" />
  </circle>
  <circle cx="18" cy="21" r="6.5" fill="${dotColor}" filter="url(#glow)"/>
  <rect x="${pillX}" y="1" width="${pillW}" height="16" rx="8" fill="#4f46e5" stroke="${dotPillStroke}" stroke-width="1.8"/>
  <text x="${pillX + pillW / 2}" y="12.5" text-anchor="middle" font-size="${countFontSize}" font-weight="800" fill="#ffffff">${escapeXml(countText)}</text>
</svg>`;
  }

  // 2. STYLE: PILL MODERNE (400x54 px en 2 lignes, ou 400x70 px en 3 lignes avec RDV du jour)
  if (style === 'pill') {
    if (!hasTodayRdvs) {
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

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="70" viewBox="0 0 400 70" fill="none">
  ${fontDef}
  <!-- Pill Container (3 lines) -->
  <rect x="1" y="1" width="398" height="68" rx="34" fill="url(#cardBgGrad)" stroke="${borderColor}" stroke-width="1.5"/>

  <!-- Left Pulsing Aura & Status Dot -->
  <circle cx="28" cy="35" r="12" fill="${badgeColor}" opacity="0.22">
    <animate attributeName="r" values="9;14;9" dur="2.2s" repeatCount="indefinite" />
    <animate attributeName="opacity" values="0.3;0.08;0.3" dur="2.2s" repeatCount="indefinite" />
  </circle>
  <circle cx="28" cy="35" r="5.5" fill="${dotColor}" filter="url(#dot-glow)"/>

  <!-- Multiline Text: Title (1), Subtitle (2), Today RDV count (3) -->
  <text x="50" y="22" font-size="13" font-weight="700" fill="${badgeColor}" letter-spacing="-0.01em">${safeTitle}</text>
  <text x="50" y="38" font-size="11.5" font-weight="500" fill="${textSecondary}" letter-spacing="-0.01em">${safeSubtitle}</text>
  <circle cx="53.5" cy="51.5" r="2.5" fill="#6366f1"/>
  <text x="61" y="55" font-size="10.5" font-weight="600" fill="${countLineColor}" letter-spacing="-0.01em">${safeTodayLabel}</text>
</svg>`;
  }

  // 3. STYLE: CARTE COMPACTE (380x100 px en 2 lignes, ou 380x118 px en 3 lignes avec RDV du jour)
  if (style === 'card') {
    const svgH = hasTodayRdvs ? 118 : 100;
    const outerH = svgH - 2;
    const innerH = hasTodayRdvs ? 68 : 50;
    const dotCy = hasTodayRdvs ? 70 : 61;
    const titleY = hasTodayRdvs ? 53 : 55;
    const subY = hasTodayRdvs ? 70 : 73;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="380" height="${svgH}" viewBox="0 0 380 ${svgH}" fill="none">
  ${fontDef}
  <!-- Outer Card -->
  <rect x="1" y="1" width="378" height="${outerH}" rx="14" fill="${bgColor}" stroke="${borderColor}" stroke-width="1.5"/>

  <!-- Header row: Dot + Name + Right Tag -->
  <circle cx="22" cy="20" r="4.5" fill="${dotColor}"/>
  <text x="34" y="24" font-size="14.5" font-weight="700" fill="${textPrimary}" letter-spacing="-0.01em">${safeName}</text>
  <text x="362" y="23" text-anchor="end" font-size="11" font-weight="600" fill="${textSecondary}">Disponibilité en direct</text>

  <!-- Inner Status Container (Multiligne) -->
  <rect x="14" y="36" width="352" height="${innerH}" rx="10" fill="${badgeColor}" fill-opacity="0.12" stroke="${badgeColor}" stroke-opacity="0.28" stroke-width="1.2"/>

  <!-- Status Dot inside container -->
  <circle cx="32" cy="${dotCy}" r="10" fill="${badgeColor}" opacity="0.2">
    <animate attributeName="r" values="7;11;7" dur="2s" repeatCount="indefinite" />
  </circle>
  <circle cx="32" cy="${dotCy}" r="5" fill="${dotColor}"/>

  <!-- Status Text Lines -->
  <text x="48" y="${titleY}" font-size="12.5" font-weight="700" fill="${badgeColor}" letter-spacing="-0.01em">${safeTitle}</text>
  <text x="48" y="${subY}" font-size="11.5" font-weight="500" fill="${textSecondary}" letter-spacing="-0.01em">${safeSubtitle}</text>${
    hasTodayRdvs
      ? `
  <circle cx="51.5" cy="84.5" r="2.5" fill="#6366f1"/>
  <text x="59" y="88" font-size="10.5" font-weight="600" fill="${countLineColor}" letter-spacing="-0.01em">${safeTodayLabel}</text>`
      : ''
  }
</svg>`;
  }

  // 4. STYLE: SIGNATURE COMPLÈTE (480x114 px en 2 lignes, ou 480x132 px en 3 lignes avec RDV du jour)
  const initials = (name || 'AM')
    .split(' ')
    .map(part => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'DL';

  const rawRoleText = role ? (company ? `${role} • ${company}` : role) : 'Disponibilité en direct';
  const roleText = escapeXml(truncateBadgeText(rawRoleText, 46));
  const avatarBg = isTransparent ? 'rgba(148,163,184,0.16)' : isDark ? '#1e293b' : '#f1f5f9';

  const sigSvgH = hasTodayRdvs ? 132 : 114;
  const sigOuterH = sigSvgH - 2;
  const avatarCy = hasTodayRdvs ? 66 : 57;
  const avatarTextY = hasTodayRdvs ? 73 : 64;
  const nameY = hasTodayRdvs ? 30 : 31;
  const roleY = hasTodayRdvs ? 47 : 48;
  const boxY = hasTodayRdvs ? 57 : 58;
  const boxH = hasTodayRdvs ? 62 : 44;
  const boxDotCy = hasTodayRdvs ? 88 : 80;
  const boxTitleY = hasTodayRdvs ? 74 : 73;
  const boxSubY = hasTodayRdvs ? 91 : 90;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="480" height="${sigSvgH}" viewBox="0 0 480 ${sigSvgH}" fill="none">
  ${fontDef}
  <!-- Outer Card -->
  <rect x="1" y="1" width="478" height="${sigOuterH}" rx="16" fill="${bgColor}" stroke="${borderColor}" stroke-width="1.5"/>

  <!-- Avatar circle on Left -->
  <circle cx="46" cy="${avatarCy}" r="30" fill="${avatarBg}" stroke="${borderColor}" stroke-width="1.2"/>
  <text x="46" y="${avatarTextY}" text-anchor="middle" font-size="19" font-weight="800" fill="${badgeColor}" letter-spacing="-0.02em">${initials}</text>

  <!-- Contact Info (Right of Avatar) -->
  <text x="90" y="${nameY}" font-size="16" font-weight="800" fill="${textPrimary}" letter-spacing="-0.01em">${safeName}</text>
  <text x="90" y="${roleY}" font-size="12.5" font-weight="500" fill="${textSecondary}" letter-spacing="-0.01em">${roleText}</text>

  <!-- Live Status Box -->
  <rect x="90" y="${boxY}" width="374" height="${boxH}" rx="10" fill="${badgeColor}" fill-opacity="0.12" stroke="${badgeColor}" stroke-opacity="0.28" stroke-width="1.2"/>

  <!-- Pulsing dot inside status box -->
  <circle cx="108" cy="${boxDotCy}" r="9" fill="${badgeColor}" opacity="0.25">
    <animate attributeName="r" values="7;11;7" dur="2s" repeatCount="indefinite" />
  </circle>
  <circle cx="108" cy="${boxDotCy}" r="4.5" fill="${dotColor}"/>

  <!-- Status Text Lines -->
  <text x="124" y="${boxTitleY}" font-size="12" font-weight="700" fill="${badgeColor}" letter-spacing="-0.01em">${safeTitle}</text>
  <text x="124" y="${boxSubY}" font-size="11" font-weight="500" fill="${textSecondary}" letter-spacing="-0.01em">${safeSubtitle}</text>${
    hasTodayRdvs
      ? `
  <circle cx="127.5" cy="105.5" r="2.5" fill="#6366f1"/>
  <text x="135" y="109" font-size="10.5" font-weight="600" fill="${countLineColor}" letter-spacing="-0.01em">${safeTodayLabel}</text>`
      : ''
  }
</svg>`;
}
