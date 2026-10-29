/** Local dev measurement and selection contracts. Importing performs no I/O or calls. */
import {readFileSync,readdirSync,lstatSync,realpathSync,mkdirSync,openSync,writeSync,fsyncSync,closeSync} from 'node:fs';
import {join,resolve,relative,isAbsolute,sep} from 'node:path';
import {canonicalJSON} from '../src/core/canonical-json';
import {parseStrictJson} from '../src/core/json-strict';
import {parsePacket} from '../src/core/packet';
import {asOf} from '../src/core/asof';
import {screenSource} from '../src/core/screen';
import {inventory} from '../src/core/extract';
import type {Packet} from '../src/core/types';
import type {ObligationRow} from '../src/core/row';
import {queryDates,queryStratum} from './dates';
import {score} from './score';
import type {GoldLine,ScoreResult} from './score';
import {repositorySourceInventory,sha256Bytes} from './freeze';
import type {Experiment,FrozenModelArm} from './freeze';
import {scheduleMaximum} from './ledger';
import {claimedResolution,consolidationOutcome} from './arms/model-runner';
import type {ModelResult} from './arms/model-runner';
import {verifyModelRows} from './arms/model-boundary';
import {b0} from './arms/b0';
import {rOrig} from './arms/r-orig';
import {rLatest} from './arms/r-latest';
import type {Completion} from './providers/port';
export const MODEL_ARMS=['M1a','M1b-small','M1b-mid','H'] as const;
export type Selection={strongerM1b:'M1b-small'|'M1b-mid';defaultArm:'B0'|'H'};
export interface DevQuery {packet:Packet;date:string;triggerDates:Record<string,string>}
export interface DevCorpus {queries:DevQuery[];gold:GoldLine[];stateTexts:Record<string,string>;strata:Record<string,string>}
export interface PilotQuery {queryId:string;results:Record<string,ModelResult>}
export interface PilotEvidence {runKind:'measured';split:'dev';queries:PilotQuery[];predictions:Record<string,ObligationRow[]>}
export interface PilotReceipt {
 schemaVersion:'s46.dev-pilot.v1';runKind:'measured';split:'dev';pilotId:string;experimentId:string;completedAt:string;
 config:ReturnType<typeof pilotConfigBinding>;files:Record<string,string>;queryIds:string[];
 artifacts:Record<string,string>;scores:Record<string,ScoreResult>;statusCounts:Record<string,Record<string,number>>;selection:Selection;
}
const equal=(a:unknown,b:unknown)=>canonicalJSON(a)===canonicalJSON(b);
const id=(s:unknown):s is string=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(s);
export function requirePilotId(value:string):void {if(!id(value))throw new Error('Invalid pilot id');}
/** Source config is disabled until the owner records an actual approval and positive allocation. */
export function approvedModelSchedule(experiment:Experiment):FrozenModelArm[]{
 const approval=experiment.ownerApproval;
 if(!approval||typeof approval.approvedBy!=='string'||!approval.approvedBy.trim()||typeof approval.approvalId!=='string'||!approval.approvalId.trim())throw new Error('Owner model/spend approval is missing');
 if(!id(experiment.experimentId)||!Number.isSafeInteger(experiment.capsMicroUsd.dev)||experiment.capsMicroUsd.dev<=0||!Number.isSafeInteger(experiment.capsMicroUsd.sealed)||experiment.capsMicroUsd.sealed<0||experiment.capsMicroUsd.dev+experiment.capsMicroUsd.sealed>40_000_000)throw new Error('Approved dev cap is disabled or invalid');
 if(!experiment.priceEdition||!['small','mid'].every(t=>typeof experiment.models[t as 'small'|'mid']==='string'&&experiment.models[t as 'small'|'mid']!.trim().length>0))throw new Error('Owner model ids/price edition are not configured');
 const arms=experiment.modelArms??[];
 if(arms.length!==MODEL_ARMS.length||new Set(arms.map(a=>a.arm)).size!==arms.length||MODEL_ARMS.some(a=>!arms.some(c=>c.arm===a)))throw new Error('Dev pilot requires all four configured model arms');
 for(const a of arms){if(!['anthropic','openai_compatible'].includes(a.provider)||!['small','mid'].includes(a.tier)||a.price.edition!==experiment.priceEdition||(a.arm==='M1b-small'&&a.tier!=='small')||(a.arm==='M1b-mid'&&a.tier!=='mid')||a.inputTokenBound<=0||a.outputTokenBound<=0)throw new Error('Unapproved model/price schedule');}
 scheduleMaximum(arms);return arms;
}
export function pilotConfigBinding(e:Experiment){return {experimentId:e.experimentId,models:e.models,priceEdition:e.priceEdition,modelArms:e.modelArms??[],capsMicroUsd:e.capsMicroUsd,ownerApproval:e.ownerApproval??null};}
export function fullPilotMaximum(arms:FrozenModelArm[],queries:number,remaining:number):number{
 if(!Number.isSafeInteger(queries)||queries<=0||!Number.isSafeInteger(remaining)||remaining<0)throw new Error('Invalid dev schedule');
 const maximum=BigInt(scheduleMaximum(arms))*BigInt(queries);
 if(maximum>BigInt(Number.MAX_SAFE_INTEGER)||maximum>BigInt(remaining))throw new Error('Full uncapped dev schedule exceeds remaining approved cap');return Number(maximum);
}
/** Missing/degenerate H evidence always keeps B0. M1b ties deliberately choose mid. */
export function deriveSelection(scores:Record<string,ScoreResult>,hAllQueriesOk:boolean):Selection{
 const small=scores['M1b-small'],mid=scores['M1b-mid'];
 const usable=(s:ScoreResult|undefined):s is ScoreResult=>!!s&&Number.isFinite(s.tuple.f1)&&s.tuple.f1>=0&&s.tuple.f1<=1&&s.tuple.tp+s.tuple.fn>0&&s.perQuery.length>0;
 if(!usable(small)||!usable(mid)||small.perQuery.length!==mid.perQuery.length)throw new Error('Measured M1b dev evidence is insufficient');
 const strongerM1b=small.tuple.f1>mid.tuple.f1?'M1b-small':'M1b-mid',b=scores.B0,h=scores.H;
 const eligible=hAllQueriesOk&&usable(b)&&usable(h)&&b.perQuery.length===h.perQuery.length&&b.wrongVersion.assertions>0&&h.wrongVersion.assertions>0&&b.wrongVersion.queries>0&&h.wrongVersion.queries>0&&b.perQuery.some(q=>q.actionSlots>0)&&h.perQuery.some(q=>q.actionSlots>0);
 const defaultArm=eligible&&h&&b&&h.tuple.f1>b.tuple.f1&&h.wrongVersion.assertionRate<=b.wrongVersion.assertionRate&&h.wrongVersion.queryRate<=b.wrongVersion.queryRate&&h.actionFidelity>=b.actionFidelity?'H':'B0';
 return {strongerM1b,defaultArm};
}
export function queryStrata(queries:readonly DevQuery[]):Record<string,string>{return Object.fromEntries(queries.map(q=>[`${q.packet.enactment.id}@${q.date}`,queryStratum(q.packet,q.date)]));}
export function loadDevCorpus(repo:string):DevCorpus{
 const manifest=parseStrictJson(readFileSync(join(repo,'fixtures/MANIFEST.json'),'utf8'),16) as unknown as {enactments:{id:string;path:string}[]};
 if(!Array.isArray(manifest.enactments)||manifest.enactments.length!==6||new Set(manifest.enactments.map(e=>e.id)).size!==6)throw new Error('Dev manifest must name E01-E06 exactly');
 const queries:DevQuery[]=[],gold:GoldLine[]=[],stateTexts:Record<string,string>={};
 for(const entry of manifest.enactments){if(!/^E0[1-6]$/.test(entry.id)||entry.path!==`fixtures/dev/${entry.id}`)throw new Error('Unexpected dev fixture');
 const dir=join(repo,entry.path),packet=parsePacket(readFileSync(join(dir,'packet.json'),'utf8'));
 if(packet.enactment.id!==entry.id)throw new Error('Dev packet id mismatch');
 const labels=readFileSync(join(dir,'gold.jsonl'),'utf8').trim().split('\n').map(line=>parseStrictJson(line,16) as unknown as GoldLine),dates=queryDates(packet);
 if(!equal([...new Set(labels.map(g=>g.asOf))].sort(),dates)||labels.some(g=>g.split!=='dev'||g.enactmentId!==entry.id||g.queryId!==`${entry.id}@${g.asOf}`))throw new Error('Dev gold/query schedule mismatch');
 gold.push(...labels);
 for(const state of readdirSync(join(dir,'states'))){if(!/^S[0-6]$/.test(state))throw new Error('Invalid dev state directory');for(const file of readdirSync(join(dir,'states',state))){if(!/^sec-\d+\.txt$/.test(file))throw new Error('Invalid dev section file');stateTexts[`${entry.id}/${state}/${file.slice(0,-4)}`]=readFileSync(join(dir,'states',state,file),'utf8');}}
 for(const date of dates){const lines=labels.filter(g=>g.asOf===date),triggerDates=lines[0]!.triggerDates;if(lines.some(g=>!equal(g.triggerDates,triggerDates)))throw new Error('Dev triggers differ');queries.push({packet,date,triggerDates});}}
 return {queries,gold,stateTexts,strata:queryStrata(queries)};
}
export function expectedSections(q:DevQuery,stateTexts:Record<string,string>):{sectionId:string;text:string}[]{
 const prefix=`${q.packet.enactment.id}/${asOf(q.packet,q.date).stateId}/`;
 return Object.entries(stateTexts).filter(([key])=>key.startsWith(prefix)).map(([key,text])=>({sectionId:key.slice(prefix.length),text}));
}
export function codePredictions(corpus:DevCorpus):Record<string,ObligationRow[]>{
 const rows:Record<string,ObligationRow[]>={B0:[],'R-orig':[],'R-latest':[]};for(const q of corpus.queries){rows.B0!.push(...b0(q.packet,q.date,q.triggerDates));rows['R-orig']!.push(...rOrig(q.packet,q.date,q.triggerDates));rows['R-latest']!.push(...rLatest(q.packet,q.date,q.triggerDates));}return rows;
}
export function pilotScores(corpus:DevCorpus,predictions:Record<string,ObligationRow[]>):Record<string,ScoreResult>{return Object.fromEntries(Object.entries(predictions).map(([arm,rows])=>[arm,score(corpus.gold,rows,{allGold:corpus.gold,stateTexts:corpus.stateTexts,strata:corpus.strata})]));}
export function pilotSummary(evidence:PilotEvidence){
 const counts:Record<string,Record<string,number>>={};for(const q of evidence.queries)for(const [arm,result] of Object.entries(q.results)){const c=counts[arm]??={};c[result.status]=(c[result.status]??0)+1;}
 return counts;
}
export function pilotConsolidation(corpus:DevCorpus,evidence:PilotEvidence){return Object.fromEntries(['M1b-small','M1b-mid'].map(arm=>[arm,corpus.queries.map((q,i)=>consolidationOutcome(evidence.queries[i]!.queryId,evidence.queries[i]!.results[arm]!,expectedSections(q,corpus.stateTexts)))]));}
/** Writes immutable, durable artifacts: never overwrite a pilot or repair a previous run. */
export function writePilotFile(path:string,value:unknown):string{
 const bytes=JSON.stringify(value,null,2)+'\n',fd=openSync(path,'wx',0o600);try{writeSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}return sha256Bytes(bytes);
}
/** Receipts/evidence include many queries and may exceed the packet parser's 128 KiB cap. */
function parseArtifactJson(bytes:Uint8Array):unknown {
 if(bytes.byteLength>20_000_000)throw new Error('Pilot artifact oversized');
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(text.charCodeAt(0)===0xfeff)throw new Error('Pilot BOM refused');return JSON.parse(text) as unknown;
}
export function validateSelectionReceipt(experiment:Experiment,receipt:PilotReceipt,receiptSha256:string):void {
 const binding=experiment.selectionEvidence;
 if(!binding||receiptSha256!==binding.receiptSha256)throw new Error('Pilot receipt hash changed');
 if(receipt.schemaVersion!=='s46.dev-pilot.v1'||receipt.runKind!=='measured'||receipt.split!=='dev'||receipt.pilotId!==binding.pilotId||receipt.experimentId!==experiment.experimentId||!equal(receipt.config,pilotConfigBinding(experiment))||!equal(receipt.files,experiment.files))throw new Error('Pilot source/model/price/approval edition changed or non-measured evidence');
 const selected=deriveSelection(receipt.scores,receipt.statusCounts.H?.ok===receipt.queryIds.length);
 if(!equal(selected,receipt.selection)||selected.defaultArm!==experiment.defaultArm||selected.strongerM1b!==experiment.strongerM1b)throw new Error('Frozen selection differs from measured dev derivation');
}
export function ledgerRootFor(repo:string,create=false):string{
 const outer=realpathSync(resolve(repo,'..')),root=join(outer,'eval-ledger');if(create)mkdirSync(root,{recursive:true});
 if(lstatSync(root).isSymbolicLink()||realpathSync(root)!==root)throw new Error('Invalid local ledger root');return root;
}
function artifactBytes(root:string,path:string):Uint8Array{
 if(isAbsolute(path)||path.split(/[\\/]/).some(p=>!p||p==='.'||p==='..')||!/^[-A-Za-z0-9_/.]+\.json$/.test(path))throw new Error('Invalid pilot artifact path');
 let file=root;for(const part of path.split('/')){file=join(file,part);if(lstatSync(file).isSymbolicLink())throw new Error('Pilot symlink refused');}
 const rel=relative(root,realpathSync(file));if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)||!lstatSync(file).isFile()||lstatSync(file).size>20_000_000)throw new Error('Pilot artifact escaped or oversized');return readFileSync(file);
}
/** Verify measured provenance, source/config/receipt hashes, and independently rederive choices.
 * Never accepts authored/captured replay as selection evidence. Does not contact a provider.
 */
export function verifyPilotSelection(experiment:Experiment,repo:string):PilotReceipt{
 approvedModelSchedule(experiment);
 const binding=experiment.selectionEvidence;if(!binding||!id(binding.pilotId)||!/^[a-f0-9]{64}$/.test(binding.receiptSha256))throw new Error('Frozen measured pilot selection evidence is missing');
 const ledger=ledgerRootFor(repo),root=join(ledger,'pilots',binding.pilotId);
 for(const path of [join(ledger,'pilots'),root])if(lstatSync(path).isSymbolicLink()||realpathSync(path)!==path)throw new Error('Invalid pilot receipt directory');
 const bytes=artifactBytes(root,'receipt.json');if(sha256Bytes(bytes)!==binding.receiptSha256)throw new Error('Pilot receipt hash changed');
 const receipt=parseArtifactJson(bytes) as PilotReceipt;validateSelectionReceipt(experiment,receipt,sha256Bytes(bytes));
 if(!receipt.artifacts||!Object.hasOwn(receipt.artifacts,'evidence.json'))throw new Error('Pilot measurement artifacts missing');
 const artifacts=new Map<string,unknown>();for(const [path,hash] of Object.entries(receipt.artifacts)){const content=artifactBytes(root,path);if(sha256Bytes(content)!==hash)throw new Error('Pilot measurement artifact changed');artifacts.set(path,parseArtifactJson(content));}
 const evidence=artifacts.get('evidence.json') as PilotEvidence,corpus=loadDevCorpus(repo),queryIds=corpus.queries.map(q=>`${q.packet.enactment.id}@${q.date}`);
 if(!evidence||evidence.runKind!=='measured'||evidence.split!=='dev'||!equal(receipt.queryIds,queryIds)||!equal(evidence.queries.map(q=>q.queryId),queryIds))throw new Error('Pilot measured query schedule changed');
 const rebuilt=codePredictions(corpus);
 for(const arm of MODEL_ARMS)rebuilt[arm]=[];
 for(let i=0;i<corpus.queries.length;i++){const q=corpus.queries[i]!,entry=evidence.queries[i]!;
 if(!equal(Object.keys(entry.results).sort(),[...MODEL_ARMS].sort()))throw new Error('Pilot model arms incomplete');
 for(const config of experiment.modelArms!){const result=entry.results[config.arm]!,raw=artifacts.get(`raw/${config.arm}-${entry.queryId.replace('@','_')}.json`) as Completion|undefined;
 if(!['ok','invalid','screen_blocked'].includes(result.status))throw new Error('Pilot has unfinished/non-measured model arm');
 const actual=asOf(q.packet,q.date),source=config.arm.startsWith('M1b')?JSON.stringify(q.packet):actual.provisions.map(p=>p.text).join('\n');
 if(result.status==='screen_blocked'){if(screenSource(source).allowed||raw||result.rows.length||result.claimedSections!==undefined)throw new Error('Pilot screen status inconsistent');continue;}
 if(config.arm==='H'&&inventory(q.packet,q.date).filter(c=>c.kind==='obligation').length>30){if(result.status!=='invalid'||raw||result.rows.length)throw new Error('Pilot candidate cap status inconsistent');continue;}
 if(!screenSource(source).allowed||!raw||raw.modelReturned!==experiment.models[config.tier])throw new Error('Pilot lacks actual configured model response');
 let proposed:ReturnType<typeof claimedResolution>|undefined;try{proposed=config.arm.startsWith('M1b')?claimedResolution(raw.value,actual):undefined;const rows=verifyModelRows(raw.value,q.packet,q.date,q.triggerDates,config.arm,'measured',proposed);
 if(result.status!=='ok'||!equal(rows,result.rows))throw new Error('Pilot verified response differs from predictions');
 }catch(error){if(!(error instanceof Error)||!error.message.startsWith('model_invalid')||result.status!=='invalid'||result.rows.length)throw error;}
 const claims=proposed?.provisions.map(({sectionId,path,heading,text})=>({sectionId,path,heading,text}));if(!equal(claims??null,result.claimedSections??null))throw new Error('Pilot consolidation claims were repaired or lost');
 if(config.arm.startsWith('M1b')){const status=proposed?'valid':raw.value!==null&&typeof raw.value==='object'&&Object.hasOwn(raw.value,'sections')?'invalid':'missing';if(result.claimsStatus!==status)throw new Error('Pilot consolidation status differs from raw response');}
 rebuilt[config.arm]!.push(...result.rows);
 }}
 if(!equal(evidence.predictions,rebuilt))throw new Error('Pilot predictions differ from measured/code evidence');
 const scores=pilotScores(corpus,rebuilt),counts=pilotSummary(evidence),selection=deriveSelection(scores,counts.H?.ok===queryIds.length);
 if(!equal(scores,receipt.scores)||!equal(counts,receipt.statusCounts)||!equal(selection,receipt.selection)||selection.defaultArm!==experiment.defaultArm||selection.strongerM1b!==experiment.strongerM1b)throw new Error('Frozen selection differs from measured dev derivation');
 // Full current source rechecked by heldout immediately before this method and consume.
 return receipt;
}
export function currentPilotSource(repo:string):Record<string,string>{const files=repositorySourceInventory(repo);for(const required of ['docs/LABELLING-GUIDE.md','fixtures/MANIFEST.json',...Array.from({length:6},(_,i)=>`fixtures/dev/E0${i+1}/packet.json`)])if(!Object.hasOwn(files,required))throw new Error('Pilot source lacks guide/dev inventory');return files;}
