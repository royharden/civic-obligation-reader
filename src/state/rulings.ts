import { canonicalJSON } from '../core/canonical-json';
import { sha256 } from '../core/hash';
export interface RulingKey {
  pairKey: string; clauseHash: string; dependencyHashes: string[]; taintKey: string;
  extractorEdition: string; normalizerEdition: string; triggerInputsHash: string;
}
export type Verdict = 'confirmed' | 'wrong' | 'unclear';
export interface RulingEvent {
  eventId: string; key: RulingKey; verdict: Verdict; note: string;
  supersedesEventId: string | null; createdAt: string;
}
export const rulingKeyHash = (key: RulingKey): string => sha256(canonicalJSON({ ...key, dependencyHashes: [...key.dependencyHashes].sort() }));
export function reviewFor(key: RulingKey, events: RulingEvent[]): 'unreviewed' | 'stale' | Verdict {
  const matching = events.filter(e => e.key.pairKey === key.pairKey);
  const superseded = new Set(matching.map(e => e.supersedesEventId).filter(Boolean));
  const tips = matching.filter(e => !superseded.has(e.eventId));
  if (tips.length === 0) return 'unreviewed';
  // Conflicting append-only branches are visibly unclear rather than silently last-write-wins.
  if (tips.length !== 1) return 'unclear';
  const event = tips[0]!;
  return rulingKeyHash(event.key) === rulingKeyHash(key) ? event.verdict : 'stale';
}
export function makeRuling(key: RulingKey, verdict: Verdict, note: string, prior: string | null = null): RulingEvent {
  if (note.length > 500) throw new Error('Ruling note exceeds 500 characters');
  return { eventId: crypto.randomUUID(), key: structuredClone(key), verdict, note,
    supersedesEventId: prior, createdAt: new Date().toISOString() };
}
export interface RemoteReviewMetadata { event_id: string; pair_key: string; key_hash: string; verdict: string; supersedes_event_id: string | null }
export function remoteReviewFor(key: RulingKey, events: RemoteReviewMetadata[]): 'unreviewed' | 'stale' | Verdict {
  const samePair = events.filter(e => e.pair_key === key.pairKey);
  const superseded = new Set(samePair.map(e => e.supersedes_event_id));
  const tips = samePair.filter(e => !superseded.has(e.event_id));
  if (tips.length === 0) return 'unreviewed';
  if (tips.length > 1) return 'unclear';
  const tip = tips[0]!;
  if (tip.key_hash !== rulingKeyHash(key)) return 'stale';
  return ['confirmed', 'wrong', 'unclear'].includes(tip.verdict) ? tip.verdict as Verdict : 'unclear';
}
