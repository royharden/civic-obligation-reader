import { describe, expect, it } from 'vitest';
import { remoteReviewFor, reviewFor, rulingKeyHash } from '../../src/state/rulings';
import type { RulingEvent, RulingKey } from '../../src/state/rulings';
const key: RulingKey = { pairKey: 'a'.repeat(64), clauseHash: 'b'.repeat(64), dependencyHashes: ['c'.repeat(64)], taintKey: '', extractorEdition: '1', normalizerEdition: '1', triggerInputsHash: '' };
const event: RulingEvent = { eventId: 'one', key, verdict: 'confirmed', note: '', supersedesEventId: null, createdAt: '2026-10-27T00:00:00Z' };
describe('T17 append-only ruling validity (authored, not executed)', () => {
  it('stales a confirmation when its definition changes but quote does not', () => {
    expect(reviewFor({ ...key, dependencyHashes: ['d'.repeat(64)] }, [event])).toBe('stale');
  });
  it('stales an unchanged quote when amendment taint appears', () => {
    expect(reviewFor({ ...key, taintKey: 'sec-3:amendment_unapplied' }, [event])).toBe('stale');
  });
  it('keeps an identical key across an unrelated state change', () => {
    expect(reviewFor(key, [event])).toBe('confirmed');
    expect(rulingKeyHash(key)).toBe(rulingKeyHash({ ...key, dependencyHashes: [...key.dependencyHashes].reverse() }));
  });
  it('shows concurrent branches as unclear', () => {
    expect(reviewFor(key, [event, { ...event, eventId: 'two', verdict: 'wrong' }])).toBe('unclear');
  });
  it('displays remote metadata separately and stales it on a changed row key', () => {
    const remote = [{ event_id: 'remote-one', pair_key: key.pairKey, key_hash: rulingKeyHash(key), verdict: 'confirmed', supersedes_event_id: null }];
    expect(remoteReviewFor(key, remote)).toBe('confirmed');
    expect(remoteReviewFor({ ...key, taintKey: 'changed' }, remote)).toBe('stale');
    expect(reviewFor(key, [])).toBe('unreviewed');
  });
});
