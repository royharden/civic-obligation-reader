import type { ObligationRow } from '../core/row';
export function EvidenceBadge({ row }: { row: ObligationRow }) {
  const exact = row.evidence.quote === 'exact' && row.evidence.version === 'in_force';
  return <span className={`chip ${exact ? 'cited' : 'unknown'}`} title="Verifies literal quote and selected version only; it does not verify meaning or actor correctness.">{exact ? 'exact quote in selected version' : `${row.evidence.quote} quote · version ${row.evidence.version}`}</span>;
}
