import { createHash } from 'node:crypto';

/**
 * Builds a weak semantic ETag (W/"...") from stable JSON data
 * (excluding volatile millisecond timestamps like `now` or `updatedAt`).
 */
export function computeSemanticWeakEtag(stableData: unknown): string {
  const digest = createHash('sha1').update(JSON.stringify(stableData)).digest('hex');
  return `W/"${digest}"`;
}

/**
 * Checks whether an incoming HTTP `If-None-Match` header matches the current ETag.
 */
export function matchesIfNoneMatch(
  headerValue: string | string[] | undefined,
  currentEtag: string
): boolean {
  if (!headerValue) return false;
  const raw = Array.isArray(headerValue) ? headerValue.join(',') : headerValue;
  const normalize = (tag: string) => tag.trim().replace(/^W\//i, '');
  const currentNormalized = normalize(currentEtag);

  return raw
    .split(',')
    .map(part => part.trim())
    .some(part => part === '*' || part === currentEtag || normalize(part) === currentNormalized);
}

export interface BadgeImageEtagAvailability {
  status: string;
  state: string;
  isWorkTime: boolean;
  title: string;
  subtitle: string;
  badgeColor: string;
  dotColor: string;
  activeCalendarLabel?: string;
  todayAppointmentsCount?: number;
  todayAllDayAppointmentsCount?: number;
}

export interface BadgeImageEtagOptions {
  style: string;
  theme: string;
  name: string;
  role: string;
  company: string;
  lang: string;
  mode: string;
}

/**
 * Computes a shared semantic ETag for SVG/PNG badge responses across Express and Vercel handlers.
 */
export function buildBadgeImageEtag(
  format: 'svg' | 'png',
  avail: BadgeImageEtagAvailability,
  options: BadgeImageEtagOptions
): string {
  return computeSemanticWeakEtag({
    format,
    style: options.style,
    theme: options.theme,
    lang: options.lang,
    mode: options.mode,
    name: options.name,
    role: options.role,
    company: options.company,
    status: avail.status,
    state: avail.state,
    isWorkTime: avail.isWorkTime,
    title: avail.title,
    subtitle: avail.subtitle,
    badgeColor: avail.badgeColor,
    dotColor: avail.dotColor,
    activeCalendarLabel: avail.activeCalendarLabel ?? '',
    todayAppointmentsCount: avail.todayAppointmentsCount ?? 0,
    todayAllDayAppointmentsCount: avail.todayAllDayAppointmentsCount ?? 0,
  });
}
