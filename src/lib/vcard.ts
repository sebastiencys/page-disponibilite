import { sanitizeOptionalContactField, type UserProfile } from './availability.ts';

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
  const fullName = sanitizeOptionalContactField(profile.name) || 'Contact';
  const parts = fullName.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || '';
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';

  const company = sanitizeOptionalContactField(profile.company);
  const role = sanitizeOptionalContactField(profile.role);
  const email = sanitizeOptionalContactField(profile.email);
  const bookingUrl = sanitizeOptionalContactField(profile.bookingUrl);
  const statusUrl = sanitizeOptionalContactField(publicPageUrl);

  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escapeVCardValue(fullName)}`,
    `N:${escapeVCardValue(lastName)};${escapeVCardValue(firstName)};;;`,
  ];

  if (company) {
    lines.push(`ORG:${escapeVCardValue(company)}`);
  }
  if (role) {
    lines.push(`TITLE:${escapeVCardValue(role)}`);
  }
  if (email) {
    lines.push(`EMAIL;TYPE=INTERNET,WORK:${email}`);
  }
  if (bookingUrl) {
    lines.push(`URL;TYPE=Booking:${bookingUrl}`);
  }
  if (statusUrl) {
    lines.push(`URL;TYPE=Status:${statusUrl}`);
  }

  lines.push('END:VCARD');
  return `${lines.join('\r\n')}\r\n`;
}
