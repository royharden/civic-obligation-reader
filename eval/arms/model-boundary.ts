import type { Field, Packet, Resolution, Span } from '../../src/core/types';
import { UNKNOWN_REASONS } from '../../src/core/types';
import type { ActorValue, ActionValue, DeadlineValue, Modality, ObligationRow, RunKind } from '../../src/core/row';
import { EXTRACTOR_EDITION, NORMALIZER_EDITION, normKey, headVerbOf } from '../../src/core/row';
import { asOf } from '../../src/core/asof';
import { definitions, references, resolveDependencies } from '../../src/core/depgraph';
import { verifyQuote, contained } from '../../src/core/verify';
import { deadline as parseRuleDeadline, normalizeDeadline } from '../../src/core/deadline';
import { isValidDate } from '../../src/core/dates';
import { canonicalJSON } from '../../src/core/canonical-json';
import { sha256 } from '../../src/core/hash';
import { taintKey } from '../../src/core/taint';
import { inventory } from '../../src/core/extract';
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('model_invalid: expected object');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[], required = allowed) {
  if (Object.keys(value).some(k => !allowed.includes(k)) || required.some(k => !(k in value))) throw new Error('model_invalid: unexpected or missing field');
}
function text(value: unknown): string { if (typeof value !== 'string') throw new Error('model_invalid: expected text'); return value; }
function span(value: unknown): Span {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isSafeInteger) || value[0] < 0 || value[1] < value[0]) throw new Error('model_invalid: offsets');
  return [value[0] as number, value[1] as number];
}
function field<T>(value: unknown, clause: Span, parse: (known: unknown, evidence: Span) => T): Field<T> {
  const f = object(value);
  if ('unknown' in f) { keys(f, ['unknown']); if (!UNKNOWN_REASONS.includes(f.unknown as never)) throw new Error('model_invalid: reason'); return { unknown: f.unknown as typeof UNKNOWN_REASONS[number] }; }
  keys(f, ['known', 'evidenceSpan']); const evidenceSpan = span(f.evidenceSpan);
  if (!contained(evidenceSpan, clause) || evidenceSpan[0]===evidenceSpan[1]) throw new Error('model_invalid: field outside clause or empty');
  return { known: parse(f.known, evidenceSpan), evidenceSpan };
}
function parseDeadline(value: unknown, evidence: Span, source: string, clause: Span): DeadlineValue {
  const v = object(value); keys(v, ['kind', 'n', 'unit', 'anchorText', 'eventKey', 'date', 'dueDate'], ['kind']);
  const kind = text(v.kind);
  if ('dueDate' in v && v.dueDate !== null && typeof v.dueDate !== 'string') throw new Error('model_invalid: dueDate shape');
  if ('eventKey' in v && typeof v.eventKey !== 'string') throw new Error('model_invalid: eventKey shape');
  if (kind === 'absolute') {
    if (!isValidDate(v.date) || ['n', 'unit', 'anchorText', 'eventKey'].some(k => k in v)) throw new Error('model_invalid: absolute deadline');
    return { kind, date: v.date, dueDate: null };
  }
  if (kind === 'relative_calendar_days' || kind === 'before_event') {
    const anchorText = text(v.anchorText);
    if (!anchorText || !source.slice(...evidence).includes(anchorText) || 'date' in v) throw new Error('model_invalid: anchor');
    if (kind === 'relative_calendar_days') {
      if (!Number.isInteger(v.n) || Number(v.n) < 0 || Number(v.n) > 366 || v.unit !== 'calendar_days') throw new Error('model_invalid: day count');
      return { kind, n: Number(v.n), unit: 'calendar_days', anchorText, eventKey: normKey(anchorText), dueDate: null };
    }
    if ('n' in v || 'unit' in v) throw new Error('model_invalid: before-event count');
    return { kind, anchorText, eventKey: normKey(anchorText), dueDate: null };
  }
  if (kind !== 'none_stated' || ['n', 'unit', 'anchorText', 'eventKey', 'date'].some(k => k in v) || evidence[0] !== clause[0] || evidence[1] !== clause[1]) throw new Error('model_invalid: deadline kind');
  return { kind, dueDate: null };
}
/** Parse output strictly; never repair quotes, search for a better span or replace answers with B0. */
export function verifyModelRows(value: unknown, packet: Packet, date: string, triggerDates: Record<string, string>, arm: string, runKind: RunKind, claimed?: Resolution): ObligationRow[] {
  const output = object(value); keys(output, ['rows', 'sections'], ['rows']);
  if (!Array.isArray(output.rows) || output.rows.length > 30) throw new Error('model_invalid: rows');
  const actual = asOf(packet, date), proposed = claimed ?? actual, ordinal = new Map<string, number>();
  return output.rows.map((input: unknown) => {
    const r = object(input);
    keys(r, ['sectionId', 'subdivision', 'clauseSpan', 'clauseText', 'actor', 'modality', 'action', 'deadline', 'conditions', 'exceptions'], ['sectionId', 'subdivision', 'clauseSpan', 'clauseText', 'actor', 'modality', 'action', 'deadline']);
    const sectionId = text(r.sectionId), subdivision = text(r.subdivision), clauseSpan = span(r.clauseSpan), clauseText = text(r.clauseText);
    const provision = proposed.provisions.find(p => p.sectionId === sectionId), inForce = actual.provisions.find(p => p.sectionId === sectionId);
    if (!provision || !clauseText || verifyQuote(provision.text, ...clauseSpan, clauseText).quote !== 'exact') throw new Error('model_invalid: proposed quote');
    if(arm==='H'&&!inventory(packet,date).some(c=>c.kind==='obligation'&&c.sectionId===sectionId&&c.span[0]===clauseSpan[0]&&c.span[1]===clauseSpan[1]))throw new Error('model_invalid: H outside candidate clause');
    if (!/^(?:\([a-z]\))?(?:\([0-9]+\))?$/.test(subdivision)) throw new Error('model_invalid: subdivision');
    const source = provision.text;
    // A span cannot split a surrogate pair even if the clause endpoints are valid.
    for (const fieldName of ['actor','modality','action','deadline']) {
      const proposedField = object(r[fieldName]);
      if ('evidenceSpan' in proposedField) { const s=span(proposedField.evidenceSpan); if(verifyQuote(source,...s,source.slice(...s)).quote!=='exact')throw new Error('model_invalid: field surrogate/offset'); }
    }
    const defs = definitions(proposed.provisions);
    let actor = field<ActorValue>(r.actor, clauseSpan, (v, s) => {
      const a = object(v); keys(a, ['id', 'raw']); const raw = text(a.raw); text(a.id);
      if (source.slice(...s) !== raw) throw new Error('model_invalid: actor quote');
      const subject = normKey(raw).replace(/^(each|every|any|all|no|such) /, '');
      const definition = [...defs.values()].reverse().find(d => [normKey(d.term), normKey(d.term) + 's', normKey(d.term) + 'es'].includes(subject));
      return { id: definition ? normKey(definition.term) : normKey(raw), raw };
    });
    let modality = field<Modality>(r.modality, clauseSpan, v => {
      if (!['must', 'must_not', 'may', 'need_not'].includes(text(v))) throw new Error('model_invalid: modality'); return v as Modality;
    });
    let action = field<ActionValue>(r.action, clauseSpan, (v, s) => {
      const a = object(v); keys(a, ['predicateSpan', 'headVerb']); const predicateSpan = span(a.predicateSpan);
      const headVerb = text(a.headVerb); if (!/^[a-z0-9]+$/.test(headVerb) || predicateSpan[0] !== s[0] || predicateSpan[1] !== s[1]) throw new Error('model_invalid: action');
      return { predicateSpan, headVerb };
    });
    let deadline = field<DeadlineValue>(r.deadline, clauseSpan, (v, s) => normalizeDeadline(parseDeadline(v, s, source, clauseSpan), triggerDates));
    if (arm === 'H') {
      // H proposes spans; interpretation and calendar arithmetic come from shared code.
      if ('known' in modality) {
        const triggerText = source.slice(...modality.evidenceSpan).toLowerCase();
        const normalized: Modality | null = /^(?:shall not|must not|may not|no .+ (?:shall|may))$/.test(triggerText) ? 'must_not'
          : /^(?:need not|is not required to|are not required to)$/.test(triggerText) ? 'need_not'
          : /^(?:shall|must)$/.test(triggerText) ? 'must' : triggerText === 'may' ? 'may' : null;
        modality = normalized ? { known: normalized, evidenceSpan: modality.evidenceSpan } : { unknown: 'model_invalid' };
      }
      if ('known' in deadline) deadline = parseRuleDeadline(source.slice(...deadline.evidenceSpan), deadline.evidenceSpan, triggerDates).field;
      if ('known' in action) {
        const verb = headVerbOf(source.slice(...action.evidenceSpan));
        action = verb ? { known: { predicateSpan: action.evidenceSpan, headVerb: verb }, evidenceSpan: action.evidenceSpan } : { unknown: 'model_invalid' };
      }
    }
    const actorId = 'known' in actor ? actor.known.id : null;
    const dependentDefinition = actorId === null ? undefined : [...defs.values()].find(d => normKey(d.term) === actorId);
    const refs=references(clauseText,sectionId,subdivision);
    const owned={actor:'known'in actor?actor.evidenceSpan:null,action:'known'in action?action.evidenceSpan:null,deadline:'known'in deadline?deadline.evidenceSpan:null};
    const fieldDeps=(name:'actor'|'action'|'deadline'|'modality')=>{
      const selected=refs.filter(ref=>{const global:Span=[ref.start+clauseSpan[0],ref.end+clauseSpan[0]];return name==='modality'?!Object.values(owned).some(s=>s&&contained(global,s)):!!owned[name]&&contained(global,owned[name]!);});
      return resolveDependencies(proposed,sectionId,[...selected,...(name==='actor'&&dependentDefinition?[{kind:'definition' as const,sectionId:dependentDefinition.sectionId}]:[])],packet,clauseText,subdivision);
    };
    const depFields={actor:fieldDeps('actor'),action:fieldDeps('action'),deadline:fieldDeps('deadline'),modality:fieldDeps('modality')};
    const depIds=[...new Set(Object.values(depFields).flatMap(d=>d.sectionIds))].sort(),dependencyHashes=[...new Set(Object.values(depFields).flatMap(d=>d.dependencyHashes))].sort();
    if(depFields.actor.reason)actor={unknown:depFields.actor.reason};if(depFields.action.reason)action={unknown:depFields.action.reason};if(depFields.deadline.reason)deadline={unknown:depFields.deadline.reason};if(depFields.modality.reason)modality={unknown:depFields.modality.reason};
    if (provision.tainted) {
      actor = { unknown: provision.tainted }; modality = { unknown: provision.tainted }; action = { unknown: provision.tainted }; deadline = { unknown: provision.tainted };
    }
    const unknowns = [...new Set([actor, modality, action, deadline].flatMap(f => 'unknown' in f ? [f.unknown] : []))];
    const trigger = 'known' in modality ? source.slice(...modality.evidenceSpan).toLowerCase() : 'unknown';
    const group = canonicalJSON([sectionId, subdivision, trigger]), n = ordinal.get(group) ?? 0; ordinal.set(group, n + 1);
    const usedDates = 'known' in deadline && deadline.known.eventKey && triggerDates[deadline.known.eventKey] ? { [deadline.known.eventKey]: triggerDates[deadline.known.eventKey] } : {};
    const list = (v: unknown) => { if (v === undefined) return []; if (!Array.isArray(v) || !v.every(x => typeof x === 'string' && clauseText.includes(x))) throw new Error('model_invalid: text list must quote clause'); return v as string[]; };
    const quote = inForce ? verifyQuote(inForce.text, ...clauseSpan, clauseText).quote : 'invalid';
    return { rowId: sha256(canonicalJSON([packet.enactment.id, actual.stateId, sectionId, clauseSpan, 'model', n])),
      pairKey: sha256(canonicalJSON([packet.enactment.id, sectionId, subdivision, trigger, n])),
      query: { enactmentId: packet.enactment.id, asOf: date, triggerDates: { ...triggerDates } }, stateId: actual.stateId, stateHash: actual.stateHash,
      sectionId, subdivision, clauseSpan, clauseText, clauseHash: sha256(clauseText), dependencyHashes,
      taintKey: taintKey(actual.taints, [sectionId, ...depIds]), triggerInputsHash: Object.keys(usedDates).length ? sha256(canonicalJSON(usedDates)) : '',
      extractorEdition: EXTRACTOR_EDITION, normalizerEdition: NORMALIZER_EDITION, actor, modality, action, deadline, conditions: list(r.conditions), exceptions: list(r.exceptions),
      evidence: { quote, version: actual.status === 'not_in_force' ? 'not_in_force' : provision.tainted || unknowns.includes('dependency_tainted') || inForce?.tainted ? 'unknown' : quote === 'exact' ? 'in_force' : 'unknown', references: Object.values(depFields).some(d=>d.reason!==null) ? 'unknown' : 'resolved', interpretation: 'model_proposed' },
      review: 'unreviewed', unknowns, runKind, arm };
  });
}
