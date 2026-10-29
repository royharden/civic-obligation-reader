/** OWNER-ONLY, LOCAL dev measurement; no hidden/admission access. Import safe.
 * npx tsx scripts/eval-models.ts --run-kind measured --pilot-id <unique-id>
 * Source template remains models=null, approval=null, caps=0 (disabled).
 */
import {readFileSync,mkdirSync,lstatSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseStrictJson} from '../src/core/json-strict';
import {canonicalJSON} from '../src/core/canonical-json';
import type {Experiment} from '../eval/freeze';
import {Ledger} from '../eval/ledger';
import {acquireRunLock} from '../eval/lock';
import {runModelArm} from '../eval/arms/model-runner';
import {AnthropicProvider} from '../eval/providers/anthropic';
import {OpenAICompatibleProvider} from '../eval/providers/openai-compatible';
import {approvedModelSchedule,requirePilotId,currentPilotSource,ledgerRootFor,fullPilotMaximum,loadDevCorpus,codePredictions,pilotScores,pilotSummary,pilotConsolidation,deriveSelection,pilotConfigBinding,writePilotFile} from '../eval/pilot';
import type {PilotEvidence,PilotReceipt} from '../eval/pilot';
/** Explicit hooks make cap/schedule/lock ordering testable without calls or real files. */
export async function pilotOrder(hooks:{approve:()=>void;lock:()=>()=>void;schedule:()=>void;measure:()=>Promise<void>}):Promise<void>{
 hooks.approve();const release=hooks.lock();try{hooks.schedule();await hooks.measure();}finally{release();}
}
export async function runDevModels(repoInput:string,runKind:string,pilotId:string):Promise<{receiptSha256:string;selection:PilotReceipt['selection']}>{
 if(runKind!=='measured')throw new Error('Dev model pilot accepts measured only; replay is not selection evidence');requirePilotId(pilotId);
 const repo=realpathSync(repoInput),experiment=parseStrictJson(readFileSync(join(repo,'eval/experiment.json'),'utf8'),32) as unknown as Experiment;
 const arms=approvedModelSchedule(experiment); // cap=0/null models/missing approval stop before provider creation
 if(experiment.consumed||experiment.frozen)throw new Error('Dev pilot requires an unconsumed, not-yet-frozen edition');
 const files=currentPilotSource(repo),corpus=loadDevCorpus(repo),ledgerRoot=ledgerRootFor(repo,true),lockPath=join(ledgerRoot,'models.lock');
 let output:string|undefined,receiptSha256='',selection:PilotReceipt['selection']|undefined;
 await pilotOrder({approve:()=>{approvedModelSchedule(experiment);},lock:()=>acquireRunLock(lockPath),schedule:()=>{
 const ledger=new Ledger(join(ledgerRoot,`${experiment.experimentId}-dev.jsonl`),experiment.capsMicroUsd.dev,repo);fullPilotMaximum(arms,corpus.queries.length,ledger.remaining());
 if(canonicalJSON(currentPilotSource(repo))!==canonicalJSON(files))throw new Error('Source changed before dev dispatch');
 },measure:async()=>{
 const parent=join(ledgerRoot,'pilots');mkdirSync(parent,{recursive:true});if(lstatSync(parent).isSymbolicLink()||realpathSync(parent)!==parent)throw new Error('Invalid pilot output root');
 const candidate=join(parent,pilotId);mkdirSync(candidate,{recursive:false});output=candidate;mkdirSync(join(output,'raw'));
 const artifacts:Record<string,string>={},save=(path:string,value:unknown)=>{artifacts[path]=writePilotFile(join(output!,path),value);};
 save('started.json',{schemaVersion:'s46.dev-pilot-start.v1',runKind:'measured',split:'dev',pilotId,experimentId:experiment.experimentId,files,config:pilotConfigBinding(experiment)});
 const ledger=new Ledger(join(ledgerRoot,`${experiment.experimentId}-dev.jsonl`),experiment.capsMicroUsd.dev,repo);
 const predictions=codePredictions(corpus),evidence:PilotEvidence={runKind:'measured',split:'dev',queries:[],predictions};for(const a of arms)predictions[a.arm]=[];
 for(const q of corpus.queries){const queryId=`${q.packet.enactment.id}@${q.date}`,entry:PilotEvidence['queries'][number]={queryId,results:{}};evidence.queries.push(entry);
 for(const a of arms){const promptName=a.arm.startsWith('M1b')?'m1b':a.arm.toLowerCase(),prompt=readFileSync(join(repo,`eval/prompts/${promptName}.md`),'utf8');
 const result=await runModelArm(a.arm,q.packet,q.date,q.triggerDates,{provider:a.provider==='anthropic'?new AnthropicProvider():new OpenAICompatibleProvider(),ledger,bound:a,model:experiment.models[a.tier],prompt,runKind:'measured',lockPath,lockHeld:true,
 recordCompletion:response=>save(`raw/${a.arm}-${queryId.replace('@','_')}.json`,response)});
 entry.results[a.arm]=result;save(`${a.arm}-${queryId.replace('@','_')}.json`,{runKind:'measured',split:'dev',queryId,...result});
 if(result.status==='failed'||result.status==='not_run')throw new Error(`Required dev model arm ${a.arm} failed; no selection receipt; no automatic retry`);
 predictions[a.arm]!.push(...result.rows);
 }}
 save('evidence.json',evidence);save('consolidation.json',pilotConsolidation(corpus,evidence));
 const scores=pilotScores(corpus,predictions),statusCounts=pilotSummary(evidence);selection=deriveSelection(scores,statusCounts.H?.ok===corpus.queries.length);
 if(canonicalJSON(currentPilotSource(repo))!==canonicalJSON(files)||canonicalJSON(parseStrictJson(readFileSync(join(repo,'eval/experiment.json'),'utf8'),32))!==canonicalJSON(experiment))throw new Error('Source/config changed during dev measurement');
 const receipt:PilotReceipt={schemaVersion:'s46.dev-pilot.v1',runKind:'measured',split:'dev',pilotId,experimentId:experiment.experimentId,completedAt:new Date().toISOString(),config:pilotConfigBinding(experiment),files,
 queryIds:corpus.queries.map(q=>`${q.packet.enactment.id}@${q.date}`),artifacts,scores,statusCounts,selection};
 // Receipt published last; its SHA must be copied into experiment.selectionEvidence before freeze.
 receiptSha256=writePilotFile(join(output,'receipt.json'),receipt);
 }}).catch(error=>{if(output)writePilotFile(join(output,'failed.json'),{status:'failed',runKind:'measured',pilotId,message:error instanceof Error?error.message:'Dev pilot failed',reservationPolicy:'retained; no automatic retry'});throw error;});
 return {receiptSha256,selection:selection!};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),option=(flag:string)=>{const at=args.indexOf(flag);return at<0?'':args[at+1]??'';};
 runDevModels(resolve(import.meta.dirname,'..'),option('--run-kind'),option('--pilot-id')).then(result=>console.log(JSON.stringify({status:'measured-dev-only',...result}))).catch(()=>{console.error('Dev model pilot refused or failed. Preserve its ledger and artifacts; no receipt means no frozen selection.');process.exitCode=1;});
}
