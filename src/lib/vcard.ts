import type { UserProfile } from './availability.ts';

function escapeVCardValue(val: string): string {
  return (val || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .trim();
}

/**
 * Generates a privacy-safe RFC 6350/3.0 vCard containing strictly public profile details.
 */
export function buildPublicVCard(profile: UserProfile, publicPageUrl?: string): string {
  const fullName = (profile.name || '').trim() || 'Contact';
  const parts = fullName.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || '';
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';

  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escapeVCardValue(fullName)}`,
    `N:${escapeVCardValue(lastName)};${escapeVCardValue(firstName)};;;`,
  ];

  if (profile.company?.trim()) {
    lines.push(`ORG:${escapeVCardValue(profile.company)}`);
  }
  if (profile.role?.trim()) {
    lines.push(`TITLE:${escapeVCardValue(profile.role)}`);
  }
  if (profile.email?.trim()) {
    lines.push(`EMAIL;TYPE=INTERNET,WORK:${profile.email.trim()}`);
  }
  if (profile.bookingUrl?.trim()) {
    lines.push(`URL;TYPE=Booking:${profile.bookingUrl.trim()}`);
  }
  if (publicPageUrl?.trim()) {
    lines.push(`URL;TYPE=Status:${publicPageUrl.trim()}`);
  }

  lines.push('END:VCARD');
  return `${lines.join('\r\n')}\r\n`;
}
