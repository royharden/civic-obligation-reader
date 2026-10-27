import type { Resolution } from '../core/types';
import type { ObligationRow } from '../core/row';
export function SourcePane({ resolution, selected }: { resolution: Resolution; selected?: ObligationRow }) {
  return <section className="source-pane" aria-label="Selected source"><h2>Text in the selected version</h2>{resolution.provisions.map(p => {
    const span = selected?.sectionId === p.sectionId ? selected.clauseSpan : null;
    return <article key={p.sectionId}><h3>{p.path} · {p.heading}</h3>{p.tainted && <p className="warning">Version uncertain: {p.tainted}. Last applied text shown.</p>}<pre>{span ? <>{p.text.slice(0, span[0])}<mark>{p.text.slice(span[0], span[1])}</mark>{p.text.slice(span[1])}</> : p.text}</pre></article>;
  })}{resolution.provisions.length === 0 && <p>No provisions are in force on this date.</p>}</section>;
}
