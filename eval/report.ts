import type { RunKind } from '../src/core/row';
import type { ScoreResult } from './score';
import { rates } from './score';
import { bootstrap } from './bootstrap';
import { requireMeasured } from './runkind';
export interface ArmReport {arm:string;runKind:RunKind;score:ScoreResult}
export interface ReportInput {split:'dev'|'hidden';runKind:RunKind;arms:ArmReport[];defaultArm?:string;comparator?:string}
export function claimHolds(a:ScoreResult,b:ScoreResult):boolean{return a.tuple.f1>b.tuple.f1&&a.wrongVersion.assertionRate<=b.wrongVersion.assertionRate&&a.wrongVersion.queryRate<=b.wrongVersion.queryRate&&a.actionFidelity>=b.actionFidelity&&a.slotRecall>=b.slotRecall;}
/** This renderer is exclusively for results.md. Replays have a separate explicitly labelled renderer. */
export function renderReport(input:ReportInput):string{
 requireMeasured([input.runKind,...input.arms.map(a=>a.runKind)],input.split);
 const lines=[`# S46 ${input.split} measured results`,'','These measurements describe fictional supplied texts; they are not legal advice.','', '| Arm | Tuple P | Tuple R | Tuple F1 | Action fidelity | Slot recall | Wrong/assertion | Wrong/query | Known coverage |','|---|---:|---:|---:|---:|---:|---:|---:|---:|'];
 const fmt=(n:number):string=>n.toFixed(4);
 for(const a of input.arms){const s=a.score;lines.push(`| ${a.arm} | ${fmt(s.tuple.precision)} | ${fmt(s.tuple.recall)} | ${fmt(s.tuple.f1)} | ${fmt(s.actionFidelity)} | ${fmt(s.slotRecall)} | ${fmt(s.wrongVersion.assertionRate)} | ${fmt(s.wrongVersion.queryRate)} | ${s.coverage.known}/${s.coverage.fields} (${fmt(s.coverage.rate)}) |`);}
 for(const a of input.arms){const s=a.score,ci=bootstrap(s.perQuery,qs=>rates(qs.reduce((v,q)=>({tp:v.tp+q.tuple.tp,fp:v.fp+q.tuple.fp,fn:v.fn+q.tuple.fn}),{tp:0,fp:0,fn:0})).f1);lines.push('',`## ${a.arm}`,`Tuple F1 95% query-bootstrap interval: [${fmt(ci.low)}, ${fmt(ci.high)}]; seed ${ci.seed}, ${ci.iterations} resamples.`,`Secondary relaxed-action tuple F1: ${fmt(s.secondary.f1)}. Exact action accuracy: ${fmt(s.exactActionAccuracy)}.`,`Unknown precision/recall: ${fmt(s.unknown.precision)} / ${fmt(s.unknown.recall)}.`,`Gold known fields: ${s.coverage.goldKnown}/${s.coverage.goldFields}.`,`Exclusions: ${JSON.stringify(s.excluded)}.`,`Wrong-version denominators: ${s.wrongVersion.assertions} assertions, ${s.wrongVersion.queries} queries.`,`Date-boundary strata: ${JSON.stringify(s.strata)}.`);}
 if(input.split==='hidden'&&input.defaultArm&&input.comparator){const a=input.arms.find(x=>x.arm===input.defaultArm),b=input.arms.find(x=>x.arm===input.comparator);lines.push('',a&&b?`Preregistered four-condition claim: ${claimHolds(a.score,b.score)?'holds':'does not hold (tie or loss is published)'}.`:'Preregistered claim: not evaluated; required measured arms are missing.');}
 else lines.push('','No held-out claim is evaluated by this dev report.');return lines.join('\n')+'\n';
}
export function renderReplayReport(input:ReportInput):string{if(input.split==='hidden')throw new Error('Hidden replay reports are forbidden');if(input.runKind==='measured')throw new Error('Use the measured renderer');return `# S46 ${input.runKind}\n\nIllustrative replay only. No measured results or performance claim.\n\nArms: ${input.arms.map(a=>a.arm).join(', ')}\n`;}
