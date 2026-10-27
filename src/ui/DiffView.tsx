import type { ObligationRow } from '../core/row';
import { diffRows } from '../state/diff';
export function DiffView({ before, after }: { before: ObligationRow[]; after: ObligationRow[] }) {
  return <section><h2>Two-date comparison</h2><p>Rows pair by clause and stable trigger identity. Different trigger counts remain uncertain.</p>{diffRows(before, after).map((d, i) => <article className="diff" key={i}><strong>{d.status}</strong><div className="two-column"><p>{d.before?.clauseText ?? '—'}</p><p>{d.after?.clauseText ?? '—'}</p></div></article>)}</section>;
}
