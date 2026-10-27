import type { ObligationRow } from '../core/row';
import { exportRows } from './json';
export function csvCell(value: unknown): string {
  let text = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
  if (/^[\s]*[=+\-@]|^[\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function csvExport(rows: ObligationRow[]): string {
  const columns = ['asOf', 'section', 'actor', 'modality', 'action', 'deadline', 'quote', 'status', 'verificationScope', 'review', 'runKind'];
  const entries = exportRows(rows).rows.map(r => [r.query.asOf, r.sectionId + r.subdivision,
    'known' in r.actor ? r.actor.known.raw : `unknown:${r.actor.unknown}`,
    'known' in r.modality ? r.modality.known : `unknown:${r.modality.unknown}`,
    'known' in r.action ? r.clauseText.slice(r.action.known.predicateSpan[0] - r.clauseSpan[0], r.action.known.predicateSpan[1] - r.clauseSpan[0]) : `unknown:${r.action.unknown}`,
    'known' in r.deadline ? r.deadline.known : `unknown:${r.deadline.unknown}`,
    r.clauseText, r.status, r.status === 'cited' ? 'quote_and_version_only' : '', r.review, r.runKind]);
  return [columns, ...entries].map(line => line.map(csvCell).join(',')).join('\r\n');
}
