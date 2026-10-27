/** The sole held-out unseal entrypoint. Importing this file performs no I/O or dispatch.
 * Owner command, ONLY after admission/spend approval and freeze:
 *   npx tsx scripts/eval-heldout.ts --run-kind measured
 */
import {readFileSync,readdirSync,lstatSync,realpathSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parseStrictJson} from '../src/core/json-strict';
import {parsePacket} from '../src/core/packet';
import {asOf} from '../src/core/asof';
import type {Packet} from '../src/core/types';
import type {ObligationRow} from '../src/core/row';
import {canonicalJSON} from '../src/core/canonical-json';
import {verifyRepositoryFreeze,sha256Bytes} from '../eval/freeze';
import type {Experiment,FrozenModelArm} from '../eval/freeze';
import {Ledger,scheduleMaximum} from '../eval/ledger';
import {acquireRunLock} from '../eval/lock';
import {consumeBeforeDispatch} from '../eval/consume';
import {queryDates,queryStratum} from '../eval/dates';
import {verifyPilotSelection} from '../eval/pilot';
import {score} from '../eval/score';
import type {Contested,GoldLine} from '../eval/score';
import {renderReport} from '../eval/report';
import type {ArmReport} from '../eval/report';
import {b0} from '../eval/arms/b0';
import {rOrig} from '../eval/arms/r-orig';
import {rLatest} from '../eval/arms/r-latest';
import {runModelArm,consolidationOutcome} from '../eval/arms/model-runner';
import type {ModelResult} from '../eval/arms/model-runner';
import {AnthropicProvider} from '../eval/providers/anthropic';
import {OpenAICompatibleProvider} from '../eval/providers/openai-compatible';
type FileHash={path:string;sha256:string};
interface AReceipt {schemaVersion:string;guideSha256:string;enactments:{id:string;queries:number;files:FileHash[]}[];totals:{enactments:number;files:number}}
interface Admission {schemaVersion:string;verdict:string;guideSha256:string;bindings:{aReceiptSha256:string;rSealSha256:string};contested:{sha256:string;count:number;byField:Record<Contested['field'],number>}}
const FIELDS=['actor','modality','action','deadline','kind'] as const;
const object=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function utf8(bytes:Uint8Array):string {if(bytes[0]===239&&bytes[1]===187&&bytes[2]===191)throw new Error('BOM forbidden');return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
function json(bytes:Uint8Array):unknown {return parseStrictJson(utf8(bytes),16);}
/** Content-free binding checked before opening any hidden data. */
export function validateContested(bytes:Uint8Array,summary:Admission['contested']):Contested[] {
 if(sha256Bytes(bytes)!==summary.sha256)throw new Error('CONTESTED hash changed');const value=json(bytes);
 if(!Array.isArray(value)||value.length!==summary.count)throw new Error('CONTESTED count changed');const counts=Object.fromEntries(FIELDS.map(f=>[f,0])) as Record<Contested['field'],number>;
 const entries:Contested[]=[],slots=new Map<string,Set<string>>();let prior='';
 for(const entry of value){if(!object(entry)||Object.keys(entry).sort().join(',')!=='field,queryId,slotId'||typeof entry.queryId!=='string'||typeof entry.slotId!=='string'||!FIELDS.includes(entry.field as never))throw new Error('CONTESTED shape');
 const c=entry as unknown as Contested,key=canonicalJSON([c.queryId,c.slotId,c.field]);if(prior&&key<=prior)throw new Error('CONTESTED must be unique and sorted');prior=key;const slot=canonicalJSON([c.queryId,c.slotId]),fields=slots.get(slot)??new Set<string>();fields.add(c.field);slots.set(slot,fields);counts[c.field]++;entries.push(c);}
 if([...slots.values()].some(fs=>fs.has('kind')&&fs.size!==1)||FIELDS.some(f=>counts[f]!==summary.byField[f]))throw new Error('CONTESTED field counts changed');return entries;
}
export function frozenSchedule(experiment:Experiment,queries:number,remaining:number):{arms:FrozenModelArm[];maximum:number} {
 if(!Number.isSafeInteger(queries)||queries<1||!Number.isSafeInteger(remaining)||remaining<0)throw new Error('Invalid sealed schedule');
 const arms=experiment.modelArms??[];if(experiment.capsMicroUsd.sealed===0||!experiment.priceEdition||!experiment.strongerM1b||!arms.length)throw new Error('Sealed model schedule not configured; no unseal');
 const seen=new Set<string>();for(const a of arms){if(!['M1a','M1b-small','M1b-mid','H'].includes(a.arm)||seen.has(a.arm)||!['anthropic','openai_compatible'].includes(a.provider)||!['small','mid'].includes(a.tier)||!experiment.models[a.tier]||a.price.edition!==experiment.priceEdition)throw new Error('Unfrozen model schedule');
 if(a.arm==='M1b-small'&&a.tier!=='small'||a.arm==='M1b-mid'&&a.tier!=='mid')throw new Error('M1b tier mismatch');seen.add(a.arm);}
 if(!seen.has(experiment.strongerM1b)||(experiment.defaultArm==='H'&&!seen.has('H')))throw new Error('Required claim arms not scheduled');
 const full=BigInt(scheduleMaximum(arms))*BigInt(queries);if(full>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Schedule overflow');const maximum=Number(full);if(maximum>remaining)throw new Error('Full uncapped sealed schedule exceeds remaining cap');return {arms,maximum};
}
function inside(root:string,path:string):boolean {const r=relative(root,path);return r!==''&&!isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep);}
function regular(root:string,path:string,maxBytes=200000):Uint8Array {
 const target=resolve(root,path);if(!inside(root,target))throw new Error('Path escaped custody root');let current=root;for(const part of relative(root,target).split(sep)){current=join(current,part);if(lstatSync(current).isSymbolicLink())throw new Error('Symlink in custody path');}
 const stat=lstatSync(target);if(!stat.isFile()||stat.size>maxBytes)throw new Error('Invalid custody file');return readFileSync(target);
}
/** Called only after the consume marker. Returns immutable byte snapshots, not paths to re-read. */
export function verifyHiddenInventory(outer:string,expected:readonly FileHash[]):Map<string,Uint8Array> {
 const root=join(outer,'heldout-sealed');if(lstatSync(root).isSymbolicLink()||realpathSync(root)!==root)throw new Error('Hidden root is a symlink');
 const wanted=new Map<string,string>();for(const f of expected){if(!/^heldout-sealed\/H(?:0[1-9]|10)\/(?:packet\.json|gold\.jsonl|TRAPS\.md|states\/S[0-6]\/sec-\d+\.txt)$/.test(f.path)||!/^\w{64}$/.test(f.sha256)||!/^[a-f0-9]+$/.test(f.sha256)||wanted.has(f.path))throw new Error('Invalid or duplicate receipt path');wanted.set(f.path,f.sha256);}
 const found:string[]=[];const walk=(dir:string):void=>{for(const name of readdirSync(dir)){const path=join(dir,name),stat=lstatSync(path);if(stat.isSymbolicLink())throw new Error('Hidden symlink');if(!inside(root,realpathSync(path)))throw new Error('Hidden path escaped');if(stat.isDirectory())walk(path);else if(stat.isFile()){const rel=relative(outer,path).split(sep).join('/');if(rel==='heldout-sealed/README.md')continue;found.push(rel);}else throw new Error('Unsupported hidden file');}};walk(root);
 if(found.length!==wanted.size||found.some(path=>!wanted.has(path)))throw new Error('Hidden inventory differs from A receipt');
 const snapshot=new Map<string,Uint8Array>();for(const path of found){const bytes=regular(outer,path);if(sha256Bytes(bytes)!==wanted.get(path))throw new Error('Hidden file hash changed');snapshot.set(path,bytes);}return snapshot;
}
/** Makes ordering independently testable without opening a real custody folder. */
export async function sealedOrder<T>(hooks:{preflight:()=>void;consume:()=>void;unseal:()=>T;dispatch:(data:T)=>Promise<void>}):Promise<void> {hooks.preflight();hooks.consume();const data=hooks.unseal();await hooks.dispatch(data);}
function runAdmission(repo:string):void {const result=spawnSync(process.execPath,['--experimental-strip-types',join(repo,'tools/admit.ts'),'--json'],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});if(result.status!==0)throw new Error('Admission is not GO');const output=JSON.parse(result.stdout) as {tool?:string;verdict?:string};if(output.tool!=='admit'||output.verdict!=='GO')throw new Error('Admission is not GO');}
interface Query {packet:Packet;date:string;triggerDates:Record<string,string>}
interface HiddenData {gold:GoldLine[];queries:Query[];stateTexts:Record<string,string>;contested:Contested[];strata:Record<string,string>}
function loadHidden(snapshot:Map<string,Uint8Array>,receipt:AReceipt,contested:Contested[]):HiddenData {
 const gold:GoldLine[]=[],queries:Query[]=[],stateTexts:Record<string,string>={},strata:Record<string,string>={};const get=(path:string):Uint8Array=>{const b=snapshot.get(path);if(!b)throw new Error('Missing required hidden file');return b;};
 for(const entry of receipt.enactments){const prefix=`heldout-sealed/${entry.id}`,packet=parsePacket(utf8(get(`${prefix}/packet.json`)));if(packet.enactment.id!==entry.id)throw new Error('Packet/receipt id mismatch');
 const labels=utf8(get(`${prefix}/gold.jsonl`)).trim().split('\n').map(line=>json(new TextEncoder().encode(line)) as unknown as GoldLine);const dates=queryDates(packet);
 if(dates.length!==entry.queries||canonicalJSON([...new Set(labels.map(g=>g.asOf))].sort())!==canonicalJSON(dates))throw new Error('Hidden queries differ from admitted schedule');
 const slots=new Set<string>();for(const g of labels){if(g.goldSchemaVersion!=='s46.gold.v1'||g.split!=='hidden'||g.enactmentId!==entry.id||g.queryId!==`${entry.id}@${g.asOf}`||!['obligation','negative','no_rows'].includes(g.kind)||g.contested!==false||slots.has(`${g.queryId}|${g.slotId}`))throw new Error('Hidden gold binding/shape');slots.add(`${g.queryId}|${g.slotId}`);}
 for(const date of dates){const lines=labels.filter(g=>g.asOf===date),triggers=lines[0]!.triggerDates;if(!object(triggers)||lines.some(g=>canonicalJSON(g.triggerDates)!==canonicalJSON(triggers)))throw new Error('Per-query triggers differ');queries.push({packet,date,triggerDates:triggers});strata[`${entry.id}@${date}`]=queryStratum(packet,date);}
 gold.push(...labels);for(const [path,bytes] of snapshot){const m=new RegExp(`^${prefix}/states/(S[0-6])/(sec-\\d+)\\.txt$`).exec(path);if(m)stateTexts[`${entry.id}/${m[1]}/${m[2]}`]=utf8(bytes);}}
 for(const c of contested)if(!gold.some(g=>g.queryId===c.queryId&&g.slotId===c.slotId&&g.kind!=='no_rows'))throw new Error('CONTESTED names an absent A slot');
 return {gold,queries,stateTexts,contested,strata};
}
export async function runHeldout(repoInput:string,runKind:string):Promise<void> {
 if(runKind!=='measured')throw new Error('Hidden split accepts measured only');const repo=realpathSync(repoInput),outer=realpathSync(resolve(repo,'..'));
 const experiment=json(regular(repo,'eval/experiment.json')) as unknown as Experiment;verifyRepositoryFreeze(experiment,repo);
 for(const required of ['docs/LABELLING-GUIDE.md','fixtures/MANIFEST.json',...Array.from({length:6},(_,i)=>`fixtures/dev/E0${i+1}/packet.json`)])if(!Object.hasOwn(experiment.files,required))throw new Error('Freeze lacks guide/dev inventory');
 verifyPilotSelection(experiment,repo); // choices must be derived from the bound measured dev receipt before admission/consume
 runAdmission(repo);
 const aBytes=regular(outer,'admission/A-RECEIPT.json'),sealBytes=regular(outer,'admission/R-SEAL.json'),admission=json(regular(outer,'admission/ADMISSION.json')) as unknown as Admission,receipt=json(aBytes) as unknown as AReceipt;
 if(admission.schemaVersion!=='s46.admission.v1'||admission.verdict!=='GO'||receipt.schemaVersion!=='s46.a-receipt.v1'||admission.bindings.aReceiptSha256!==sha256Bytes(aBytes)||admission.bindings.rSealSha256!==sha256Bytes(sealBytes)||admission.guideSha256!==experiment.files['docs/LABELLING-GUIDE.md']||receipt.guideSha256!==admission.guideSha256)throw new Error('Admission binding changed');
 if(!Array.isArray(receipt.enactments)||receipt.enactments.length!==10||receipt.enactments.some((e,i)=>e.id!==`H${String(i+1).padStart(2,'0')}`||!Number.isSafeInteger(e.queries)||e.queries<1)||receipt.totals.enactments!==10)throw new Error('Incomplete A receipt schedule');
 const files=receipt.enactments.flatMap(e=>e.files);if(files.length!==receipt.totals.files||receipt.enactments.some(e=>e.files.some(f=>!f.path.startsWith(`heldout-sealed/${e.id}/`))))throw new Error('A receipt inventory/count mismatch');
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(experiment.experimentId))throw new Error('Invalid edition id');
 const ledgerRoot=realpathSync(join(outer,'eval-ledger'));if(lstatSync(join(outer,'eval-ledger')).isSymbolicLink()||!inside(outer,ledgerRoot))throw new Error('Invalid ledger root');
 const lockPath=join(ledgerRoot,'models.lock'),release=acquireRunLock(lockPath);let output:string|undefined,consumed=false;
 try {const ledger=new Ledger(join(ledgerRoot,`${experiment.experimentId}.jsonl`),experiment.capsMicroUsd.sealed,repo);const totalQueries=receipt.enactments.reduce((n,e)=>n+e.queries,0),schedule=frozenSchedule(experiment,totalQueries,ledger.remaining());
 await sealedOrder({preflight:()=>{verifyRepositoryFreeze(experiment,repo);verifyPilotSelection(experiment,repo);},consume:()=>{consumeBeforeDispatch(join(ledgerRoot,`consumed-${experiment.experimentId}.json`),experiment.experimentId);consumed=true;},unseal:()=>{
 const contested=validateContested(regular(outer,'admission/CONTESTED.json'),admission.contested);return loadHidden(verifyHiddenInventory(outer,files),receipt,contested);},dispatch:async data=>{
 let parent=repo;for(const part of ['results','hidden','measured']){const next=join(parent,part);mkdirSync(next,{recursive:true});if(lstatSync(next).isSymbolicLink()||!inside(repo,realpathSync(next)))throw new Error('Results path escaped repository');parent=next;}
 output=join(parent,experiment.experimentId);mkdirSync(output,{recursive:false});const save=(name:string,value:unknown)=>writeFileSync(join(output!,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 save('run.json',{status:'running',runKind:'measured',experimentId:experiment.experimentId,maximumScheduleMicroUsd:schedule.maximum,queryCount:data.queries.length});
 const rows:Record<string,ObligationRow[]>={'B0':[],'R-orig':[],'R-latest':[]};const statuses:Record<string,{queryId:string;result:ModelResult}[]>={};const consolidation:Record<string,ReturnType<typeof consolidationOutcome>[]>={};
 for(const q of data.queries){const queryId=`${q.packet.enactment.id}@${q.date}`;rows.B0!.push(...b0(q.packet,q.date,q.triggerDates));rows['R-orig']!.push(...rOrig(q.packet,q.date,q.triggerDates));rows['R-latest']!.push(...rLatest(q.packet,q.date,q.triggerDates));
 for(const config of schedule.arms){const promptName=config.arm.startsWith('M1b')?'m1b':config.arm.toLowerCase();const prompt=utf8(regular(repo,`eval/prompts/${promptName}.md`));const result=await runModelArm(config.arm,q.packet,q.date,q.triggerDates,{provider:config.provider==='anthropic'?new AnthropicProvider():new OpenAICompatibleProvider(),ledger,bound:config,model:experiment.models[config.tier],prompt,runKind:'measured',lockPath,lockHeld:true});
 (statuses[config.arm]??=[]).push({queryId,result});save(`${config.arm}-${queryId.replace('@','_')}.json`,{runKind:'measured',queryId,...result});
 if(result.status==='failed'||result.status==='not_run')throw new Error(`Required model arm ${config.arm} did not complete; sealed run stopped`);
 (rows[config.arm]??=[]).push(...result.rows);if(config.arm.startsWith('M1b')){const state=asOf(q.packet,q.date).stateId,prefix=`${q.packet.enactment.id}/${state}/`;const expected=Object.entries(data.stateTexts).filter(([key])=>key.startsWith(prefix)).map(([key,text])=>({sectionId:key.slice(prefix.length),text}));(consolidation[config.arm]??=[]).push(consolidationOutcome(queryId,result,expected));}}}
 const reports:ArmReport[]=Object.entries(rows).map(([arm,predictions])=>({arm,runKind:'measured',score:score(data.gold,predictions,{contested:data.contested,allGold:data.gold,stateTexts:data.stateTexts,strata:data.strata})}));
 save('scores.json',{runKind:'measured',reports,statuses,consolidation,contestedCount:data.contested.length});for(const [arm,predictions] of Object.entries(rows))save(`${arm}.json`,{runKind:'measured',rows:predictions});
 const statusLines=Object.entries(statuses).map(([arm,entries])=>`${arm}: ${entries.filter(e=>e.result.status==='screen_blocked').length} screened; ${entries.filter(e=>e.result.status==='invalid').length} invalid; ${entries.length} scheduled queries (empty predictions remain scored).`);
 const consolidationLines=Object.entries(consolidation).map(([arm,entries])=>`${arm} consolidation: ${entries.filter(e=>e.exact).length}/${entries.length} byte-exact queries; missing, invalid and screened claims remain in the denominator.`);
 writeFileSync(join(output,'results.md'),renderReport({split:'hidden',runKind:'measured',arms:reports,defaultArm:experiment.defaultArm,comparator:experiment.strongerM1b??undefined})+'\n'+statusLines.concat(consolidationLines).join('\n\n')+'\n',{flag:'wx'});save('complete.json',{status:'complete',experimentId:experiment.experimentId});
 }});
 }catch(error){const failure={status:'failed',experimentId:experiment.experimentId,consumed,message:error instanceof Error?error.message:'sealed run failed'};if(output)writeFileSync(join(output,'failed.json'),JSON.stringify(failure)+'\n',{flag:'wx'});else if(consumed)writeFileSync(join(ledgerRoot,`failed-${experiment.experimentId}.json`),JSON.stringify(failure)+'\n',{flag:'wx'});throw error;}finally{release();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2),at=args.indexOf('--run-kind');if(at<0)throw new Error('Explicit --run-kind measured is required');runHeldout(resolve(import.meta.dirname,'..'),args[at+1]??'').catch(()=>{console.error('Sealed run refused or failed; edition remains consumed if unseal began. Consult the durable run record.');process.exitCode=1;});}
