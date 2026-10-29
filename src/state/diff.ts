import type { ObligationRow } from '../core/row';
import { canonicalJSON } from '../core/canonical-json';
export type DiffEntry = { status: 'unchanged' | 'changed' | 'added' | 'removed' | 'uncertain'; before?: ObligationRow; after?: ObligationRow };
function fields(row: ObligationRow): string {
  // Comparison is value-based: changed offsets alone do not mean a changed obligation.
  const value = (f: object) => 'known' in f ? (f as { known: unknown }).known : f;
  return canonicalJSON({ actor: value(row.actor), modality: value(row.modality), deadline: value(row.deadline),
    action: 'known' in row.action ? row.clauseText.slice(row.action.known.predicateSpan[0] - row.clauseSpan[0], row.action.known.predicateSpan[1] - row.clauseSpan[0]) : row.action,
    conditions: row.conditions, exceptions: row.exceptions, taintKey: row.taintKey, dependencies: row.dependencyHashes });
}
const scopeKey = (r: ObligationRow): string => canonicalJSON([r.sectionId, r.subdivision]);
function groupKey(r: ObligationRow): string | null {
  // Metadata names this row's trigger even after taint or in a multi-trigger clause.
  const trigger = r.triggerText ?? ('known' in r.modality
    ? r.clauseText.slice(r.modality.evidenceSpan[0] - r.clauseSpan[0], r.modality.evidenceSpan[1] - r.clauseSpan[0]) : '');
  return trigger.trim() ? canonicalJSON([r.sectionId, r.subdivision, trigger.toLowerCase()]) : null;
}
export function diffRows(before: ObligationRow[], after: ObligationRow[]): DiffEntry[] {
  const left = new Set(before), right = new Set(after), result: DiffEntry[] = [];
  const pair = (a: ObligationRow, b: ObligationRow) => {
    result.push({ status: fields(a) === fields(b) ? 'unchanged' : 'changed', before: a, after: b }); left.delete(a); right.delete(b);
  };
  for (const a of before) {
    const aa = before.filter(x => x.sectionId === a.sectionId && x.clauseHash === a.clauseHash);
    const bb = after.filter(x => x.sectionId === a.sectionId && x.clauseHash === a.clauseHash);
    if (aa.length === 1 && bb.length === 1) pair(a, bb[0]!);
  }
  // An unidentified legacy/model trigger could belong to any group in its scope and change its count.
  // Preserve unique-clause pairs above, then keep every affected remainder uncertain.
  const unidentifiedScopes = new Set([...left, ...right].filter(r => groupKey(r) === null).map(scopeKey));
  for (const a of [...left]) if (unidentifiedScopes.has(scopeKey(a))) { result.push({ status: 'uncertain', before: a }); left.delete(a); }
  for (const b of [...right]) if (unidentifiedScopes.has(scopeKey(b))) { result.push({ status: 'uncertain', after: b }); right.delete(b); }
  const groups = new Set([...left, ...right].map(groupKey));
  for (const key of groups) {
    const aa = [...left].filter(r => groupKey(r) === key), bb = [...right].filter(r => groupKey(r) === key);
    if (!aa.length || !bb.length) {
      for (const a of aa) result.push({ status: 'removed', before: a });
      for (const b of bb) result.push({ status: 'added', after: b });
      continue;
    }
    if (aa.length === bb.length) for (const a of aa) {
      const matches = bb.filter(b => right.has(b) && b.pairKey === a.pairKey);
      if (matches.length === 1) pair(a, matches[0]!);
    }
    for (const a of aa.filter(x => left.has(x))) result.push({ status: 'uncertain', before: a });
    for (const b of bb.filter(x => right.has(x))) result.push({ status: 'uncertain', after: b });
  }
  return result;
}
