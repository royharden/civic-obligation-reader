import type { ObligationRow } from '../core/row';
export function exportStatus(row: ObligationRow): 'partial' | 'cited' | 'unsupported' {
  if (row.evidence.quote !== 'exact' || row.evidence.version === 'not_in_force') return 'unsupported';
  return row.evidence.version === 'unknown' || row.evidence.references === 'unknown' ? 'partial' : 'cited';
}
export function exportRows(rows: ObligationRow[]) {
  const supported = rows.filter(r => exportStatus(r) !== 'unsupported');
  return { omitted: rows.length - supported.length, rows: supported.map(r => ({ ...r, status: exportStatus(r),
    ...(exportStatus(r) === 'cited' ? { verificationScope: 'quote_and_version_only' } : {}) })) };
}
export function jsonExport(rows: ObligationRow[]): string {
  const result = exportRows(rows);
  return JSON.stringify({ schemaVersion: 's46.export.v1', notice: 'Fictional supplied text only. Not legal advice. Citation verifies quote and version only.', ...result }, null, 2);
}
export function diagnosticsExport(rows: ObligationRow[]): string {
  return JSON.stringify({ rows: rows.filter(r => exportStatus(r) === 'unsupported').map(r => ({ ...r, status: 'unsupported' })) }, null, 2);
}
