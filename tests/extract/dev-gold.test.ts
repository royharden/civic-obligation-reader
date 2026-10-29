import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { it,expect } from 'vitest';
import type { GoldLine } from '../../eval/score';
import { extract } from '../../src/core/extract';
import { parsePacket } from '../../src/core/packet';
import { queryDates } from '../../eval/dates';
for(const id of ['E01','E02','E03','E04','E05','E06'])it(`${id} independent hand-authored gold matches extracted values for every query`,()=>{ // what_bug_this_catches: integration drift across state boundaries, taint, modal/field boundaries and supplied trigger maps.
 const dir=resolve(import.meta.dirname,'../../fixtures/dev',id),p=parsePacket(readFileSync(resolve(dir,'packet.json'),'utf8')),gold=readFileSync(resolve(dir,'gold.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s) as GoldLine);
 expect(queryDates(p)).toEqual([...new Set(gold.map(g=>g.asOf))].sort());
 for(const date of queryDates(p)){const gs=gold.filter(g=>g.asOf===date&&g.kind==='obligation'),rows=extract(p,date,gold.find(g=>g.asOf===date)!.triggerDates),unused=[...rows];expect(rows).toHaveLength(gs.length);for(const g of gs){const i=unused.findIndex(r=>r.sectionId===g.sectionId&&JSON.stringify(r.clauseSpan)===JSON.stringify(g.clauseSpan));expect(i).toBeGreaterThanOrEqual(0);const r=unused.splice(i,1)[0]!;expect([r.sectionId,r.subdivision,r.clauseSpan,r.clauseText]).toEqual([g.sectionId,g.subdivision,g.clauseSpan,g.clauseText]);for(const k of ['actor','modality','action','deadline'] as const)expect(r[k]).toEqual(g[k]);}}
});
