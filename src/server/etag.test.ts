import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSemanticWeakEtag, matchesIfNoneMatch } from './etag.ts';

test('computeSemanticWeakEtag produces stable weak ETag and matches If-None-Match headers', () => {
  const etagA = computeSemanticWeakEtag({ status: 'AVAILABLE', localTime: '10:00', count: 1 });
  const etagB = computeSemanticWeakEtag({ status: 'AVAILABLE', localTime: '10:00', count: 1 });
  const etagC = computeSemanticWeakEtag({ status: 'BUSY', localTime: '10:00', count: 1 });

  assert.ok(etagA.startsWith('W/"'));
  assert.equal(etagA, etagB);
  assert.notEqual(etagA, etagC);

  assert.equal(matchesIfNoneMatch(etagA, etagA), true);
  assert.equal(matchesIfNoneMatch(`"other", ${etagA}`, etagA), true);
  assert.equal(matchesIfNoneMatch('*', etagA), true);
  assert.equal(matchesIfNoneMatch(etagC, etagA), false);
  assert.equal(matchesIfNoneMatch(undefined, etagA), false);
});
