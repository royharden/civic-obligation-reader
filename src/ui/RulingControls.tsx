import { useEffect, useRef, useState } from 'react';
import type { ObligationRow } from '../core/row';
import { makeRuling, remoteReviewFor } from '../state/rulings';
import type { RulingEvent, RulingKey, Verdict } from '../state/rulings';
import { appendLocalRuling } from '../state/rulings-local';
import { saveRemoteRuling, readRemoteRulings } from '../state/rulings-remote';
import type { RemoteRuling } from '../state/rulings-remote';
import { supabase } from '../lib/supabase';
export function rowRulingKey(row: ObligationRow): RulingKey {
  return { pairKey: row.pairKey, clauseHash: row.clauseHash, dependencyHashes: row.dependencyHashes, taintKey: row.taintKey,
    extractorEdition: row.extractorEdition, normalizerEdition: row.normalizerEdition, triggerInputsHash: row.triggerInputsHash };
}
export function RulingControls({ row, events, onChange }: { row?: ObligationRow; events: RulingEvent[]; onChange: (events: RulingEvent[]) => void }) {
  const [note, setNote] = useState(''), [message, setMessage] = useState(''), [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [remoteHistory, setRemoteHistory] = useState<RemoteRuling[] | null>(null);
  const remoteEpoch = useRef(0);
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange(() => { remoteEpoch.current++; setRemoteHistory(null); });
    return () => data.subscription.unsubscribe();
  }, []);
  async function refreshRemoteHistory(prefix = '') {
    const epoch = ++remoteEpoch.current;
    setRemoteHistory(null);
    const result = await readRemoteRulings();
    if (epoch !== remoteEpoch.current) return;
    if (result.status !== 'ok') { setMessage(`${prefix}Remote history was not refreshed. ${result.message}`); return; }
    setRemoteHistory(result.value);
    setMessage(`${prefix}Loaded ${result.value.length} remote metadata events. Remote review is displayed separately from local history.`);
  }
  async function save(verdict: Verdict, remote: boolean) {
    if (!row || busy) return;
    setBusy(true);
    try {
      const candidates = events.filter(e => e.key.pairKey === row.pairKey);
      const superseded = new Set(candidates.map(e => e.supersedesEventId));
      const tips = candidates.filter(e => !superseded.has(e.eventId));
      if (!remote && tips.length > 1) throw new Error('Conflicting local branches need explicit reconciliation before another ruling.');
      let prior = tips[0]?.eventId ?? null;
      if (remote) {
        remoteEpoch.current++; setRemoteHistory(null);
        const history = await readRemoteRulings();
        if (history.status !== 'ok') { setMessage(history.message); return; }
        const candidates = history.value.filter(e => e.pair_key === row.pairKey);
        const superseded = new Set(candidates.map(e => e.supersedes_event_id));
        const tips = candidates.filter(e => !superseded.has(e.event_id));
        if (tips.length > 1) throw new Error('Remote history has conflicting branches; reconcile before saving.');
        prior = tips[0]?.event_id ?? null;
      }
      const event = makeRuling(rowRulingKey(row), verdict, note, prior);
      if (remote) {
        const result = await saveRemoteRuling(event);
        setMessage(result.status === 'ok' ? 'Saved remote metadata. Local history was not changed.' : result.message);
        if (result.status === 'ok') await refreshRemoteHistory('Remote metadata was saved. ');
      } else { onChange(appendLocalRuling(event)); setMessage('Saved to this browser only.'); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ruling save failed.'); }
    finally { setBusy(false); }
  }
  return <section><h2>Review a row</h2>{row ? <><blockquote>{row.clauseText}</blockquote><label>Note (500 characters; avoid sensitive information)<textarea maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></label><div className="actions">{(['confirmed', 'wrong', 'unclear'] as const).map(v => <button disabled={busy} key={v} onClick={() => void save(v, false)}>Save local: {v}</button>)}</div>{supabase && <div className="actions">{(['confirmed', 'wrong', 'unclear'] as const).map(v => <button disabled={busy} key={v} onClick={() => void save(v, true)}>Save remote: {v}</button>)}</div>}</> : <p>Select an actor in the table to inspect its source and record a ruling.</p>}
    <p>Rulings append events. Changes to relevant definitions, taint, extraction edition or event dates make prior rulings stale.</p>
    {supabase ? <details><summary>Owner account and remote metadata</summary><p>Remote storage keeps hashes, verdicts and notes only. Source and machine values stay in this browser.</p><label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} /></label><div className="actions"><button onClick={() => { void supabase!.auth.signInWithOtp({ email }).then(({ error }) => setMessage(error ? 'Sign-in link could not be sent.' : 'Check your email for the sign-in link.')).catch(() => setMessage('Sign-in failed.')); }}>Send sign-in link</button><button onClick={() => { remoteEpoch.current++; setRemoteHistory(null); void supabase!.auth.signOut().then(({ error }) => setMessage(error ? 'Sign out failed.' : 'Signed out.')).catch(() => setMessage('Sign out failed.')); }}>Sign out</button><button onClick={() => { void refreshRemoteHistory(); }}>Read remote metadata</button></div>{remoteHistory && row && <div><p><strong>Remote review: {remoteReviewFor(rowRulingKey(row), remoteHistory)}</strong> · local review: {row.review}</p><p>Remote review compares the stored key hash with this exact row key. It does not change local history.</p>{remoteHistory.filter(e => e.pair_key === row.pairKey).map(e => <article key={e.event_id}><strong>{e.verdict}</strong> · <time>{e.created_at}</time><p>{e.note || 'No note'}</p></article>)}</div>}</details> : <p className="muted">Local mode · remote sync not configured.</p>}<p role="status">{message}</p></section>;
}
