import { readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parsePacket } from '../src/core/packet';
import type { ObligationRow } from '../src/core/row';
import type { GoldLine } from '../eval/score';
import { score } from '../eval/score';
import { b0 } from '../eval/arms/b0';
import { rOrig } from '../eval/arms/r-orig';
import { rLatest } from '../eval/arms/r-latest';
import { renderReport } from '../eval/report';
import type { ArmReport } from '../eval/report';
import { queryDates,queryStratum } from '../eval/dates';
/** Dev-only deterministic runner. Hidden access belongs exclusively to the gated held-out entrypoint. */
const args=process.argv.slice(2),option=(name:string,fallback:string):string=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]??fallback;};
if(option('--split','dev')!=='dev')throw new Error('This entrypoint accepts dev only; hidden requires eval-heldout and admission');
if(option('--run-kind','measured')!=='measured')throw new Error('Rule execution is measured; authored/captured replay input uses separate tooling');
const root=resolve(import.meta.dirname,'..'),manifest=JSON.parse(readFileSync(join(root,'fixtures/MANIFEST.json'),'utf8')) as {enactments:{id:string;path:string}[]};
const gold:GoldLine[]=[],stateTexts:Record<string,string>={},strata:Record<string,string>={},predictions:Record<string,ObligationRow[]>={'B0':[],'R-orig':[],'R-latest':[]};
for(const entry of manifest.enactments){if(!/^E0[1-6]$/.test(entry.id)||entry.path!==`fixtures/dev/${entry.id}`)throw new Error('Unexpected dev fixture path');const dir=join(root,entry.path),packet=parsePacket(readFileSync(join(dir,'packet.json'),'utf8')),labels=readFileSync(join(dir,'gold.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line) as GoldLine);gold.push(...labels);
 for(const state of readdirSync(join(dir,'states')))for(const file of readdirSync(join(dir,'states',state)))stateTexts[`${entry.id}/${state}/${file.replace(/\.txt$/,'')}`]=readFileSync(join(dir,'states',state,file),'utf8');
 for(const date of queryDates(packet)){const triggerDates=labels.find(g=>g.asOf===date)?.triggerDates??{};strata[`${entry.id}@${date}`]=queryStratum(packet,date);predictions.B0!.push(...b0(packet,date,triggerDates));predictions['R-orig']!.push(...rOrig(packet,date,triggerDates));predictions['R-latest']!.push(...rLatest(packet,date,triggerDates));}
}
const arms:ArmReport[]=Object.entries(predictions).map(([arm,rows])=>({arm,runKind:'measured',score:score(gold,rows,{allGold:gold,stateTexts,strata})}));
const output=join(root,'results/dev/measured');mkdirSync(output,{recursive:true});writeFileSync(join(output,'results.md'),renderReport({split:'dev',runKind:'measured',arms}));writeFileSync(join(output,'scores.json'),JSON.stringify({split:'dev',runKind:'measured',arms},null,2)+'\n');for(const [arm,rows] of Object.entries(predictions))writeFileSync(join(output,`${arm}.jsonl`),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');console.log('Dev measured rule-arm artifacts written; no model arm was invoked.');
