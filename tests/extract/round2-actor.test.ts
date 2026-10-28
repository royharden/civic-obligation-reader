import { describe, expect, it } from 'vitest';
import { extract, inventory } from '../../src/core/extract';
import { packet } from './fixtures';

const date = '2026-02-01';

describe('Round 2 actor guide regressions', () => {
  it.each([
    'During the festival, a vendor shall file the form.',
    'Accordingly, a vendor shall file the form.',
    'Therefore, a vendor shall file the form.',
    'After receiving notice, a vendor shall file the form.',
    'For every renewal, a vendor shall file the form.',
    'The permit having expired, a vendor shall file the form.',
    'The permit having expired, a vendor, the license holder, shall file the form.',
    'During the festival, the permit having expired, a vendor, the license holder, shall file the form.',
    'If the permit that the clerk issued expires, a vendor shall file the form.',
    'Under the rules which apply during the festival, a vendor shall file the form.',
    'During the festival, vendors shall file the form.',
  ])('finds the subject after an arbitrary fronted comma phrase: %s', text => {
    // what_bug_this_catches: fixed fronted-keyword lists treat the circumstance as the actor.
    const row = extract(packet(text), date)[0]!;
    const raw = text.includes(', vendors ') ? 'vendors' : 'a vendor';
    expect(row.actor).toMatchObject({ known: { id: raw === 'vendors' ? 'vendors' : 'vendor', raw } });
    if ('known' in row.actor) expect(text.slice(...row.actor.evidenceSpan)).toBe(raw);
  });

  it.each([
    'A vendor who holds a permit shall file the form.',
    'A vendor, who holds a permit, shall file the form.',
    'A vendor, when licensed, shall file the form.',
    'A vendor who holds a permit, when licensed, shall file the form.',
    'During the festival, a vendor, when licensed, shall file the form.',
  ])('keeps subject boundaries before relative clauses and parentheticals: %s', text => {
    // what_bug_this_catches: choosing the last comma replaces the subject with relative/parenthetical text.
    const row = extract(packet(text), date)[0]!;
    const raw = text.startsWith('During') ? 'a vendor' : 'A vendor';
    expect(row.actor).toMatchObject({ known: { id: 'vendor', raw } });
    if ('known' in row.actor) expect(text.slice(...row.actor.evidenceSpan)).toBe(raw);
  });

  it.each([
    'A vendor who is having a permit renewed, the license holder, shall file the form.',
    'A vendor who holds a permit having a red seal, the license holder, shall file the form.',
    'A vendor who is having a permit renewed, when licensed, shall file the form.',
    'A vendor that is having a permit renewed, the license holder, shall file the form.',
    'A vendor which is having a permit renewed, the license holder, shall file the form.',
    'During the festival, a vendor who is having a permit renewed, the license holder, shall file the form.',
    'During the festival, a vendor who holds a permit having a red seal, the license holder, shall file the form.',
    'During the festival, a vendor who is having a permit renewed, when licensed, shall file the form.',
    'During the festival, a vendor that is having a permit renewed, the license holder, shall file the form.',
    'During the festival, a vendor which is having a permit renewed, the license holder, shall file the form.',
  ])('keeps having inside an explicit subject relative from activating absolute fronting: %s', text => {
    // what_bug_this_catches: having inside who/that/which discarded the subject and promoted its appositive.
    const row = extract(packet(text), date)[0]!;
    const raw = text.startsWith('During') ? 'a vendor' : 'A vendor';
    const start = text.indexOf(raw);
    expect(row.actor).toEqual({ known: { id: 'vendor', raw }, evidenceSpan: [start, start + raw.length] });
  });

  it.each([
    ['In-house counsel, the license holder, shall file the form.', 'In-house counsel', 'in-house counsel'],
    ['On-call vendor, the license holder, shall file the form.', 'On-call vendor', 'on-call vendor'],
    ['During the festival, in-house counsel, the license holder, shall file the form.', 'in-house counsel', 'in-house counsel'],
    ['During the festival, on-call vendor, the license holder, shall file the form.', 'on-call vendor', 'on-call vendor'],
  ] as const)('keeps a hyphenated role head from activating circumstance fronting: %s', (text, raw, id) => {
    // what_bug_this_catches: the boundary after In/On also matches the hyphen inside an explicit role.
    const row = extract(packet(text), date)[0]!;
    const start = text.indexOf(raw);
    expect(row.actor).toEqual({ known: { id, raw }, evidenceSpan: [start, start + raw.length] });
  });

  it.each([
    'No vendor shall file the form.',
    'No vendor may file the form.',
    'No vendor who is having a permit renewed shall file the form.',
    'No vendor that is having a permit renewed shall file the form.',
    'No vendor which is having a permit renewed shall file the form.',
    'No vendor, the license holder, shall file the form.',
    'No vendor, who is having a permit renewed, shall file the form.',
    'No vendor who holds a permit having a red seal, the license holder, shall file the form.',
    'During the festival, No vendor who is having a permit renewed shall file the form.',
    'During the festival, No vendor that is having a permit renewed shall file the form.',
    'During the festival, No vendor which is having a permit renewed shall file the form.',
    'During the festival, No vendor, the license holder, shall file the form.',
    'On February 1, 2027, No vendor, the license holder, may file the form.',
  ])('applies subject boundaries inside a No-subject prohibition: %s', text => {
    // what_bug_this_catches: the No override restored relative text, or a comma prevented prohibition detection.
    const row = extract(packet(text), date)[0]!;
    const noStart = text.indexOf('No ');
    const actorStart = noStart + 'No '.length;
    const modal = /(?:shall|may)(?= file the form\.)/.exec(text)!;
    expect(row.actor).toEqual({ known: { id: 'vendor', raw: 'vendor' }, evidenceSpan: [actorStart, actorStart + 'vendor'.length] });
    expect(row.modality).toEqual({ known: 'must_not', evidenceSpan: [noStart, modal.index + modal[0].length] });
  });

  it.each([
    ['If no vendor is present, the Clerk shall file the form.', 'the Clerk'],
    ['For no vendor, the Clerk shall file the form.', 'the Clerk'],
    ['A vendor who holds no permit shall file the form.', 'A vendor'],
    ['No permits having expired, a vendor, the license holder, shall file the form.', 'a vendor'],
  ] as const)('keeps no outside the operative subject from creating a prohibition: %s', (text, raw) => {
    // what_bug_this_catches: a wider No-subject match absorbs a fronted circumstance or subject modifier.
    const row = extract(packet(text), date)[0]!;
    const start = text.indexOf(raw);
    const modalStart = text.indexOf('shall');
    expect(row.actor).toEqual({ known: { id: raw.toLowerCase().includes('clerk') ? 'clerk' : 'vendor', raw }, evidenceSpan: [start, start + raw.length] });
    expect(row.modality).toEqual({ known: 'must', evidenceSpan: [modalStart, modalStart + 'shall'.length] });
  });

  it.each([
    'No vendor shall file the form and shall keep a copy.',
    'No vendor, the license holder, shall file the form and shall keep a copy.',
    'During the festival, No vendor who is having a permit renewed, the license holder, shall file the form and shall keep a copy.',
  ])('retains a carried No-subject actor without consuming the preceding trigger: %s', text => {
    // what_bug_this_catches: extending the No match across an earlier modal destroys coordinated actor carry-over.
    const rows = extract(packet(text), date);
    const start = text.indexOf('No ') + 'No '.length;
    const actor = { known: { id: 'vendor', raw: 'vendor' }, evidenceSpan: [start, start + 'vendor'.length] };
    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.actor)).toEqual([actor, actor]);
    expect(rows[0]!.modality).toMatchObject({ known: 'must_not' });
    expect(rows[1]!.triggerText).toBe('shall');
    expect(rows[0]!.action).toMatchObject({ known: { headVerb: 'file' } });
    expect(rows[1]!.action).toMatchObject({ known: { headVerb: 'keep' } });
  });

  it.each([
    'During the festival, the vendor and the Clerk shall file the form.',
    'During the festival, the vendor or the Clerk shall file the form.',
    'The vendor, or the Clerk shall file the form.',
  ])('preserves joint/alternative subject ambiguity: %s', text => {
    // what_bug_this_catches: trimming a comma or fronted phrase silently chooses one coordinated actor.
    expect(extract(packet(text), date)[0]!.actor).toEqual({ unknown: 'actor_ambiguous' });
  });

  it.each([
    ['A vendor, the license holder, shall file the form.', 'A vendor', 'vendor'],
    ['The Clerk, the keeper of records, shall file the form.', 'The Clerk', 'clerk'],
    ['Clerk, the keeper of records, shall file the form.', 'Clerk', 'clerk'],
    ['During the festival, a vendor, the license holder, shall file the form.', 'a vendor', 'vendor'],
    ['For a vendor who holds a permit, the Clerk, the keeper of records, shall file the form.', 'the Clerk', 'clerk'],
    ['During the festival, a vendor, the person who holds a permit, shall file the form.', 'a vendor', 'vendor'],
  ] as const)('keeps the subject before a comma-set appositive: %s', (text, raw, id) => {
    // what_bug_this_catches: a determiner-led appositive is selected as a replacement actor.
    const row = extract(packet(text), date)[0]!;
    const start = text.indexOf(raw);
    expect(row.actor).toEqual({ known: { id, raw }, evidenceSpan: [start, start + raw.length] });
  });

  it.each([
    'On February 1, 2027, a vendor shall file the form.',
    'By February 1, 2027, a vendor, the license holder, shall file the form.',
  ])('keeps a date comma inside its fronted phrase: %s', text => {
    // what_bug_this_catches: the comma inside a Month D, YYYY date becomes an actor boundary.
    const row = extract(packet(text), date)[0]!;
    const start = text.indexOf('a vendor');
    expect(row.actor).toEqual({ known: { id: 'vendor', raw: 'a vendor' }, evidenceSpan: [start, start + 'a vendor'.length] });
  });

  it('retains carried actors after a fronted phrase and a second coordinated trigger', () => {
    // what_bug_this_catches: fronted-boundary changes lose explicit subject carry-over.
    const text = 'During the festival, a vendor shall file the form and shall keep a copy.';
    const rows = extract(packet(text), date);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.actor).toMatchObject({ known: { id: 'vendor', raw: 'a vendor' } });
    expect(rows[1]!.actor).toEqual(rows[0]!.actor);
  });

  it.each(['put', 'held', 'filed'])('keeps thing-subject %s passives and attributes their by-agent', participle => {
    // what_bug_this_catches: irregular put was filtered as non-operative before passive actor attribution.
    const text = `The permit shall be ${participle} on display by the clerk.`;
    expect(inventory(packet(text), date)[0]!.kind).toBe('obligation');
    const row = extract(packet(text), date)[0]!;
    expect(row.actor).toMatchObject({ known: { id: 'clerk', raw: 'the clerk' } });
    if ('known' in row.actor) expect(text.slice(...row.actor.evidenceSpan)).toBe('the clerk');
    expect(extract(packet(`The permit shall be ${participle} on display.`), date)[0]!.actor).toEqual({ unknown: 'actor_unstated' });
  });

  it('does not use a passive by-date as its actor', () => {
    // what_bug_this_catches: recognising put as passive must not turn its deadline into a person.
    expect(extract(packet('The permit shall be put on display by February 1, 2027.'), date)[0]!.actor).toEqual({ unknown: 'actor_unstated' });
  });

  it.each(['responsible', 'liable', 'present', 'eligible'])('keeps the subject of the adjective predicate be %s', adjective => {
    // what_bug_this_catches: a widened passive pattern mistakes explicit guide adjective exceptions for agentless passive duties.
    expect(extract(packet(`A vendor shall be ${adjective} for inspection.`), date)[0]!.actor).toMatchObject({ known: { id: 'vendor', raw: 'A vendor' } });
  });
});
