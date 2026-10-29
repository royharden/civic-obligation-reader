import type { Amendment, AmendmentRef, Packet, Resolution, Section, StatePeriod, Taint, TaintReason, TraceStep } from './types';
import { applyAmendment } from './apply';
import { canonicalJSON } from './canonical-json';
import { sha256 } from './hash';
import { highestTaint } from './taint';
import { isValidDate } from './dates';
export function statePeriods(packet:Packet):StatePeriod[] {
 const e=packet.enactment;const boundaries=[...new Set([e.commencesOn,...e.amendments.map(a=>a.effectiveOn)])].sort();
 return boundaries.map((from,i)=>({stateId:`S${i}`,from,toExclusive:boundaries[i+1]??e.sunsetExclusive}));
}
const ref=(a:Amendment,reason?:TaintReason):AmendmentRef=>reason===undefined?{amendmentId:a.amendmentId,enactedOn:a.enactedOn,effectiveOn:a.effectiveOn}:{amendmentId:a.amendmentId,enactedOn:a.enactedOn,effectiveOn:a.effectiveOn,reason};
/** Requires a validated packet; date must be an actual Gregorian day. */
export function asOf(packet:Packet,date:string):Resolution {
 if(!isValidDate(date))throw new RangeError('Invalid as-of date');const e=packet.enactment;
 const pending=e.amendments.filter(a=>a.enactedOn<=date&&date<a.effectiveOn).map(a=>ref(a));
 if(date<e.commencesOn||(e.sunsetExclusive!==null&&date>=e.sunsetExclusive))return {asOf:date,status:'not_in_force',stateId:null,stateHash:sha256(canonicalJSON({enactmentId:e.id,stateId:null,provisions:[],appliedAmendmentIds:[],taints:[]})),provisions:[],pending,unapplied:[],taints:[],trace:[]};
 let sections:Section[]=e.sections.map(s=>({...s}));const taints:Taint[]=[],unapplied:AmendmentRef[]=[],trace:TraceStep[]=[],appliedAmendmentIds:string[]=[];
 const mark=(a:Amendment,reason:TaintReason,onlyClean=false,detail?:string):void=>{
 for(const sectionId of a.affectedSectionIds)if(!onlyClean||highestTaint(taints,sectionId)===null)taints.push({sectionId,reason,amendmentId:a.amendmentId,from:a.effectiveOn});
 unapplied.push(ref(a,reason));trace.push({amendmentId:a.amendmentId,effectiveOn:a.effectiveOn,status:'unapplied',reason,...(detail===undefined?{}:{detail})});};
 for(const period of statePeriods(packet)){if(period.from>date)break;const group=e.amendments.filter(a=>a.effectiveOn===period.from);
 const normal:Amendment[]=[];for(const a of group){if(a.effectiveOn<a.enactedOn)mark(a,'retroactive_unsupported');else normal.push(a);}
 const conflict=new Set<string>();for(let i=0;i<normal.length;i++)for(let j=i+1;j<normal.length;j++){const a=normal[i]!,b=normal[j]!;if(a.affectedSectionIds.some(id=>b.affectedSectionIds.includes(id))&&!(a.order!==undefined&&b.order!==undefined&&a.order!==b.order)){conflict.add(a.amendmentId);conflict.add(b.amendmentId);}}
 for(const a of normal)if(conflict.has(a.amendmentId))mark(a,'amendment_conflict');
 const remaining=normal.filter(a=>!conflict.has(a.amendmentId)).sort((a,b)=>{if(a.order!==undefined&&b.order!==undefined)return a.order-b.order;if(a.order!==undefined)return -1;if(b.order!==undefined)return 1;return a.amendmentId<b.amendmentId?-1:a.amendmentId>b.amendmentId?1:0;});
 for(const a of remaining){if(a.affectedSectionIds.some(id=>highestTaint(taints,id)!==null)){mark(a,'dependency_tainted',true);continue;}const result=applyAmendment(sections,a);if(!result.ok){mark(a,'amendment_unapplied',false,result.detail);continue;}sections=result.sections;appliedAmendmentIds.push(a.amendmentId);trace.push({amendmentId:a.amendmentId,effectiveOn:a.effectiveOn,status:'applied'});}}
 const stateId=statePeriods(packet).find(p=>p.from<=date&&(p.toExclusive===null||date<p.toExclusive))!.stateId;
 const provisions=sections.map(s=>({...s,tainted:highestTaint(taints,s.sectionId)}));
 const stateHash=sha256(canonicalJSON({enactmentId:e.id,stateId,provisions,appliedAmendmentIds,taints}));return {asOf:date,status:'in_force',stateId,stateHash,provisions,pending,unapplied,taints,trace};
}
