import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/dev/E01/packet.json';
import { parsePacket } from '../../src/core/packet';
import { extract } from '../../src/core/extract';
import { diffRows } from '../../src/state/diff';
import { packet as makePacket } from '../extract/fixtures';
function taintedRows(text: string) {
  const p = makePacket(text);
  p.enactment.amendments.push({ amendmentId: 'A1', enactedOn: '2026-03-01', effectiveOn: '2026-03-01', instructionText: 'Unstructured instruction.', affectedSectionIds: ['sec-1'], operations: 'unstructured' });
  return extract(p, '2026-04-01');
}
describe('two-date row pairing (authored, not executed)', () => {
  const packet = parsePacket(JSON.stringify(fixture));
  it('T1 pairs the 30 to 45 day amendment as changed', () => {
    const diff = diffRows(extract(packet, '2026-03-01'), extract(packet, '2026-04-15'));
    expect(diff.some(d => d.status === 'changed' && d.before?.sectionId === 'sec-3' && d.before.subdivision === '(a)')).toBe(true);
  });
  it('identical second-pass fields are unchanged', () => {
    const row = extract(packet, '2026-03-01')[0]!;
    const a = { ...row, clauseHash: 'a' }, b = { ...row, clauseHash: 'b' };
    expect(diffRows([a], [b])[0]?.status).toBe('unchanged');
  });
  it('changed counts never pair by array position', () => {
    const row = extract(packet, '2026-03-01')[0]!;
    const diff = diffRows([{ ...row, clauseHash: 'old' }], [{ ...row, clauseHash: 'new' }, { ...row, rowId: 'extra', pairKey: 'new-key', clauseHash: 'other' }]);
    expect(diff.every(d => d.status === 'uncertain')).toBe(true);
  });
  it('M6-NO-TRIGGER-TAINT: No actor trigger identity survives changed text and unknown modality', () => { // what_bug_this_catches: No vendor shall/may becomes shall/may after taint and falsely splits into removed/added.
    for (const modal of ['shall', 'may']) {
      const before = extract(makePacket(`No vendor ${modal} pay ten dollars.`), '2026-02-01');
      const after = taintedRows(`No vendor ${modal} pay twelve dollars.`);
      expect(after[0]?.modality).toEqual({ unknown: 'amendment_unapplied' });
      expect(before[0]?.triggerText).toBe(`no vendor ${modal}`);expect(after[0]?.triggerText).toBe(before[0]?.triggerText);
      expect(after[0]?.triggerOrdinal).toBe(0);expect(after[0]?.pairKey).toBe(before[0]?.pairKey);
      const diff = diffRows(before, after);expect(diff).toHaveLength(1);expect(diff[0]).toMatchObject({ status: 'changed', before: before[0], after: after[0] });
    }
  });
  it('M6-LATER-TRIGGER-TAINT: each row in a multi-trigger clause retains its own identity', () => { // what_bug_this_catches: an unknown later trigger is identified using the clause's first trigger.
    const before = extract(makePacket('A vendor shall post a notice and may collect ten dollars.'), '2026-02-01');
    const after = taintedRows('A vendor shall post a notice and may collect twelve dollars.');
    expect(after.map(r => r.triggerText)).toEqual(['shall', 'may']);expect(after.every(r => 'unknown' in r.modality)).toBe(true);
    const diff = diffRows(before, after);expect(diff).toHaveLength(2);expect(diff.every(d => d.status === 'changed')).toBe(true);
    expect(diff.find(d => d.before?.triggerText === 'may')?.after?.triggerText).toBe('may');
  });
  it('M6-COUNT-TAINT: matching pair keys never bypass a same-trigger count mismatch', () => { // what_bug_this_catches: pairing equal pairKey early hides an insertion that may have shifted trigger ordinals.
    const before = extract(makePacket('No vendor shall pay ten dollars.'), '2026-02-01');
    const after = taintedRows('No vendor shall pay twelve dollars.\nNo vendor shall pay twenty dollars.');
    expect(after[0]?.pairKey).toBe(before[0]?.pairKey);expect(after.map(r => r.triggerOrdinal)).toEqual([0, 1]);
    const diff = diffRows(before, after);expect(diff).toHaveLength(3);expect(diff.every(d => d.status === 'uncertain')).toBe(true);
  });
  it('M6-LEGACY-UNKNOWN: unidentified legacy/model triggers make affected remainder uncertain', () => { // what_bug_this_catches: unknown modality without source metadata guesses the first trigger and creates false added/removed rows.
    const before = extract(makePacket('A vendor shall post a notice and may collect ten dollars.'), '2026-02-01');
    const after = taintedRows('A vendor shall post a notice and may collect twelve dollars.').map(row => { const copy = { ...row };delete copy.triggerText;delete copy.triggerOrdinal;return copy; });
    const diff = diffRows(before, after);expect(diff).toHaveLength(4);expect(diff.every(d => d.status === 'uncertain')).toBe(true);
    expect(diffRows([], after).every(d => d.status === 'uncertain')).toBe(true);
  });
  it('M6-LEGACY-KNOWN: known evidence identifies the actual later trigger when metadata is absent', () => { // what_bug_this_catches: legacy known rows unnecessarily lose their reliable per-row trigger identity.
    const before = extract(makePacket('A vendor shall post a notice and may collect ten dollars.'), '2026-02-01')[1]!;
    const after = extract(makePacket('A vendor shall post a notice and may collect twelve dollars.'), '2026-02-01')[1]!;
    const legacy = [before, after].map(row => { const copy = { ...row };delete copy.triggerText;delete copy.triggerOrdinal;return copy; });
    expect(diffRows([legacy[0]!], [legacy[1]!])[0]?.status).toBe('changed');
  });
});
