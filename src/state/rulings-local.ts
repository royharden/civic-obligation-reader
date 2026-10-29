import type { RulingEvent } from './rulings';
const STORAGE_KEY = 's46.rulings.v1';
export function readLocalRulings(storage: Pick<Storage, 'getItem'> = localStorage): RulingEvent[] {
  const text = storage.getItem(STORAGE_KEY);
  if (text === null) return [];
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value) || value.some(e => !validEvent(e))) throw new Error('Saved ruling history is invalid; preserve it before recovery');
  return value as RulingEvent[];
}
function validEvent(e: unknown): e is RulingEvent {
  if (!e || typeof e !== 'object') return false;
  const x = e as RulingEvent;
  return typeof x.eventId === 'string' && typeof x.note === 'string' && x.note.length <= 500 &&
    ['confirmed', 'wrong', 'unclear'].includes(x.verdict) && typeof x.createdAt === 'string' &&
    (x.supersedesEventId === null || typeof x.supersedesEventId === 'string') && !!x.key &&
    ['pairKey', 'clauseHash', 'taintKey', 'extractorEdition', 'normalizerEdition', 'triggerInputsHash'].every(k => typeof (x.key as unknown as Record<string, unknown>)[k] === 'string') &&
    Array.isArray(x.key.dependencyHashes) && x.key.dependencyHashes.every(h => typeof h === 'string');
}
export function appendLocalRuling(event: RulingEvent, storage: Storage = localStorage): RulingEvent[] {
  if (!validEvent(event)) throw new Error('Invalid ruling');
  const events = readLocalRulings(storage);
  if (events.some(e => e.eventId === event.eventId)) throw new Error('Duplicate ruling event');
  if (event.supersedesEventId !== null && !events.some(e => e.eventId === event.supersedesEventId && e.key.pairKey === event.key.pairKey)) throw new Error('Superseded event not found');
  const next = [...events, event];
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next; // storage errors surface; never report unsaved state as saved
}
