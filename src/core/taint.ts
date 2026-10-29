import type { Reason, Taint, TaintReason } from './types';
import { assertNever } from './assert-never';
export function taintRank(reason:TaintReason):number {switch(reason){case 'amendment_conflict':return 4;case 'retroactive_unsupported':return 3;case 'amendment_unapplied':return 2;case 'dependency_tainted':return 1;default:return assertNever(reason);}}
export function highestTaint(taints:readonly Taint[],sectionId:string):TaintReason|null {let reason:TaintReason|null=null;for(const t of taints)if(t.sectionId===sectionId&&(reason===null||taintRank(t.reason)>taintRank(reason)))reason=t.reason;return reason;}
/** Canonical sorted list used in ruling keys; retain distinct reasons, collapse duplicate causes. */
export function taintKey(taints:readonly Taint[],sectionIds:readonly string[]):string {
 const ids=new Set(sectionIds),pairs=new Set(taints.filter(t=>ids.has(t.sectionId)).map(t=>JSON.stringify([t.sectionId,t.reason])));return pairs.size?`[${[...pairs].sort().join(',')}]`:'';
}
/** Exhaustive classification for callers handling the closed unknown-reason set. */
export function isVersionReason(reason:Reason):boolean {switch(reason){
 case 'amendment_conflict':case 'retroactive_unsupported':case 'amendment_unapplied':case 'dependency_tainted':case 'not_in_force':case 'version_unknown':return true;
 case 'actor_undefined':case 'actor_unstated':case 'actor_ambiguous':case 'deadline_anchor_unresolved':case 'deadline_unsupported':case 'conflicting_figures':case 'crossref_unresolved':case 'crossref_repealed':case 'reference_depth':case 'quote_not_found':case 'model_invalid':case 'screen_blocked':return false;
 default:return assertNever(reason);}}
