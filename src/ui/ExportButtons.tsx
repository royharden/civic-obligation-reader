import type { ObligationRow } from '../core/row';
import { csvExport } from '../export/csv';
import { jsonExport, diagnosticsExport } from '../export/json';
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
export function ExportButtons({ rows }: { rows: ObligationRow[] }) {
  return <div className="actions"><button onClick={() => download('obligations.csv', csvExport(rows), 'text/csv;charset=utf-8')}>Export CSV</button><button onClick={() => download('obligations.json', jsonExport(rows), 'application/json')}>Export JSON</button><button onClick={() => download('diagnostics.json', diagnosticsExport(rows), 'application/json')}>Export diagnostics</button></div>;
}
