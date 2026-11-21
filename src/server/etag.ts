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
