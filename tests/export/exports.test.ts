import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/dev/E01/packet.json';
import { parsePacket } from '../../src/core/packet';
import { extract } from '../../src/core/extract';
import { csvCell } from '../../src/export/csv';
import { exportRows, jsonExport } from '../../src/export/json';
describe('export evidence and CSV (authored, not executed)', () => {
  it.each(['=cmd', '+42', '-1', '@SUM(A1)', '\ttext', '\rtext', '  =SUM(A1)'])('neutralizes spreadsheet formulas: %s', value => {
    expect(csvCell(value).startsWith('"\'')).toBe(true);
  });
  it('escapes quotes and line breaks', () => { expect(csvCell('a"b\nc')).toBe('"a""b\nc"'); });
  it('exports a tainted clause as partial while omitting invalid quotes', () => {
    const rows = extract(parsePacket(JSON.stringify(fixture)), '2026-04-15');
    const tainted = rows.find(r => r.sectionId === 'sec-5')!;
    expect(exportRows([tainted]).rows[0]?.status).toBe('partial');
    const invalid = { ...tainted, evidence: { ...tainted.evidence, quote: 'invalid' as const } };
    expect(exportRows([invalid])).toEqual({ omitted: 1, rows: [] });
  });
  it('never elevates a wrong actor from exact quote to meaning verification', () => {
    const row = extract(parsePacket(JSON.stringify(fixture)), '2026-02-01')[0]!;
    const wrong = { ...row, actor: { known: { id: 'wrong actor', raw: 'wrong actor' }, evidenceSpan: row.clauseSpan } };
    const output = jsonExport([wrong]); expect(output).toContain('quote_and_version_only'); expect(output).not.toContain('meaning_verified');
  });
});
