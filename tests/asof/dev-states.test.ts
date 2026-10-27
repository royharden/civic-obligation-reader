/** Builder-visible six-enactment regression states only. Authored, NOT executed. */
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {describe,it,expect} from 'vitest';
import {parsePacket} from '../../src/core/packet';
import {asOf,statePeriods} from '../../src/core/asof';
const dev=fileURLToPath(new URL('../../fixtures/dev/',import.meta.url));
describe('DEV-STATES: all six hand-written consolidated states',()=>{
 for(const id of ['E01','E02','E03','E04','E05','E06'])it(`${id}: every state byte-for-byte and no extra/repealed sections`,()=>{
 const root=join(dev,id),p=parsePacket(readFileSync(join(root,'packet.json'),'utf8'));
 const periods=statePeriods(p);expect(periods.map(s=>s.stateId)).toEqual(readdirSync(join(root,'states')).sort());
 for(const period of periods){const resolution=asOf(p,period.from);const dir=join(root,'states',period.stateId);const names=readdirSync(dir).filter(n=>n.endsWith('.txt')).sort();expect(resolution.provisions.map(s=>`${s.sectionId}.txt`).sort()).toEqual(names);for(const s of resolution.provisions)expect(s.text).toBe(readFileSync(join(dir,`${s.sectionId}.txt`),'utf8'));}
 });
});
it('E01-BOUNDARIES: 30→45 days; pending does not mutate source; definition later changes',()=>{const p=parsePacket(readFileSync(join(dev,'E01','packet.json'),'utf8'));const before=asOf(p,'2026-03-31'),after=asOf(p,'2026-04-01'),pending=asOf(p,'2026-04-30'),latest=asOf(p,'2026-06-01');expect(before.provisions.find(s=>s.sectionId==='sec-3')?.text).toContain('thirty (30)');expect(after.provisions.find(s=>s.sectionId==='sec-3')?.text).toContain('forty-five (45)');expect(pending.pending.map(a=>a.amendmentId)).toEqual(['A3']);expect(pending.stateHash).toBe(after.stateHash);expect(latest.provisions.find(s=>s.sectionId==='sec-1')?.text).toContain('or a food truck');expect(after.provisions.find(s=>s.sectionId==='sec-5')?.tainted).toBe('amendment_unapplied');});
