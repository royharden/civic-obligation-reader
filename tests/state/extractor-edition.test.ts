import { expect, it } from 'vitest';
import { extract } from '../../src/core/extract';
import { packet } from '../extract/fixtures';
import { rowRulingKey } from '../../src/ui/RulingControls';
import { reviewFor } from '../../src/state/rulings';

it('stales v1 rulings after the guide conformance fixes create extractor v2', () => {
  // what_bug_this_catches: changed parser behavior reusing the old edition keeps prior rulings falsely confirmed.
  const row = extract(packet('A vendor shall hold a permit.'), '2026-02-01')[0]!;
  expect(row.extractorEdition).toBe('s46-extractor-v2');
  const key = rowRulingKey(row);
  expect(reviewFor(key, [{
    eventId: 'prior-edition', key: { ...key, extractorEdition: 's46-extractor-v1' },
    verdict: 'confirmed', note: '', supersedesEventId: null, createdAt: '2026-10-27T00:00:00Z',
  }])).toBe('stale');
});
