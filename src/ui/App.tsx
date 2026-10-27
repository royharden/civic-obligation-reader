import { useMemo, useState } from 'react';
import p1 from '../../fixtures/dev/E01/packet.json';
import p2 from '../../fixtures/dev/E02/packet.json';
import p3 from '../../fixtures/dev/E03/packet.json';
import p4 from '../../fixtures/dev/E04/packet.json';
import p5 from '../../fixtures/dev/E05/packet.json';
import p6 from '../../fixtures/dev/E06/packet.json';
import { parsePacket } from '../core/packet';
import { asOf, statePeriods } from '../core/asof';
import { extract } from '../core/extract';
import type { ObligationRow } from '../core/row';
import { readLocalRulings } from '../state/rulings-local';
import { reviewFor } from '../state/rulings';
import type { RulingEvent } from '../state/rulings';
import { Banner } from './Banner';
import { FixturePicker } from './FixturePicker';
import { DateControl } from './DateControl';
import { TriggerInputs } from './TriggerInputs';
import { PeriodList } from './PeriodList';
import { SourcePane } from './SourcePane';
import { ObligationTable } from './ObligationTable';
import { DiffView } from './DiffView';
import { ExportButtons } from './ExportButtons';
import { ResultsView } from './ResultsView';
import { RulingControls, rowRulingKey } from './RulingControls';
const fixtures = [p1, p2, p3, p4, p5, p6];
export function App() {
  const [fixture, setFixture] = useState('E01'), [packetText, setPacketText] = useState(JSON.stringify(p1, null, 2));
  const [draft, setDraft] = useState(''), [date, setDate] = useState('2026-04-15'), [otherDate, setOtherDate] = useState('2026-02-01');
  const [triggers, setTriggers] = useState<Record<string, string>>({}), [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [historyState, setHistoryState] = useState<{ events: RulingEvent[]; error: string }>(() => {
    try { return { events: readLocalRulings(), error: '' }; } catch (error) { return { events: [], error: error instanceof Error ? error.message : 'Local history could not be read.' }; }
  });
  const result = useMemo(() => {
    try {
      const packet = parsePacket(packetText), resolution = asOf(packet, date);
      const rows = extract(packet, date, triggers, 'B0').map(row => ({ ...row, review: reviewFor(rowRulingKey(row), historyState.events) }));
      return { packet, resolution, rows, error: '' };
    } catch (error) { return { error: error instanceof Error ? error.message : 'Packet or date is invalid.' }; }
  }, [packetText, date, triggers, historyState.events]);
  const comparison = useMemo(() => {
    if (!result.packet) return { rows: [] as ObligationRow[], error: '' };
    try { return { rows: extract(result.packet, otherDate, triggers, 'B0'), error: '' }; }
    catch (error) { return { rows: [], error: error instanceof Error ? error.message : 'Invalid comparison date.' }; }
  }, [result.packet, otherDate, triggers]);
  const rows = result.rows ?? [], selected = rows.find(r => r.rowId === selectedId);
  const anchorKeys = [...new Set(rows.flatMap(r => 'known' in r.deadline && r.deadline.known.eventKey ? [r.deadline.known.eventKey] : []))];
  function choose(id: string) {
    const p = fixtures.find(f => f.enactment.id === id); if (!p) return;
    setFixture(id); setPacketText(JSON.stringify(p, null, 2)); setDate(p.enactment.commencesOn); setOtherDate(p.enactment.commencesOn); setTriggers({}); setSelectedId(null); setMessage('');
  }
  function load() {
    try { parsePacket(draft); setPacketText(draft); setFixture(''); setTriggers({}); setSelectedId(null); setMessage('Loaded locally. Source text was not uploaded.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Invalid packet'); }
  }
  return <><Banner /><header><div className="eyebrow">CIVIC OBLIGATION READER</div><h1>What does the supplied text say,<br />on this date?</h1><p>Explore fictional enactments, follow their amendments, and inspect the words behind each row.</p></header><main><section className="controls"><FixturePicker value={fixture} onChange={choose} titles={fixtures.map(f => ({ id: f.enactment.id, title: f.enactment.title }))} /><DateControl value={date} onChange={setDate} /><DateControl value={otherDate} onChange={setOtherDate} label="Compare with" /></section><details><summary>Paste a fictional JSON packet</summary><label>Packet JSON (up to 128 KiB)<textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="Paste a s46.packet.v1 packet" /></label><button onClick={load}>Load packet locally</button><p role="status">{message}</p></details>{historyState.error && <p role="alert" className="warning">{historyState.error} Existing local history is preserved; ruling saves will remain blocked until recovered.</p>}{result.error ? <p role="alert">{result.error}</p> : result.packet && result.resolution && <><h2 className="packet-title">{result.packet.enactment.title}</h2><PeriodList periods={statePeriods(result.packet)} resolution={result.resolution} onSelect={setDate} /><TriggerInputs keys={anchorKeys} dates={triggers} onChange={setTriggers} /><ObligationTable rows={rows} onSelect={r => setSelectedId(r.rowId)} /><ExportButtons rows={rows} /><div className="two-column"><SourcePane resolution={result.resolution} selected={selected} /><RulingControls row={selected} events={historyState.events} onChange={events => setHistoryState({ events, error: '' })} /></div>{comparison.error ? <p role="alert">{comparison.error}</p> : <DiffView before={comparison.rows} after={rows} />}</>}<ResultsView /></main><footer>Source words and selected versions can be checked. Their interpretation still needs judgment.</footer></>;
}
